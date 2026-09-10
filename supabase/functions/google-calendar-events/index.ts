const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CalEvent {
  id: string;
  summary: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
}

function respond(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

async function getAccessToken(clientId: string, clientSecret: string, refreshToken: string): Promise<string> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }).toString(),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error_description ?? data.error);
  return data.access_token as string;
}

async function fetchEventsForDate(token: string, date: string): Promise<CalEvent[]> {
  const start = new Date(`${date}T00:00:00`);
  const end = new Date(`${date}T23:59:59.999`);

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events` +
    `?timeMin=${encodeURIComponent(start.toISOString())}` +
    `&timeMax=${encodeURIComponent(end.toISOString())}` +
    `&singleEvents=true&orderBy=startTime`,
    { headers: { Authorization: `Bearer ${token}` } },
  );

  if (!res.ok) throw new Error(`Calendar API ${res.status}`);
  const data = await res.json();
  return (data.items ?? []) as CalEvent[];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  try {
    const clientId = Deno.env.get('GOOGLE_CLIENT_ID');
    const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');
    const refreshToken = Deno.env.get('GOOGLE_REFRESH_TOKEN');
    if (!clientId || !clientSecret || !refreshToken) {
      return respond({ error: 'Google Calendar is not configured' });
    }

    const body = await req.json();
    const { dates } = body as { dates?: string[] };
    if (!dates?.length) return respond({ error: 'dates is required' });

    const token = await getAccessToken(clientId, clientSecret, refreshToken);
    const entries = await Promise.all(
      dates.map(async (date) => [date, await fetchEventsForDate(token, date)] as const),
    );

    return respond({ events: Object.fromEntries(entries) });
  } catch (err) {
    return respond({ error: String(err) });
  }
});
