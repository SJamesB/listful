import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

// Looks up tempo (BPM) and musical key for collection tracks and stores them
// in track_audio.
//
// Request body:
//   {}                                       backfill: tracks with no row yet,
//                                            newest records first, for as long
//                                            as BUDGET_MS allows; reports pending
//   { retryBefore: ISO time }                backfill that also retries automatic
//                                            misses last tried before that time
//   { tracks: [{ release_id, position, title }] }
//                                            look these up now (max 20) and
//                                            return their rows
//
// Per track: search Deezer by artist + title, keep up to three candidates
// whose artist matches and that share the track's mix name (best title and
// duration match first, then the most popular release), read their ISRCs,
// and use the first one ReccoBeats has tempo and key for.
// ReccoBeats' tempo wins; Deezer's BPM is the fallback. Neither API needs a
// key. Existing rows are never overwritten, so manual edits are safe.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Supabase drops requests that haven't responded within 150s.
const BUDGET_MS = 90_000;
const CHUNK = 20;
const CONCURRENCY = 4;
// Deezer allows roughly 50 requests per 5 seconds per IP; stay under it.
const DEEZER_INTERVAL_MS = 120;
const DB_PAGE = 1000;
const MAX_EXPLICIT = 20;
const MAX_CANDIDATES = 3;

interface Track {
  position: string | null;
  title: string;
  duration: string | null;
  type: 'track' | 'heading' | 'index';
  artists: string | null;
  sub_tracks?: Track[];
}

interface Wanted {
  release_id: number;
  position: string; // '' when the tracklist has none
  title: string;
  artist: string | null;
  duration: string | null;
}

interface DeezerHit {
  id: number;
  title: string;
  title_short?: string;
  duration: number;
  rank?: number; // popularity
  artist: { name: string };
}

interface Match {
  isrc: string | null;
  bpm: number | null;
  artist: string;
  title: string;
}

interface Row {
  release_id: number;
  track_position: string;
  track_title: string;
  bpm: number | null;
  musical_key: number | null;
  mode: number | null;
  source: 'reccobeats' | 'deezer' | 'none';
  isrc: string | null;
  matched_artist: string | null;
  matched_title: string | null;
  updated_at: string;
}

function respond(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const round1 = (n: number) => Math.round(n * 10) / 10;

// ---------------------------------------------------------------------------
// Matching helpers
// ---------------------------------------------------------------------------

function norm(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/^the\s+/, '')
    .replace(/[^a-z0-9]/g, '');
}

const firstArtist = (artists: string) => artists.split(/,| & | and | feat\.? | ft\.? /i)[0].trim();
const baseTitle = (title: string) => title.replace(/\s*[([].*?[)\]]\s*/g, ' ').replace(/\s+/g, ' ').trim();
const mixName = (title: string) => norm(title.match(/[([](.*?)[)\]]/)?.[1] ?? '');

// Words in a title's bracketed mix/version notes that don't identify a
// specific mix (so "Album Version" or "2009 Remaster" match the plain track).
const GENERIC_MIX_WORDS = new Set([
  'mix', 'remix', 'version', 'edit', 'vocal', 'dub', 'club', 'original', 'extended', 'radio', 'single',
  'album', 'lp', 'inch', 'remaster', 'remastered', 'mono', 'stereo', 'instrumental', 'feat', 'ft',
  'featuring', 'the', 'and', 'a', 'of', 'with', 'from', 'long', 'short', 'full', 'length',
]);

function mixTokens(title: string): string[] {
  const notes = [...title.matchAll(/[([](.*?)[)\]]/g)].map((m) => m[1]).join(' ');
  return notes
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w && !/^\d+$/.test(w) && !GENERIC_MIX_WORDS.has(w));
}

// A track that names a specific mix only matches a candidate that shares a
// distinctive word of that mix; a different remix can have a different tempo.
function sameMix(candidateTitle: string, wantedTitle: string): boolean {
  const wanted = mixTokens(wantedTitle);
  if (!wanted.length) return true;
  const candidate = new Set(
    candidateTitle.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().split(/[^a-z0-9]+/),
  );
  return wanted.some((w) => candidate.has(w));
}

function artistMatches(candidate: string, wanted: string): boolean {
  const a = norm(candidate);
  const b = norm(wanted);
  if (!a || !b) return false;
  return a === b || (b.length >= 3 && a.includes(b)) || (a.length >= 3 && b.includes(a));
}

function parseDuration(d: string | null): number | null {
  if (!d) return null;
  const parts = d.split(':').map(Number);
  if (parts.length < 2 || parts.some((n) => !Number.isFinite(n))) return null;
  return parts.reduce((t, n) => t * 60 + n, 0);
}

function score(hit: DeezerHit, w: Wanted): number {
  let s = 0;
  const t = norm(hit.title);
  if (t === norm(w.title)) s += 3;
  if (norm(hit.title_short ?? hit.title) === norm(baseTitle(w.title))) s += 2;
  const mix = mixName(w.title);
  if (mix && t.includes(mix)) s += 2;
  const secs = parseDuration(w.duration);
  if (secs != null) {
    const diff = Math.abs(hit.duration - secs);
    if (diff <= 8) s += 2;
    else if (diff <= 20) s += 1;
  }
  return s;
}

// Index tracks (medleys) are replaced by their sub-tracks; headings dropped.
function playable(tracklist: Track[]): Track[] {
  return tracklist.flatMap((t) => {
    if (t.type === 'heading') return [];
    if (t.type === 'index' && t.sub_tracks?.length) return playable(t.sub_tracks);
    return [t];
  });
}

// ---------------------------------------------------------------------------
// Deezer / ReccoBeats
// ---------------------------------------------------------------------------

let nextDeezerSlot = 0;

async function deezer<T>(path: string): Promise<T> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const now = Date.now();
    const wait = Math.max(0, nextDeezerSlot - now);
    nextDeezerSlot = Math.max(now, nextDeezerSlot) + DEEZER_INTERVAL_MS;
    await sleep(wait);
    const res = await fetch(`https://api.deezer.com${path}`);
    if (!res.ok) throw new Error(`Deezer returned HTTP ${res.status}`);
    const body = await res.json();
    // Quota errors come back as HTTP 200 with an error object (code 4).
    if (body?.error?.code === 4) {
      await sleep(5000);
      continue;
    }
    if (body?.error) throw new Error(`Deezer error: ${body.error.message ?? JSON.stringify(body.error)}`);
    return body as T;
  }
  throw new Error('Deezer quota exceeded repeatedly');
}

// Up to MAX_CANDIDATES matching Deezer tracks, best first. The same song often
// exists as several releases (remasters, compilations, obscure re-uploads),
// and ReccoBeats may only know some of them, so the caller tries each in turn.
async function findOnDeezer(w: Wanted): Promise<Match[]> {
  if (!w.artist) return [];
  const artist = firstArtist(w.artist);
  const queries = [...new Set([`${artist} ${w.title}`, `${artist} ${baseTitle(w.title)}`])];
  for (const q of queries) {
    const { data } = await deezer<{ data?: DeezerHit[] }>(`/search?q=${encodeURIComponent(q)}&limit=15`);
    const candidates = (data ?? []).filter(
      (d) => artistMatches(d.artist.name, artist) && sameMix(d.title, w.title),
    );
    if (!candidates.length) continue;
    // Best match first; among equals, the more popular (usually the official) release.
    const ranked = candidates
      .map((d) => ({ d, s: score(d, w) }))
      .sort((a, b) => b.s - a.s || (b.d.rank ?? 0) - (a.d.rank ?? 0))
      .slice(0, MAX_CANDIDATES)
      .map((x) => x.d);
    return await Promise.all(
      ranked.map(async (hit) => {
        const track = await deezer<{ isrc?: string; bpm?: number }>(`/track/${hit.id}`);
        return {
          isrc: track.isrc || null,
          bpm: track.bpm && track.bpm > 0 ? round1(track.bpm) : null,
          artist: hit.artist.name,
          title: hit.title,
        };
      }),
    );
  }
  return [];
}

async function reccobeats(isrcs: string[]): Promise<Map<string, { tempo: number; key: number; mode: number }>> {
  const out = new Map<string, { tempo: number; key: number; mode: number }>();
  // ReccoBeats accepts at most 40 ids per request.
  for (let i = 0; i < isrcs.length; i += 40) {
    const res = await fetch(`https://api.reccobeats.com/v1/audio-features?ids=${isrcs.slice(i, i + 40).join(',')}`);
    if (!res.ok) continue; // treat as "no data" rather than failing the batch
    const body = (await res.json()) as {
      content?: { isrc: string; tempo: number; key: number; mode: number }[];
    };
    // One ISRC can map to several Spotify tracks; keep the first.
    for (const f of body.content ?? []) if (!out.has(f.isrc)) out.set(f.isrc, f);
  }
  return out;
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}

// Looks up a chunk of tracks. Tracks whose lookup threw are left out so
// they're retried next time.
async function lookUp(chunk: Wanted[]): Promise<Row[]> {
  const results = await mapLimit(chunk, CONCURRENCY, async (w) => {
    try {
      return { ok: true as const, candidates: await findOnDeezer(w) };
    } catch {
      return { ok: false as const, candidates: [] as Match[] };
    }
  });
  const isrcs = [
    ...new Set(results.flatMap((r) => r.candidates.map((c) => c.isrc)).filter((x): x is string => !!x)),
  ];
  const features = await reccobeats(isrcs);
  const now = new Date().toISOString();

  const rows: Row[] = [];
  chunk.forEach((w, i) => {
    const { ok, candidates } = results[i];
    if (!ok) return;
    // First candidate ReccoBeats knows, else the first with a Deezer BPM,
    // else the best match (recorded as a miss).
    const match =
      candidates.find((c) => c.isrc && features.has(c.isrc)) ??
      candidates.find((c) => c.bpm != null) ??
      candidates[0] ??
      null;
    const f = match?.isrc ? features.get(match.isrc) : undefined;
    const tempo = f && f.tempo > 0 ? round1(f.tempo) : null;
    const bpm = tempo ?? match?.bpm ?? null;
    rows.push({
      release_id: w.release_id,
      track_position: w.position,
      track_title: w.title,
      bpm,
      musical_key: f && f.key >= 0 && f.key <= 11 ? f.key : null,
      mode: f && (f.mode === 0 || f.mode === 1) ? f.mode : null,
      source: tempo != null ? 'reccobeats' : bpm != null ? 'deezer' : 'none',
      isrc: match?.isrc ?? null,
      matched_artist: match?.artist ?? null,
      matched_title: match?.title ?? null,
      updated_at: now,
    });
  });
  return rows;
}

async function save(db: SupabaseClient, rows: Row[]) {
  if (!rows.length) return;
  // ignoreDuplicates: never replace an existing row here...
  const { error } = await db
    .from('track_audio')
    .upsert(rows, { onConflict: 'release_id,track_position,track_title', ignoreDuplicates: true });
  if (error) throw new Error(`Saving track_audio failed: ${error.message}`);
  // ...except automatic misses being retried, which are updated only while
  // they're still unconfirmed misses (so a manual edit is never replaced).
  await Promise.all(
    rows.map(({ release_id, track_position, track_title, ...values }) =>
      db.from('track_audio')
        .update(values)
        .eq('release_id', release_id)
        .eq('track_position', track_position)
        .eq('track_title', track_title)
        .eq('source', 'none')
        .eq('confirmed', false),
    ),
  );
}

// ---------------------------------------------------------------------------
// What's missing
// ---------------------------------------------------------------------------

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

const rowKey = (releaseId: number, position: string, title: string) => `${releaseId}|${position}|${title}`;

// Collection tracks without a track_audio row, newest records first. With
// retryBefore, automatic misses (source 'none', not confirmed) last updated
// before that time count as missing too.
async function missingTracks(db: SupabaseClient, retryBefore?: string): Promise<Wanted[]> {
  const [records, releases, existing] = await Promise.all([
    selectAll<{ discogs_release_id: number; artists: string | null }>((from, to) =>
      db.from('record_items')
        .select('discogs_release_id, artists')
        .eq('list', 'collection')
        .order('date_added', { ascending: false, nullsFirst: false })
        .range(from, to),
    ),
    selectAll<{ release_id: number; tracklist: Track[] }>((from, to) =>
      db.from('discogs_releases').select('release_id, tracklist').range(from, to),
    ),
    selectAll<{
      release_id: number;
      track_position: string;
      track_title: string;
      source: string;
      confirmed: boolean;
      updated_at: string;
    }>((from, to) =>
      db.from('track_audio')
        .select('release_id, track_position, track_title, source, confirmed, updated_at')
        .range(from, to),
    ),
  ]);
  const tracklists = new Map(releases.map((r) => [r.release_id, r.tracklist]));
  const retryCutoff = retryBefore ? new Date(retryBefore).getTime() : null;
  const have = new Set(
    existing
      .filter(
        (e) =>
          !(retryCutoff != null && e.source === 'none' && !e.confirmed && new Date(e.updated_at).getTime() < retryCutoff),
      )
      .map((e) => rowKey(e.release_id, e.track_position, e.track_title)),
  );

  const wanted: Wanted[] = [];
  const seen = new Set<string>();
  for (const record of records) {
    for (const t of playable(tracklists.get(record.discogs_release_id) ?? [])) {
      if (!t.title) continue;
      const position = t.position ?? '';
      const key = rowKey(record.discogs_release_id, position, t.title);
      if (have.has(key) || seen.has(key)) continue;
      seen.add(key);
      wanted.push({
        release_id: record.discogs_release_id,
        position,
        title: t.title,
        artist: t.artists ?? record.artists,
        duration: t.duration,
      });
    }
  }
  return wanted;
}

// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  const startedAt = Date.now();
  try {
    const body = (await req.json().catch(() => ({}))) as {
      tracks?: { release_id: number; position: string | null; title: string }[];
      retryBefore?: string;
    };
    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
      auth: { persistSession: false },
    });

    // Explicit lookup, e.g. a track just added to a set before the backfill
    // reached it. Only collection tracks are looked up.
    if (body.tracks?.length) {
      const requested = body.tracks.slice(0, MAX_EXPLICIT);
      const releaseIds = [...new Set(requested.map((t) => Number(t.release_id)))];
      const [{ data: records }, { data: releases }] = await Promise.all([
        db.from('record_items').select('discogs_release_id, artists')
          .eq('list', 'collection').in('discogs_release_id', releaseIds),
        db.from('discogs_releases').select('release_id, tracklist').in('release_id', releaseIds),
      ]);
      const artists = new Map((records ?? []).map((r) => [r.discogs_release_id as number, r.artists as string | null]));
      const tracklists = new Map((releases ?? []).map((r) => [r.release_id as number, playable(r.tracklist as Track[])]));

      const wanted: Wanted[] = [];
      for (const t of requested) {
        const releaseId = Number(t.release_id);
        if (!artists.has(releaseId)) continue;
        const position = t.position ?? '';
        const track = tracklists.get(releaseId)?.find((x) => (x.position ?? '') === position && x.title === t.title);
        wanted.push({
          release_id: releaseId,
          position,
          title: t.title,
          artist: track?.artists ?? artists.get(releaseId) ?? null,
          duration: track?.duration ?? null,
        });
      }
      await save(db, await lookUp(wanted));

      const { data: rows } = await db
        .from('track_audio')
        .select('*')
        .in('release_id', releaseIds);
      const keys = new Set(wanted.map((w) => rowKey(w.release_id, w.position, w.title)));
      return respond({
        rows: (rows ?? []).filter((r) => keys.has(rowKey(r.release_id, r.track_position, r.track_title))),
      });
    }

    // Backfill.
    const missing = await missingTracks(db, body.retryBefore);
    let done = 0;
    let found = 0;
    while (done < missing.length && Date.now() - startedAt < BUDGET_MS) {
      const chunk = missing.slice(done, done + CHUNK);
      const rows = await lookUp(chunk);
      await save(db, rows);
      found += rows.filter((r) => r.bpm != null).length;
      done += chunk.length;
    }
    // Tracks whose lookup errored aren't saved, so they stay pending.
    const pending = (await missingTracks(db, body.retryBefore)).length;
    return respond({ looked_up: done, found, pending });
  } catch (err) {
    return respond({ error: err instanceof Error ? err.message : String(err) });
  }
});
