-- Restructure cinema_items:
--   - merge media_type ('movie'/'tv'), watch_category, and nine_club_category
--     (both 'film'/'tv'/'animation') into a single `category` column
--   - replace nine_club_category with a boolean `nine_club` flag
--   - drop unused user_rating and added_at
--   - add sort_order for manual drag-to-reorder
--
-- Note: watch_category (film/tv/animation) already exists in the remote DB from
-- migration 20260802132336_cinema_watch_category, which was never committed to
-- this repo's migrations folder - this migration accounts for that drift.
--
-- category -> TMDB type mapping used elsewhere in the app: 'film' = TMDB movie,
-- 'tv' and 'animation' both = TMDB tv (animation is TV-only, e.g. anime).

ALTER TABLE public.cinema_items
  ADD COLUMN category TEXT,
  ADD COLUMN nine_club BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN sort_order INTEGER;

UPDATE public.cinema_items
SET category = COALESCE(
      watch_category,
      nine_club_category,
      CASE media_type WHEN 'movie' THEN 'film' WHEN 'tv' THEN 'tv' END
    ),
    nine_club = (nine_club_category IS NOT NULL);

ALTER TABLE public.cinema_items
  ALTER COLUMN category SET NOT NULL,
  ADD CONSTRAINT cinema_items_category_check CHECK (category IN ('tv', 'film', 'animation'));

WITH ordered AS (
  SELECT id, ROW_NUMBER() OVER (
    PARTITION BY category, COALESCE(status, 'nine_club')
    ORDER BY COALESCE(watched_at, nine_club_added_at, added_at)
  ) - 1 AS rn
  FROM public.cinema_items
)
UPDATE public.cinema_items c
SET sort_order = o.rn
FROM ordered o
WHERE c.id = o.id;

ALTER TABLE public.cinema_items DROP CONSTRAINT cinema_items_tmdb_id_media_type_key;
ALTER TABLE public.cinema_items ADD CONSTRAINT cinema_items_tmdb_id_category_key UNIQUE (tmdb_id, category);

ALTER TABLE public.cinema_items
  DROP COLUMN media_type,
  DROP COLUMN watch_category,
  DROP COLUMN nine_club_category,
  DROP COLUMN user_rating,
  DROP COLUMN added_at;
