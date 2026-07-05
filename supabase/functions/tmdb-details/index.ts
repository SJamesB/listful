const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const TMDB_BASE = 'https://api.themoviedb.org/3';

interface CrewMember {
  job: string;
  department: string;
  name: string;
}

function respond(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

function findDirector(crew: CrewMember[]): string | null {
  return crew.find((c) => c.job === 'Director')?.name ?? null;
}

function findComposer(crew: CrewMember[]): string | null {
  return crew.find(
    (c) =>
      c.job === 'Original Music Composer' ||
      c.job === 'Music' ||
      c.job === 'Original Score' ||
      (c.department === 'Sound' && c.job.toLowerCase().includes('compos')),
  )?.name ?? null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const apiKey = Deno.env.get('TMDB_API_KEY');
    if (!apiKey) return respond({ error: 'TMDB_API_KEY is not configured' });

    const body = await req.json();
    const { tmdb_id, media_type } = body as { tmdb_id?: number; media_type?: string };

    if (!tmdb_id || !media_type) return respond({ error: 'tmdb_id and media_type are required' });
    if (media_type !== 'movie' && media_type !== 'tv') return respond({ error: 'media_type must be movie or tv' });

    const url = `${TMDB_BASE}/${media_type}/${tmdb_id}?api_key=${apiKey}&append_to_response=credits`;
    const res = await fetch(url);
    if (!res.ok) return respond({ error: `TMDB returned HTTP ${res.status}` });

    const data = await res.json();
    const crew: CrewMember[] = data.credits?.crew ?? [];

    if (media_type === 'movie') {
      return respond({
        overview: data.overview || null,
        director: findDirector(crew),
        studio: (data.production_companies as { name: string }[])?.[0]?.name ?? null,
        composer: findComposer(crew),
        year: data.release_date ? String(data.release_date).slice(0, 4) : null,
      });
    } else {
      const creators: { name: string }[] = data.created_by ?? [];
      const networks: { name: string }[] = data.networks ?? [];
      return respond({
        overview: data.overview || null,
        created_by: creators.map((c) => c.name).join(', ') || null,
        studio: networks[0]?.name ?? (data.production_companies as { name: string }[])?.[0]?.name ?? null,
        composer: findComposer(crew),
        year: data.first_air_date ? String(data.first_air_date).slice(0, 4) : null,
      });
    }
  } catch (err) {
    return respond({ error: String(err) });
  }
});
