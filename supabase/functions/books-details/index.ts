const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GOOGLE_BOOKS_BASE = 'https://www.googleapis.com/books/v1/volumes';

function respond(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const body = await req.json();
    const { google_id } = body as { google_id?: string };
    if (!google_id) return respond({ error: 'google_id is required' });

    const apiKey = Deno.env.get('GOOGLE_BOOKS_API_KEY');
    const params = apiKey ? `?key=${apiKey}` : '';
    const url = `${GOOGLE_BOOKS_BASE}/${google_id}${params}`;
    const res = await fetch(url);
    if (!res.ok) return respond({ error: `Google Books returned HTTP ${res.status}` });

    const data = await res.json();
    const info = data.volumeInfo ?? {};
    const subjects: string[] = Array.isArray(info.categories) ? info.categories.slice(0, 3) : [];

    return respond({
      description: info.description ?? null,
      subjects: subjects.length ? subjects.join(', ') : null,
    });
  } catch (err) {
    return respond({ error: String(err) });
  }
});
