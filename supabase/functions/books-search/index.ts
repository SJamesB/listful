const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GOOGLE_BOOKS_BASE = 'https://www.googleapis.com/books/v1/volumes';
const OPEN_LIBRARY_SEARCH_URL = 'https://openlibrary.org/search.json';

// Cap on how many distinct cover editions we keep per book, and how we rank
// them - editions from a Penguin imprint are boosted to the front, with the
// two specific series the user favors (Penguin Modern Classics, Penguin
// Science Fiction) boosted above any other Penguin edition.
const MAX_EDITIONS_PER_BOOK = 10;
const PENGUIN_RE = /penguin/i;
const PENGUIN_SERIES_RE = /penguin\s+(modern\s+classics|science\s+fiction)/i;
const PENGUIN_SERIES = ['Penguin Modern Classics', 'Penguin Science Fiction'];

interface LibraryResult {
  key: string;
  title: string;
  author: string | null;
  year: string | null;
  cover_url: string | null;
  publisher: string | null;
}

interface GoogleVolume {
  id: string;
  volumeInfo?: {
    title?: string;
    authors?: string[];
    publishedDate?: string;
    publisher?: string;
    imageLinks?: { thumbnail?: string; smallThumbnail?: string };
  };
}

interface OpenLibraryDoc {
  key: string;
  title?: string;
  author_name?: string[];
  first_publish_year?: number;
  cover_i?: number;
  publisher?: string[];
}

function respond(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

function fromGoogle(volume: GoogleVolume): LibraryResult | null {
  const info = volume.volumeInfo;
  if (!info?.title || !volume.id) return null;
  const thumbnail = info.imageLinks?.thumbnail ?? info.imageLinks?.smallThumbnail ?? null;
  return {
    key: `g:${volume.id}`,
    title: info.title,
    author: info.authors?.join(', ') ?? null,
    year: info.publishedDate ? info.publishedDate.slice(0, 4) : null,
    cover_url: thumbnail ? thumbnail.replace(/^http:/, 'https:') : null,
    publisher: info.publisher ?? null,
  };
}

function fromOpenLibrary(doc: OpenLibraryDoc): LibraryResult | null {
  if (!doc.title || !doc.key) return null;
  return {
    key: `ol:${doc.key}`,
    title: doc.title,
    author: doc.author_name?.join(', ') ?? null,
    year: doc.first_publish_year ? String(doc.first_publish_year) : null,
    cover_url: doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg` : null,
    publisher: doc.publisher?.[0] ?? null,
  };
}

function dedupeKey(result: LibraryResult): string {
  return `${result.title.trim().toLowerCase()}|${(result.author ?? '').trim().toLowerCase()}`;
}

async function searchGoogle(query: string): Promise<LibraryResult[]> {
  const apiKey = Deno.env.get('GOOGLE_BOOKS_API_KEY');
  const params = new URLSearchParams({ q: query, maxResults: '40' });
  if (apiKey) params.set('key', apiKey);
  const res = await fetch(`${GOOGLE_BOOKS_BASE}?${params.toString()}`);
  if (!res.ok) return [];
  const data = await res.json();
  return ((data.items ?? []) as GoogleVolume[])
    .map(fromGoogle)
    .filter((item): item is LibraryResult => item !== null);
}

async function searchOpenLibrary(query: string): Promise<LibraryResult[]> {
  const params = new URLSearchParams({
    q: query,
    limit: '40',
    fields: 'key,title,author_name,first_publish_year,cover_i,publisher,subject',
  });
  const res = await fetch(`${OPEN_LIBRARY_SEARCH_URL}?${params.toString()}`);
  if (!res.ok) return [];
  const data = await res.json();
  return ((data.docs ?? []) as OpenLibraryDoc[])
    .map(fromOpenLibrary)
    .filter((item): item is LibraryResult => item !== null);
}

// Google Books' inpublisher: and Open Library's publisher: field-scoped
// search operators are far more precise than appending keywords to free
// text - they ask each source directly for editions from that publisher,
// instead of hoping relevance ranking surfaces one among free-text matches.
function googleQueries(base: string): string[] {
  return [base, ...PENGUIN_SERIES.map((series) => `${base} inpublisher:"${series}"`)];
}

function openLibraryQueries(base: string): string[] {
  return [base, ...PENGUIN_SERIES.map((series) => `${base} publisher:"${series}"`)];
}

function editionRank(result: LibraryResult): number {
  const publisher = result.publisher ?? '';
  const isSeriesMatch = PENGUIN_SERIES_RE.test(publisher);
  const isPenguin = PENGUIN_RE.test(publisher);
  if (isSeriesMatch && result.cover_url) return 0;
  if (isSeriesMatch) return 1;
  if (isPenguin && result.cover_url) return 2;
  if (isPenguin) return 3;
  if (result.cover_url) return 4;
  return 5;
}

// Groups results by title+author so every distinct cover edition of the same
// book stays available (rather than collapsing to a single "best" cover),
// with Penguin editions - and Penguin Modern Classics/Science Fiction
// specifically - ranked first within each group.
function merge(sources: LibraryResult[][]): LibraryResult[] {
  const groups = new Map<string, LibraryResult[]>();
  const order: string[] = [];

  for (const results of sources) {
    for (const result of results) {
      const dKey = dedupeKey(result);
      if (!groups.has(dKey)) {
        groups.set(dKey, []);
        order.push(dKey);
      }
      const group = groups.get(dKey)!;
      const existing = group.find(
        (r) => r.key === result.key || (r.cover_url && r.cover_url === result.cover_url),
      );
      if (!existing) {
        group.push(result);
      } else if (!existing.publisher && result.publisher) {
        existing.publisher = result.publisher;
      }
    }
  }

  const flattened: LibraryResult[] = [];
  for (const dKey of order) {
    const group = groups.get(dKey)!;
    const withCover = group.filter((r) => r.cover_url);
    const ranked = (withCover.length > 0 ? withCover : group).sort(
      (a, b) => editionRank(a) - editionRank(b),
    );
    flattened.push(...ranked.slice(0, MAX_EDITIONS_PER_BOOK));
  }
  return flattened;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  try {
    const body = await req.json();
    const { query } = body as { query?: string };
    const trimmed = query?.trim();
    if (!trimmed) return respond({ error: 'query is required' });

    // If the user already typed "penguin" themselves, don't pile on more
    // penguin-scoped queries - their query is already doing that work.
    const boosted = PENGUIN_RE.test(trimmed);
    const gQueries = boosted ? [trimmed] : googleQueries(trimmed);
    const olQueries = boosted ? [trimmed] : openLibraryQueries(trimmed);

    const sourceResults = await Promise.all([
      ...gQueries.map((q) => searchGoogle(q).catch(() => [])),
      ...olQueries.map((q) => searchOpenLibrary(q).catch(() => [])),
    ]);

    return respond({ results: merge(sourceResults) });
  } catch (err) {
    return respond({ error: String(err) });
  }
});
