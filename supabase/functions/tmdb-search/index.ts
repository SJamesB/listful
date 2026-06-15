const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const TMDB_BASE = 'https://api.themoviedb.org/3';

interface CinemaResult {
  tmdb_id: number;
  media_type: 'movie' | 'tv';
  title: string;
  year: string | null;
  poster_path: string | null;
}

interface TMDBResult {
  id: number;
  media_type?: 'movie' | 'tv' | 'person';
  title?: string;
  name?: string;
  release_date?: string;
  first_air_date?: string;
  poster_path: string | null;
}

function respond(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

function toResult(item: TMDBResult, fallbackType?: 'movie' | 'tv'): CinemaResult | null {
  const media_type = item.media_type ?? fallbackType;
  if (media_type !== 'movie' && media_type !== 'tv') return null;

  const title = media_type === 'movie' ? item.title : item.name;
  if (!title) return null;

  const date = media_type === 'movie' ? item.release_date : item.first_air_date;
  const year = date ? date.slice(0, 4) : null;

  return { tmdb_id: item.id, media_type, title, year, poster_path: item.poster_path ?? null };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  try {
    const apiKey = Deno.env.get('TMDB_API_KEY');
    if (!apiKey) return respond({ error: 'TMDB_API_KEY is not configured' });

    const body = await req.json();
    const { query, mediaType } = body as { query?: string; mediaType?: 'movie' | 'tv' };
    if (!query?.trim()) return respond({ error: 'query is required' });

    const endpoint = mediaType === 'movie' ? 'search/movie'
      : mediaType === 'tv' ? 'search/tv'
      : 'search/multi';

    const url = `${TMDB_BASE}/${endpoint}?api_key=${apiKey}&query=${encodeURIComponent(query.trim())}`;
    const res = await fetch(url);

    if (!res.ok) {
      return respond({ error: `TMDB returned HTTP ${res.status}` });
    }

    const data = await res.json();
    const results = ((data.results ?? []) as TMDBResult[])
      .map((item) => toResult(item, mediaType))
      .filter((item): item is CinemaResult => item !== null);

    return respond({ results });
  } catch (err) {
    return respond({ error: String(err) });
  }
});
