const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const OPEN_LIBRARY_BASE = 'https://openlibrary.org';

interface LibraryResult {
  olid: string;
  title: string;
  author: string | null;
  year: string | null;
  cover_id: number | null;
}

interface OpenLibraryDoc {
  key: string;
  title?: string;
  author_name?: string[];
  first_publish_year?: number;
  cover_i?: number;
}

function respond(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

function toResult(doc: OpenLibraryDoc): LibraryResult | null {
  if (!doc.title || !doc.key) return null;
  return {
    olid: doc.key.replace('/works/', ''),
    title: doc.title,
    author: doc.author_name?.join(', ') ?? null,
    year: doc.first_publish_year ? String(doc.first_publish_year) : null,
    cover_id: doc.cover_i ?? null,
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

    const url = `${OPEN_LIBRARY_BASE}/search.json?q=${encodeURIComponent(query.trim())}&limit=24&fields=key,title,author_name,first_publish_year,cover_i`;
    const res = await fetch(url);

    if (!res.ok) {
      return respond({ error: `Open Library returned HTTP ${res.status}` });
    }

    const data = await res.json();
    const results = ((data.docs ?? []) as OpenLibraryDoc[])
      .map(toResult)
      .filter((item): item is LibraryResult => item !== null);

    return respond({ results });
  } catch (err) {
    return respond({ error: String(err) });
  }
});
