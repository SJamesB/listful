-- Lets songs (not just shows) be favourited. Songs aren't a base table (they're
-- aggregated from dead_tracks in the dead_songs view), so favourites are kept
-- in their own small table keyed by the lowercased song title -- the same key
-- already used for song_titles_lower containment lookups -- and joined into
-- the view.
CREATE TABLE public.dead_song_favourites (
  title_lower TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE VIEW public.dead_songs AS
SELECT
  agg.title,
  agg.times_played,
  (f.title_lower IS NOT NULL) AS favourite
FROM (
  SELECT
    (array_agg(song_title ORDER BY title_count DESC))[1] AS title,
    sum(title_count) AS times_played,
    lower(song_title) AS title_lower
  FROM (
    SELECT song_title, count(*) AS title_count
    FROM public.dead_tracks, LATERAL unnest(song_titles) AS song_title
    WHERE song_title <> ''
      AND song_title !~* '^(tuning|crowd|filler|announcement|applause|intro|outro)\M'
    GROUP BY song_title
  ) counted
  GROUP BY lower(song_title)
) agg
LEFT JOIN public.dead_song_favourites f ON f.title_lower = agg.title_lower;
