-- videogame_items: rename status values to match play/to_play terminology,
-- and add a boolean nine_club flag (replacing nine_club_added_at-is-not-null),
-- matching the cinema_items/library_items pattern. No category axis needed here.

ALTER TABLE public.videogame_items DROP CONSTRAINT videogame_items_status_check;

UPDATE public.videogame_items
SET status = CASE status WHEN 'backlog' THEN 'to_play' WHEN 'played' THEN 'play' END
WHERE status IS NOT NULL;

ALTER TABLE public.videogame_items
  ADD CONSTRAINT videogame_items_status_check CHECK (status IN ('to_play', 'play'));

ALTER TABLE public.videogame_items
  ADD COLUMN nine_club BOOLEAN NOT NULL DEFAULT false;

UPDATE public.videogame_items
SET nine_club = (nine_club_added_at IS NOT NULL);
