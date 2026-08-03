ALTER TABLE public.videogame_items DROP CONSTRAINT videogame_items_rawg_id_key;
ALTER TABLE public.videogame_items ALTER COLUMN rawg_id TYPE TEXT USING rawg_id::TEXT;
ALTER TABLE public.videogame_items RENAME COLUMN rawg_id TO giantbomb_id;
ALTER TABLE public.videogame_items ADD CONSTRAINT videogame_items_giantbomb_id_key UNIQUE (giantbomb_id);
