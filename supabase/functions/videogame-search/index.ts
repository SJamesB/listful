const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const IGDB_BASE = 'https://api.igdb.com/v4';
const TWITCH_TOKEN_URL = 'https://id.twitch.tv/oauth2/token';

interface VideogameResult {
  igdb_id: string;
  title: string;
  year: string | null;
  cover_url: string | null;
}

interface IGDBGame {
  id: number;
  name: string;
  first_release_date?: number;
  cover?: { url?: string } | null;
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

function coverUrl(cover?: { url?: string } | null): string | null {
  if (!cover?.url) return null;
  const upgraded = cover.url.replace('t_thumb', 't_cover_big');
  return upgraded.startsWith('//') ? `https:${upgraded}` : upgraded;
}

function respond(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

function toResult(game: IGDBGame): VideogameResult | null {
  if (!game.name) return null;
  return {
    igdb_id: String(game.id),
    title: game.name,
    year: game.first_release_date
      ? new Date(game.first_release_date * 1000).getUTCFullYear().toString()
      : null,
    cover_url: coverUrl(game.cover),
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  try {
    const clientId = Deno.env.get('IGDB_CLIENT_ID');
    const clientSecret = Deno.env.get('IGDB_CLIENT_SECRET');
    if (!clientId || !clientSecret) {
      return respond({ error: 'IGDB_CLIENT_ID / IGDB_CLIENT_SECRET are not configured' });
    }

    const body = await req.json();
    const { query } = body as { query?: string };
    if (!query?.trim()) return respond({ error: 'query is required' });

    const token = await getAccessToken(clientId, clientSecret);
    const escaped = query.trim().replace(/"/g, '\\"');
    const apicalypse = `search "${escaped}"; fields id,name,cover.url,first_release_date; limit 24;`;

    const res = await fetch(`${IGDB_BASE}/games`, {
      method: 'POST',
      headers: {
        'Client-ID': clientId,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'text/plain',
      },
      body: apicalypse,
    });

    if (!res.ok) {
      return respond({ error: `IGDB returned HTTP ${res.status}` });
    }

    const data = await res.json();
    const results = ((data ?? []) as IGDBGame[])
      .map(toResult)
      .filter((item): item is VideogameResult => item !== null);

    return respond({ results });
  } catch (err) {
    return respond({ error: String(err) });
  }
});
