CREATE TABLE IF NOT EXISTS public.imdb_items (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  imdb_id      TEXT NOT NULL,
  title        TEXT NOT NULL,
  year         TEXT,
  media_type   TEXT NOT NULL DEFAULT 'Movie',
  poster_url   TEXT,
  user_rating  INTEGER,
  source       TEXT NOT NULL,
  list_id      TEXT,
  list_name    TEXT,
  synced_at    TIMESTAMPTZ DEFAULT now(),
  created_at   TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT imdb_items_imdb_id_source_key UNIQUE (imdb_id, source)
);
