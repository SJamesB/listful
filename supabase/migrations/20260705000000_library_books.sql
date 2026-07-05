CREATE TABLE public.library_items (
  id                 UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  olid               TEXT NOT NULL,
  title              TEXT NOT NULL,
  author             TEXT,
  year               TEXT,
  cover_id           INTEGER,
  status             TEXT CHECK (status IN ('to_read', 'read')),
  added_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_at            TIMESTAMPTZ,
  favorite_added_at  TIMESTAMPTZ,
  CONSTRAINT library_items_olid_key UNIQUE (olid)
);
