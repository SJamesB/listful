-- Segued track titles like "Sugar Magnolia > Sunshine Daydream" previously
-- counted as one combined "song" in dead_songs stats. Split each track's
-- (normalized) title on the segue marker '>' so a segued track credits every
-- song it contains -- e.g. "Drums > Space" counts once each for Drums and
-- Space, matching how deadheads think about play counts.

CREATE OR REPLACE FUNCTION public.dead_song_titles(raw_title text)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT array(
    SELECT btrim(seg)
    FROM unnest(string_to_array(
      btrim(
        regexp_replace(
          regexp_replace(
            regexp_replace(
              regexp_replace(coalesce(raw_title, ''), '^gd[0-9_.\-]+\s*(s[0-9]+\s*)?t?[0-9]+\s+', '', 'i'),
              '^[0-9]+\s*[-:.]?\s*', ''
            ),
            '[\s\->/]+$', ''
          ),
          '\s+', ' ', 'g'
        )
      ),
      '>'
    )) AS seg
    WHERE btrim(seg) <> ''
  );
$$;

CREATE OR REPLACE FUNCTION public.dead_song_titles_lower(raw_title text)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT array(SELECT lower(s) FROM unnest(public.dead_song_titles(raw_title)) AS s);
$$;

-- song_titles: original-case song names in this track (1 for a plain track,
-- 2+ for a segue). song_titles_lower: same, lowercased, for case-insensitive
-- containment lookups from the app.
ALTER TABLE public.dead_tracks
  ADD COLUMN song_titles TEXT[] GENERATED ALWAYS AS (public.dead_song_titles(title)) STORED,
  ADD COLUMN song_titles_lower TEXT[] GENERATED ALWAYS AS (public.dead_song_titles_lower(title)) STORED;

CREATE INDEX dead_tracks_song_titles_lower_gin_idx ON public.dead_tracks USING gin (song_titles_lower);

-- Rebuild dead_songs to aggregate per individual song rather than per whole
-- (possibly segued) track title.
CREATE OR REPLACE VIEW public.dead_songs AS
SELECT
  (array_agg(song_title ORDER BY title_count DESC))[1] AS title,
  sum(title_count) AS times_played
FROM (
  SELECT song_title, count(*) AS title_count
  FROM public.dead_tracks, LATERAL unnest(song_titles) AS song_title
  WHERE song_title <> ''
    AND song_title !~* '^(tuning|crowd|filler|announcement|applause|intro|outro)\M'
  GROUP BY song_title
) counted
GROUP BY lower(song_title);
