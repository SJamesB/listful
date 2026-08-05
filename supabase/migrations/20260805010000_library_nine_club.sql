-- Rename library_items' favorite/favorite_added_at columns to nine_club/
-- nine_club_added_at, matching the naming already used by cinema_items and
-- videogame_items for the same concept (the "9-Club" list).

ALTER TABLE public.library_items RENAME COLUMN favorite TO nine_club;
ALTER TABLE public.library_items RENAME COLUMN favorite_added_at TO nine_club_added_at;
