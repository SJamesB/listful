const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GOOGLE_BOOKS_BASE = 'https://www.googleapis.com/books/v1/volumes';
const OPEN_LIBRARY_SEARCH_URL = 'https://openlibrary.org/search.json';

interface LibraryResult {
  key: string;
  title: string;
  author: string | null;
  year: string | null;
  cover_url: string | null;
  genre: string | null;
}

interface GoogleVolume {
  id: string;
  volumeInfo?: {
    title?: string;
    authors?: string[];
    publishedDate?: string;
    imageLinks?: { thumbnail?: string; smallThumbnail?: string };
    categories?: string[];
  };
}

interface OpenLibraryDoc {
  key: string;
  title?: string;
  author_name?: string[];
  first_publish_year?: number;
  cover_i?: number;
  subject?: string[];
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
    genre: info.categories?.length ? info.categories.slice(0, 2).join(', ') : null,
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
    genre: doc.subject?.length ? doc.subject.slice(0, 2).join(', ') : null,
  };
}

function dedupeKey(result: LibraryResult): string {
  return `${result.title.trim().toLowerCase()}|${(result.author ?? '').trim().toLowerCase()}`;
}

async function searchGoogle(query: string): Promise<LibraryResult[]> {
  const apiKey = Deno.env.get('GOOGLE_BOOKS_API_KEY');
  const params = new URLSearchParams({ q: query, maxResults: '24' });
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
    limit: '24',
    fields: 'key,title,author_name,first_publish_year,cover_i,subject',
  });
  const res = await fetch(`${OPEN_LIBRARY_SEARCH_URL}?${params.toString()}`);
  if (!res.ok) return [];
  const data = await res.json();
  return ((data.docs ?? []) as OpenLibraryDoc[])
    .map(fromOpenLibrary)
    .filter((item): item is LibraryResult => item !== null);
}

function merge(sources: LibraryResult[][]): LibraryResult[] {
  const byKey = new Map<string, LibraryResult>();
  for (const results of sources) {
    for (const result of results) {
      const dKey = dedupeKey(result);
      const existing = byKey.get(dKey);
      if (!existing) {
        byKey.set(dKey, result);
      } else if (!existing.cover_url && result.cover_url) {
        byKey.set(dKey, { ...existing, cover_url: result.cover_url, genre: existing.genre ?? result.genre });
      } else if (!existing.genre && result.genre) {
        existing.genre = result.genre;
      }
    }
  }
  return Array.from(byKey.values());
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

    const [google, openLibrary] = await Promise.all([
      searchGoogle(trimmed).catch(() => []),
      searchOpenLibrary(trimmed).catch(() => []),
    ]);

    return respond({ results: merge([google, openLibrary]) });
  } catch (err) {
    return respond({ error: String(err) });
  }
});
