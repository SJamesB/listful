DROP TABLE IF EXISTS public.imdb_items;

CREATE TABLE public.cinema_items (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tmdb_id     INTEGER NOT NULL,
  media_type  TEXT NOT NULL CHECK (media_type IN ('movie', 'tv')),
  title       TEXT NOT NULL,
  year        TEXT,
  poster_path TEXT,
  status      TEXT NOT NULL CHECK (status IN ('to_watch', 'watched')),
  user_rating INTEGER,
  added_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  watched_at  TIMESTAMPTZ,
  CONSTRAINT cinema_items_tmdb_id_media_type_key UNIQUE (tmdb_id, media_type)
);
