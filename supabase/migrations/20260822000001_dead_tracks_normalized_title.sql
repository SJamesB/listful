-- Strips archive.org filename cruft (date/set/track prefixes, leading track
-- numbers, trailing segue markers like " >" / "-->") from dead_tracks.title
-- so the Stats page can group/search performances of the same song.
ALTER TABLE public.dead_tracks
  ADD COLUMN normalized_title TEXT GENERATED ALWAYS AS (
    btrim(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            regexp_replace(coalesce(title, ''), '^gd[0-9_.\-]+\s*(s[0-9]+\s*)?t?[0-9]+\s+', '', 'i'),
            '^[0-9]+\s*[-:.]?\s*', ''
          ),
          '[\s\->/]+$', ''
        ),
        '\s+', ' ', 'g'
      )
    )
  ) STORED;

CREATE INDEX dead_tracks_normalized_title_idx ON public.dead_tracks (normalized_title);

-- Distinct songs with play counts, for the Stats page's song search/typeahead.
-- Excludes non-song filler (tuning, crowd noise, announcements, etc.) and
-- folds case variants (e.g. "tuning" / "Tuning") into one row.
CREATE OR REPLACE VIEW public.dead_songs AS
SELECT
  (array_agg(normalized_title ORDER BY title_count DESC))[1] AS title,
  sum(title_count) AS times_played
FROM (
  SELECT normalized_title, count(*) AS title_count
  FROM public.dead_tracks
  WHERE normalized_title <> ''
    AND normalized_title !~* '^(tuning|crowd|filler|announcement|applause|intro|outro)\M'
  GROUP BY normalized_title
) counted
GROUP BY lower(normalized_title);
