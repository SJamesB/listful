const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const RAWG_BASE = 'https://api.rawg.io/api';

function respond(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const apiKey = Deno.env.get('RAWG_API_KEY');
    if (!apiKey) return respond({ error: 'RAWG_API_KEY is not configured' });

    const body = await req.json();
    const { rawg_id } = body as { rawg_id?: number };
    if (!rawg_id) return respond({ error: 'rawg_id is required' });

    const url = `${RAWG_BASE}/games/${rawg_id}?key=${apiKey}`;
    const res = await fetch(url);
    if (!res.ok) return respond({ error: `RAWG returned HTTP ${res.status}` });

    const data = await res.json();
    const developers: { name: string }[] = data.developers ?? [];
    const publishers: { name: string }[] = data.publishers ?? [];
    const genres: { name: string }[] = data.genres ?? [];

    return respond({
      overview: data.description_raw || null,
      developer: developers.map((d) => d.name).join(', ') || null,
      publisher: publishers.map((p) => p.name).join(', ') || null,
      genres: genres.map((g) => g.name).join(', ') || null,
      year: data.released ? String(data.released).slice(0, 4) : null,
    });
  } catch (err) {
    return respond({ error: String(err) });
  }
});
