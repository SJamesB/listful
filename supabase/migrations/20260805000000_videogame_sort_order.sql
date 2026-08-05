-- Add sort_order to videogame_items for manual drag-to-reorder, matching the
-- cinema_items/library_items pattern. Backfill so higher sort_order = more
-- recently played/added/nine-clubbed, consistent with those tables' load()
-- queries ordering sort_order descending.
--
-- Note: sort_order already exists in the remote DB from a migration named
-- videogame_sort_order (applied 2026-08-04), which was never committed to
-- this repo's migrations folder and left one row with a null sort_order -
-- this migration accounts for that drift by recomputing all values cleanly.

ALTER TABLE public.videogame_items ADD COLUMN IF NOT EXISTS sort_order INTEGER;

WITH ordered AS (
  SELECT id, ROW_NUMBER() OVER (
    PARTITION BY COALESCE(status, 'nine_club')
    ORDER BY COALESCE(played_at, nine_club_added_at, added_at)
  ) - 1 AS rn
  FROM public.videogame_items
)
UPDATE public.videogame_items v
SET sort_order = o.rn
FROM ordered o
WHERE v.id = o.id;
