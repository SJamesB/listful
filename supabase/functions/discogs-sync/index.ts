import { createClient } from 'npm:@supabase/supabase-js@2';

// Mirrors the owner's Discogs collection and/or wantlist into record_items.
//
// Secrets (supabase secrets set ...):
//   DISCOGS_TOKEN     personal access token from discogs.com/settings/developers
//   DISCOGS_USERNAME  the Discogs username whose collection to read
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by the runtime.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const DISCOGS_BASE = 'https://api.discogs.com';
// Discogs rejects requests without an identifying User-Agent.
const USER_AGENT = 'Listful/1.0';
const PER_PAGE = 100;
const UPSERT_CHUNK = 500;

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

interface DiscogsPage {
  pagination: { page: number; pages: number };
  releases?: DiscogsEntry[];
  wants?: DiscogsEntry[];
}

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

async function discogsGet(path: string, token: string): Promise<DiscogsPage> {
  // Authenticated clients get 60 requests/min; back off on 429 instead of failing.
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(`${DISCOGS_BASE}${path}`, {
      headers: { 'User-Agent': USER_AGENT, Authorization: `Discogs token=${token}` },
    });
    if (res.status === 429) {
      await sleep(2000 * (attempt + 1));
      continue;
    }
    if (res.status === 401) throw new Error('Discogs rejected the token (HTTP 401) — check DISCOGS_TOKEN');
    if (res.status === 404) throw new Error('Discogs user not found (HTTP 404) — check DISCOGS_USERNAME');
    if (!res.ok) throw new Error(`Discogs returned HTTP ${res.status} for ${path}`);
    return await res.json();
  }
  throw new Error('Discogs rate limit hit repeatedly — try again in a minute');
}

async function fetchList(list: List, username: string, token: string): Promise<DiscogsEntry[]> {
  const user = encodeURIComponent(username);
  const base =
    list === 'collection'
      ? `/users/${user}/collection/folders/0/releases?sort=added&sort_order=desc`
      : `/users/${user}/wants?sort=added&sort_order=desc`;

  const entries: DiscogsEntry[] = [];
  for (let page = 1; ; page++) {
    const data = await discogsGet(`${base}&per_page=${PER_PAGE}&page=${page}`, token);
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
    artists: info.artists?.length ? uniq(info.artists.map((a) => cleanArtist(a.anv || a.name))).join(', ') : null,
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  try {
    const token = Deno.env.get('DISCOGS_TOKEN');
    const username = Deno.env.get('DISCOGS_USERNAME');
    if (!token || !username) {
      return respond({ error: 'DISCOGS_TOKEN / DISCOGS_USERNAME are not configured' });
    }

    const body = await req.json().catch(() => ({}));
    const requested = (body as { list?: string }).list;
    const lists: List[] =
      requested === 'collection' || requested === 'wantlist' ? [requested] : ['collection', 'wantlist'];

    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
      auth: { persistSession: false },
    });

    const syncedAt = new Date().toISOString();
    const counts: Record<string, number> = {};

    for (const list of lists) {
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

      counts[list] = rows.length;
    }

    return respond({ synced: counts, synced_at: syncedAt });
  } catch (err) {
    return respond({ error: err instanceof Error ? err.message : String(err) });
  }
});
