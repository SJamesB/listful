const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const IGDB_BASE = 'https://api.igdb.com/v4';
const TWITCH_TOKEN_URL = 'https://id.twitch.tv/oauth2/token';

interface InvolvedCompany {
  company?: { name?: string };
  developer?: boolean;
  publisher?: boolean;
}

interface IGDBGameDetail {
  name?: string;
  summary?: string;
  first_release_date?: number;
  genres?: { name: string }[];
  involved_companies?: InvolvedCompany[];
}

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(clientId: string, clientSecret: string): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.token;
  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'client_credentials',
  });
  const res = await fetch(`${TWITCH_TOKEN_URL}?${params.toString()}`, { method: 'POST' });
  if (!res.ok) throw new Error(`Twitch token request returned HTTP ${res.status}`);
  const data = await res.json();
  cachedToken = { token: data.access_token, expiresAt: Date.now() + (data.expires_in - 60) * 1000 };
  return cachedToken.token;
}

function respond(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const clientId = Deno.env.get('IGDB_CLIENT_ID');
    const clientSecret = Deno.env.get('IGDB_CLIENT_SECRET');
    if (!clientId || !clientSecret) {
      return respond({ error: 'IGDB_CLIENT_ID / IGDB_CLIENT_SECRET are not configured' });
    }

    const body = await req.json();
    const { igdb_id } = body as { igdb_id?: string };
    const idNum = Number(igdb_id);
    if (!igdb_id || !Number.isInteger(idNum)) return respond({ error: 'igdb_id is required' });

    const token = await getAccessToken(clientId, clientSecret);
    const apicalypse = `fields name,summary,first_release_date,genres.name,involved_companies.company.name,involved_companies.developer,involved_companies.publisher; where id = ${idNum};`;

    const res = await fetch(`${IGDB_BASE}/games`, {
      method: 'POST',
      headers: {
        'Client-ID': clientId,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'text/plain',
      },
      body: apicalypse,
    });
    if (!res.ok) return respond({ error: `IGDB returned HTTP ${res.status}` });

    const data = (await res.json()) as IGDBGameDetail[];
    const game = data[0];
    if (!game) return respond({ error: 'Game not found' });

    const companies = game.involved_companies ?? [];
    const developer = companies
      .filter((c) => c.developer && c.company?.name)
      .map((c) => c.company!.name)
      .join(', ') || null;
    const publisher = companies
      .filter((c) => c.publisher && c.company?.name)
      .map((c) => c.company!.name)
      .join(', ') || null;
    const genres = (game.genres ?? []).map((g) => g.name).join(', ') || null;

    return respond({
      overview: game.summary || null,
      developer,
      publisher,
      genres,
      year: game.first_release_date
        ? new Date(game.first_release_date * 1000).getUTCFullYear().toString()
        : null,
    });
  } catch (err) {
    return respond({ error: String(err) });
  }
});
