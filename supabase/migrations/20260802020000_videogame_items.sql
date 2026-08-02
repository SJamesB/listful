CREATE TABLE public.videogame_items (
  id                 UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  rawg_id            INTEGER NOT NULL,
  title              TEXT NOT NULL,
  year               TEXT,
  cover_url          TEXT,
  status             TEXT CHECK (status IN ('backlog', 'played')),
  added_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  played_at          TIMESTAMPTZ,
  nine_club_added_at TIMESTAMPTZ,
  CONSTRAINT videogame_items_rawg_id_key UNIQUE (rawg_id)
);
