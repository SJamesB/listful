const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GOOGLE_BOOKS_BASE = 'https://www.googleapis.com/books/v1/volumes';

interface LibraryResult {
  google_id: string;
  title: string;
  author: string | null;
  year: string | null;
  cover_url: string | null;
}

interface GoogleVolume {
  id: string;
  volumeInfo?: {
    title?: string;
    authors?: string[];
    publishedDate?: string;
    imageLinks?: { thumbnail?: string; smallThumbnail?: string };
  };
}

function respond(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

function toResult(volume: GoogleVolume): LibraryResult | null {
  const info = volume.volumeInfo;
  if (!info?.title || !volume.id) return null;
  const thumbnail = info.imageLinks?.thumbnail ?? info.imageLinks?.smallThumbnail ?? null;
  return {
    google_id: volume.id,
    title: info.title,
    author: info.authors?.join(', ') ?? null,
    year: info.publishedDate ? info.publishedDate.slice(0, 4) : null,
    cover_url: thumbnail ? thumbnail.replace(/^http:/, 'https:') : null,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  try {
    const body = await req.json();
    const { query } = body as { query?: string };
    if (!query?.trim()) return respond({ error: 'query is required' });

    const apiKey = Deno.env.get('GOOGLE_BOOKS_API_KEY');
    const params = new URLSearchParams({ q: query.trim(), maxResults: '24' });
    if (apiKey) params.set('key', apiKey);

    const url = `${GOOGLE_BOOKS_BASE}?${params.toString()}`;
    const res = await fetch(url);

    if (!res.ok) {
      return respond({ error: `Google Books returned HTTP ${res.status}` });
    }

    const data = await res.json();
    const results = ((data.items ?? []) as GoogleVolume[])
      .map(toResult)
      .filter((item): item is LibraryResult => item !== null);

    return respond({ results });
  } catch (err) {
    return respond({ error: String(err) });
  }
});
