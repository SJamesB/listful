-- Restructure library_items to match the cinema_items pattern:
--   - make `category` (fiction/non_fiction/graphic_novel) NOT NULL - it already
--     exists in the remote DB from migration 20260802133333_library_category,
--     which was never committed to this repo's migrations folder
--   - replace favorite_added_at-is-not-null with a boolean `favorite` flag
--   - drop unused added_at
--   - add sort_order for manual drag-to-reorder

ALTER TABLE public.library_items
  ADD COLUMN favorite BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN sort_order INTEGER;

UPDATE public.library_items
SET favorite = (favorite_added_at IS NOT NULL);

ALTER TABLE public.library_items
  ALTER COLUMN category SET NOT NULL;

WITH ordered AS (
  SELECT id, ROW_NUMBER() OVER (
    PARTITION BY category, COALESCE(status, 'favorite')
    ORDER BY COALESCE(read_at, favorite_added_at, added_at)
  ) - 1 AS rn
  FROM public.library_items
)
UPDATE public.library_items l
SET sort_order = o.rn
FROM ordered o
WHERE l.id = o.id;

ALTER TABLE public.library_items DROP COLUMN added_at;
