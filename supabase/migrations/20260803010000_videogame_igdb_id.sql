ALTER TABLE public.videogame_items DROP CONSTRAINT videogame_items_giantbomb_id_key;
ALTER TABLE public.videogame_items RENAME COLUMN giantbomb_id TO igdb_id;
ALTER TABLE public.videogame_items ADD CONSTRAINT videogame_items_igdb_id_key UNIQUE (igdb_id);
