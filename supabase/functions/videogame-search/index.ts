const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const RAWG_BASE = 'https://api.rawg.io/api';

interface VideogameResult {
  rawg_id: number;
  title: string;
  year: string | null;
  cover_url: string | null;
}

interface RAWGGame {
  id: number;
  name: string;
  released: string | null;
  background_image: string | null;
}

function respond(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

function toResult(game: RAWGGame): VideogameResult | null {
  if (!game.name) return null;
  return {
    rawg_id: game.id,
    title: game.name,
    year: game.released ? game.released.slice(0, 4) : null,
    cover_url: game.background_image ?? null,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  try {
    const apiKey = Deno.env.get('RAWG_API_KEY');
    if (!apiKey) return respond({ error: 'RAWG_API_KEY is not configured' });

    const body = await req.json();
    const { query } = body as { query?: string };
    if (!query?.trim()) return respond({ error: 'query is required' });

    const url = `${RAWG_BASE}/games?key=${apiKey}&search=${encodeURIComponent(query.trim())}&page_size=24`;
    const res = await fetch(url);

    if (!res.ok) {
      return respond({ error: `RAWG returned HTTP ${res.status}` });
    }

    const data = await res.json();
    const results = ((data.results ?? []) as RAWGGame[])
      .map(toResult)
      .filter((item): item is VideogameResult => item !== null);

    return respond({ results });
  } catch (err) {
    return respond({ error: String(err) });
  }
});
