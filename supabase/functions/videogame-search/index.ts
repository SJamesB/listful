const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GIANTBOMB_BASE = 'https://www.giantbomb.com/api';
const USER_AGENT = 'Listful/1.0 (contact: samboote93@gmail.com)';

interface VideogameResult {
  giantbomb_id: string;
  title: string;
  year: string | null;
  cover_url: string | null;
}

interface GiantBombGame {
  guid: string;
  name: string;
  original_release_date: string | null;
  image?: { medium_url?: string | null } | null;
}

function respond(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

function toResult(game: GiantBombGame): VideogameResult | null {
  if (!game.name || !game.guid) return null;
  return {
    giantbomb_id: game.guid,
    title: game.name,
    year: game.original_release_date ? game.original_release_date.slice(0, 4) : null,
    cover_url: game.image?.medium_url ?? null,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  try {
    const apiKey = Deno.env.get('GIANTBOMB_API_KEY');
    if (!apiKey) return respond({ error: 'GIANTBOMB_API_KEY is not configured' });

    const body = await req.json();
    const { query } = body as { query?: string };
    if (!query?.trim()) return respond({ error: 'query is required' });

    const params = new URLSearchParams({
      api_key: apiKey,
      format: 'json',
      query: query.trim(),
      resources: 'game',
      field_list: 'guid,name,image,original_release_date',
      limit: '24',
    });
    const res = await fetch(`${GIANTBOMB_BASE}/search/?${params.toString()}`, {
      headers: { 'User-Agent': USER_AGENT },
    });

    if (!res.ok) {
      return respond({ error: `Giant Bomb returned HTTP ${res.status}` });
    }

    const data = await res.json();
    if (data.status_code !== 1) {
      return respond({ error: data.error || 'Giant Bomb request failed' });
    }

    const results = ((data.results ?? []) as GiantBombGame[])
      .map(toResult)
      .filter((item): item is VideogameResult => item !== null);

    return respond({ results });
  } catch (err) {
    return respond({ error: String(err) });
  }
});
