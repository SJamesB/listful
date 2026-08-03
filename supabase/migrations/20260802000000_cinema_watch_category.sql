ALTER TABLE public.cinema_items
  ADD COLUMN watch_category TEXT CHECK (watch_category IN ('film', 'tv', 'animation'));

UPDATE public.cinema_items
SET watch_category = CASE media_type WHEN 'movie' THEN 'film' WHEN 'tv' THEN 'tv' END
WHERE status IS NOT NULL;
