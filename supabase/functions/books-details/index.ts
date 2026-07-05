const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const OPEN_LIBRARY_BASE = 'https://openlibrary.org';

function respond(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

function extractDescription(description: unknown): string | null {
  if (typeof description === 'string') return description;
  if (description && typeof description === 'object' && 'value' in description) {
    return String((description as { value: unknown }).value);
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const body = await req.json();
    const { olid } = body as { olid?: string };
    if (!olid) return respond({ error: 'olid is required' });

    const url = `${OPEN_LIBRARY_BASE}/works/${olid}.json`;
    const res = await fetch(url);
    if (!res.ok) return respond({ error: `Open Library returned HTTP ${res.status}` });

    const data = await res.json();
    const subjects: string[] = Array.isArray(data.subjects) ? data.subjects.slice(0, 3) : [];

    return respond({
      description: extractDescription(data.description),
      subjects: subjects.length ? subjects.join(', ') : null,
    });
  } catch (err) {
    return respond({ error: String(err) });
  }
});
