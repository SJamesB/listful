const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GIANTBOMB_BASE = 'https://www.giantbomb.com/api';
const USER_AGENT = 'Listful/1.0 (contact: samboote93@gmail.com)';

function respond(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const apiKey = Deno.env.get('GIANTBOMB_API_KEY');
    if (!apiKey) return respond({ error: 'GIANTBOMB_API_KEY is not configured' });

    const body = await req.json();
    const { giantbomb_id } = body as { giantbomb_id?: string };
    if (!giantbomb_id) return respond({ error: 'giantbomb_id is required' });

    const params = new URLSearchParams({
      api_key: apiKey,
      format: 'json',
      field_list: 'name,deck,description,developers,publishers,genres,original_release_date',
    });
    const res = await fetch(`${GIANTBOMB_BASE}/game/${giantbomb_id}/?${params.toString()}`, {
      headers: { 'User-Agent': USER_AGENT },
    });
    if (!res.ok) return respond({ error: `Giant Bomb returned HTTP ${res.status}` });

    const data = await res.json();
    if (data.status_code !== 1) {
      return respond({ error: data.error || 'Giant Bomb request failed' });
    }

    const result = data.results ?? {};
    const developers: { name: string }[] = result.developers ?? [];
    const publishers: { name: string }[] = result.publishers ?? [];
    const genres: { name: string }[] = result.genres ?? [];
    const overview = result.deck || (result.description ? stripHtml(result.description) : null);

    return respond({
      overview: overview || null,
      developer: developers.map((d) => d.name).join(', ') || null,
      publisher: publishers.map((p) => p.name).join(', ') || null,
      genres: genres.map((g) => g.name).join(', ') || null,
      year: result.original_release_date ? String(result.original_release_date).slice(0, 4) : null,
    });
  } catch (err) {
    return respond({ error: String(err) });
  }
});
