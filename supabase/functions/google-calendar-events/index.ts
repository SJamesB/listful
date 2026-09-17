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

// Minutes to add to a UTC instant to get the local time in `timeZone`.
function tzOffsetMinutes(timeZone: string, instant: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUTC = Date.UTC(
    get('year'), get('month') - 1, get('day'),
    get('hour'), get('minute'), get('second'),
  );
  return (asUTC - instant.getTime()) / 60000;
}

// The UTC instant of local midnight for `date` (YYYY-MM-DD) in `timeZone`.
function zonedMidnightUTC(date: string, timeZone: string): Date {
  const naiveUTC = new Date(`${date}T00:00:00Z`);
  const offsetMin = tzOffsetMinutes(timeZone, naiveUTC);
  return new Date(naiveUTC.getTime() - offsetMin * 60000);
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// The calendar date (YYYY-MM-DD) that `instant` falls on in `timeZone`.
function zonedDateKey(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(instant);
}

async function fetchEventsInRange(token: string, timeMin: Date, timeMax: Date, timeZone: string): Promise<CalEvent[]> {
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events` +
    `?timeMin=${encodeURIComponent(timeMin.toISOString())}` +
    `&timeMax=${encodeURIComponent(timeMax.toISOString())}` +
    `&timeZone=${encodeURIComponent(timeZone)}` +
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
    const { dates, timeZone } = body as { dates?: string[]; timeZone?: string };
    if (!dates?.length) return respond({ error: 'dates is required' });

    const zone = timeZone || 'UTC';
    const sorted = [...dates].sort();
    const minDate = sorted[0];
    const maxDate = sorted[sorted.length - 1];

    const token = await getAccessToken(clientId, clientSecret, refreshToken);
    const timeMin = zonedMidnightUTC(minDate, zone);
    const timeMax = zonedMidnightUTC(addDays(maxDate, 1), zone);
    const items = await fetchEventsInRange(token, timeMin, timeMax, zone);

    // Bucket each event under the local calendar date it actually falls on,
    // rather than trusting which query window it happened to come back in —
    // that's what previously let all-day events (whose instant, once
    // converted from UTC midnight, can land the evening before in
    // timezones ahead of UTC) leak into the prior day's bucket.
    const buckets: Record<string, CalEvent[]> = Object.fromEntries(dates.map((d) => [d, []]));
    for (const item of items) {
      const dateKey = item.start.date
        ? item.start.date
        : item.start.dateTime
          ? zonedDateKey(new Date(item.start.dateTime), zone)
          : undefined;
      if (dateKey && buckets[dateKey]) buckets[dateKey].push(item);
    }

    return respond({ events: buckets });
  } catch (err) {
    return respond({ error: String(err) });
  }
});
