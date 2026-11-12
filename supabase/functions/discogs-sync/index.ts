import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

// Mirrors the owner's Discogs collection and wantlist into record_items, and
// fills in per-release tracklists in discogs_releases.
//
// Request body (all optional):
//   {}                         sync both lists, then backfill tracklists
//   { list: 'collection' }     sync one list, then backfill tracklists
//   { tracklistsOnly: true }   skip the list sync, only backfill tracklists
//   { releaseId: 123 }         fetch (if needed) and return one tracklist now
//
// Tracklists need one Discogs request per release and Discogs allows 60 a
// minute, so each call backfills only what fits in TRACKLIST_BUDGET_MS and
// reports how many are still missing; callers repeat until that reaches 0.
//
// Secrets: DISCOGS_TOKEN, DISCOGS_USERNAME. SUPABASE_URL and
// SUPABASE_SERVICE_ROLE_KEY are provided by the runtime.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const DISCOGS_BASE = 'https://api.discogs.com';
// Discogs rejects requests without an identifying User-Agent.
const USER_AGENT = 'Listful/1.0';
const PER_PAGE = 100;
const UPSERT_CHUNK = 500;
const DB_PAGE = 1000;
// Supabase drops requests that haven't responded within 150s.
const TRACKLIST_BUDGET_MS = 90_000;

type List = 'collection' | 'wantlist';

interface BasicInformation {
  id: number;
  title: string;
  year?: number;
  cover_image?: string;
  thumb?: string;
  artists?: { name: string; anv?: string }[];
  labels?: { name: string; catno?: string }[];
  formats?: { name: string; qty?: string; descriptions?: string[] }[];
  genres?: string[];
  styles?: string[];
}

interface DiscogsEntry {
  id: number;
  date_added?: string;
  rating?: number;
  basic_information: BasicInformation;
}

interface DiscogsListPage {
  pagination: { page: number; pages: number };
  releases?: DiscogsEntry[];
  wants?: DiscogsEntry[];
}

interface DiscogsTrack {
  position?: string;
  type_?: string;
  title?: string;
  duration?: string;
  artists?: { name: string; anv?: string }[];
  sub_tracks?: DiscogsTrack[];
}

interface Track {
  position: string | null;
  title: string;
  duration: string | null;
  type: 'track' | 'heading' | 'index';
  artists: string | null;
  sub_tracks?: Track[];
}

class NotFound extends Error {}

function respond(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Discogs disambiguates same-named artists as "Name (2)"; strip that suffix.
const cleanArtist = (name: string) => name.replace(/\s\(\d+\)$/, '');

// Missing artwork comes back as a spacer.gif placeholder rather than empty.
const imageOrNull = (url?: string) => (url && !url.includes('spacer.gif') ? url : null);

function uniq(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function joinArtists(artists?: { name: string; anv?: string }[]): string | null {
  return artists?.length ? uniq(artists.map((a) => cleanArtist(a.anv || a.name))).join(', ') : null;
}

function describeFormats(formats: BasicInformation['formats']): string | null {
  if (!formats?.length) return null;
  return formats
    .map((f) => {
      const qty = f.qty && f.qty !== '1' ? `${f.qty}× ` : '';
      const desc = f.descriptions?.length ? ` (${f.descriptions.join(', ')})` : '';
      return `${qty}${f.name}${desc}`;
    })
    .join(' + ');
}

function describeLabels(labels: BasicInformation['labels']): string | null {
  if (!labels?.length) return null;
  return uniq(labels.map((l) => (l.catno && l.catno !== 'none' ? `${l.name} – ${l.catno}` : l.name))).join(', ');
}

async function discogsGet<T>(path: string, token: string): Promise<T> {
  // Authenticated clients get 60 requests per rolling minute. Slow down as the
  // allowance runs out, and back off on 429 instead of failing.
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(`${DISCOGS_BASE}${path}`, {
      headers: { 'User-Agent': USER_AGENT, Authorization: `Discogs token=${token}` },
    });
    if (res.status === 429) {
      await sleep(5000 * (attempt + 1));
      continue;
    }
    if (res.status === 401) throw new Error('Discogs rejected the token (HTTP 401) — check DISCOGS_TOKEN');
    if (res.status === 404) throw new NotFound(`Discogs returned 404 for ${path}`);
    if (!res.ok) throw new Error(`Discogs returned HTTP ${res.status} for ${path}`);
    const remaining = Number(res.headers.get('X-Discogs-Ratelimit-Remaining') ?? '60');
    if (remaining < 5) await sleep(2000);
    return await res.json();
  }
  throw new Error('Discogs rate limit hit repeatedly — try again in a minute');
}

// ---------------------------------------------------------------------------
// Collection / wantlist
// ---------------------------------------------------------------------------

async function fetchList(list: List, username: string, token: string): Promise<DiscogsEntry[]> {
  const user = encodeURIComponent(username);
  const base =
    list === 'collection'
      ? `/users/${user}/collection/folders/0/releases?sort=added&sort_order=desc`
      : `/users/${user}/wants?sort=added&sort_order=desc`;

  const entries: DiscogsEntry[] = [];
  for (let page = 1; ; page++) {
    let data: DiscogsListPage;
    try {
      data = await discogsGet<DiscogsListPage>(`${base}&per_page=${PER_PAGE}&page=${page}`, token);
    } catch (err) {
      if (err instanceof NotFound) throw new Error('Discogs user not found (HTTP 404) — check DISCOGS_USERNAME');
      throw err;
    }
    entries.push(...((list === 'collection' ? data.releases : data.wants) ?? []));
    if (page >= (data.pagination?.pages ?? 1)) return entries;
  }
}

function toRow(list: List, entry: DiscogsEntry, syncedAt: string) {
  const info = entry.basic_information;
  return {
    list,
    discogs_release_id: info.id,
    title: info.title,
    artists: joinArtists(info.artists),
    year: info.year || null,
    cover_url: imageOrNull(info.cover_image),
    thumb_url: imageOrNull(info.thumb),
    formats: describeFormats(info.formats),
    labels: describeLabels(info.labels),
    genres: uniq(info.genres ?? []),
    styles: uniq(info.styles ?? []),
    rating: entry.rating || null,
    date_added: entry.date_added ?? null,
    synced_at: syncedAt,
  };
}

async function syncList(db: SupabaseClient, list: List, username: string, token: string): Promise<number> {
  const syncedAt = new Date().toISOString();
  const entries = await fetchList(list, username, token);

  // The same release can be in a collection more than once (separate
  // instances); keep one row per release, the most recently added.
  const byRelease = new Map<number, ReturnType<typeof toRow>>();
  for (const entry of entries) {
    if (!byRelease.has(entry.basic_information.id)) {
      byRelease.set(entry.basic_information.id, toRow(list, entry, syncedAt));
    }
  }
  const rows = [...byRelease.values()];

  for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
    const { error } = await db
      .from('record_items')
      .upsert(rows.slice(i, i + UPSERT_CHUNK), { onConflict: 'list,discogs_release_id' });
    if (error) throw new Error(`Saving ${list} failed: ${error.message}`);
  }

  // Anything not touched by this sync was removed on Discogs.
  const { error: pruneError } = await db
    .from('record_items')
    .delete()
    .eq('list', list)
    .lt('synced_at', syncedAt);
  if (pruneError) throw new Error(`Pruning ${list} failed: ${pruneError.message}`);

  return rows.length;
}

// ---------------------------------------------------------------------------
// Tracklists
// ---------------------------------------------------------------------------

function toTrack(t: DiscogsTrack): Track {
  const type = t.type_ === 'heading' || t.type_ === 'index' ? t.type_ : 'track';
  const track: Track = {
    position: t.position?.trim() || null,
    title: t.title?.trim() || '',
    duration: t.duration?.trim() || null,
    type,
    artists: joinArtists(t.artists),
  };
  if (t.sub_tracks?.length) track.sub_tracks = t.sub_tracks.map(toTrack);
  return track;
}

async function fetchTracklist(releaseId: number, token: string): Promise<Track[]> {
  try {
    const release = await discogsGet<{ tracklist?: DiscogsTrack[] }>(`/releases/${releaseId}`, token);
    return (release.tracklist ?? []).map(toTrack);
  } catch (err) {
    // Store an empty tracklist for releases Discogs no longer has, so they
    // aren't retried on every sync.
    if (err instanceof NotFound) return [];
    throw err;
  }
}

async function saveTracklist(db: SupabaseClient, releaseId: number, tracklist: Track[]) {
  const { error } = await db
    .from('discogs_releases')
    .upsert({ release_id: releaseId, tracklist, fetched_at: new Date().toISOString() });
  if (error) throw new Error(`Saving tracklist for ${releaseId} failed: ${error.message}`);
}

async function selectAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const all: T[] = [];
  for (let from = 0; ; from += DB_PAGE) {
    const { data, error } = await page(from, from + DB_PAGE - 1);
    if (error) throw new Error(error.message);
    all.push(...(data ?? []));
    if ((data?.length ?? 0) < DB_PAGE) return all;
  }
}

// Release ids in record_items with no discogs_releases row, newest first.
async function missingTracklists(db: SupabaseClient): Promise<number[]> {
  const [items, fetched] = await Promise.all([
    selectAll<{ discogs_release_id: number }>((from, to) =>
      db.from('record_items')
        .select('discogs_release_id')
        .order('date_added', { ascending: false, nullsFirst: false })
        .range(from, to),
    ),
    selectAll<{ release_id: number }>((from, to) =>
      db.from('discogs_releases').select('release_id').range(from, to),
    ),
  ]);
  const have = new Set(fetched.map((r) => r.release_id));
  return [...new Set(items.map((r) => r.discogs_release_id))].filter((id) => !have.has(id));
}

async function backfillTracklists(db: SupabaseClient, token: string, startedAt: number) {
  const missing = await missingTracklists(db);
  let fetched = 0;
  for (const releaseId of missing) {
    if (Date.now() - startedAt > TRACKLIST_BUDGET_MS) break;
    await saveTracklist(db, releaseId, await fetchTracklist(releaseId, token));
    fetched++;
  }
  return { fetched, pending: missing.length - fetched };
}

// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  const startedAt = Date.now();
  try {
    const token = Deno.env.get('DISCOGS_TOKEN');
    const username = Deno.env.get('DISCOGS_USERNAME');
    if (!token || !username) {
      return respond({ error: 'DISCOGS_TOKEN / DISCOGS_USERNAME are not configured' });
    }

    const body = (await req.json().catch(() => ({}))) as {
      list?: string;
      tracklistsOnly?: boolean;
      releaseId?: number;
    };

    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
      auth: { persistSession: false },
    });

    // Single release, for the detail view: return the stored tracklist, or
    // fetch and store it now.
    if (body.releaseId) {
      const releaseId = Number(body.releaseId);
      const { data } = await db
        .from('discogs_releases')
        .select('tracklist')
        .eq('release_id', releaseId)
        .maybeSingle();
      if (data) return respond({ tracklist: data.tracklist });
      // Only fetch releases that are in the collection or wantlist.
      const { count } = await db
        .from('record_items')
        .select('id', { count: 'exact', head: true })
        .eq('discogs_release_id', releaseId);
      if (!count) return respond({ error: `Release ${releaseId} is not in the collection or wantlist` });
      const tracklist = await fetchTracklist(releaseId, token);
      await saveTracklist(db, releaseId, tracklist);
      return respond({ tracklist });
    }

    const synced: Record<string, number> = {};
    if (!body.tracklistsOnly) {
      const lists: List[] =
        body.list === 'collection' || body.list === 'wantlist' ? [body.list] : ['collection', 'wantlist'];
      for (const list of lists) {
        synced[list] = await syncList(db, list, username, token);
      }
    }

    const tracklists = await backfillTracklists(db, token, startedAt);

    return respond({ synced, tracklists, synced_at: new Date().toISOString() });
  } catch (err) {
    return respond({ error: err instanceof Error ? err.message : String(err) });
  }
});
