-- Record selections: named sub-collections of albums from the Discogs
-- collection (no track-level detail, unlike dj_sets).
--
-- Each selection album keeps its own copy of the album details, so a
-- selection stays intact even if the record later leaves the collection.
-- Written directly by the app, like dj_sets (no RLS).

CREATE TABLE public.record_selections (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.record_selection_albums (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  selection_id UUID NOT NULL REFERENCES public.record_selections (id) ON DELETE CASCADE,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  release_id   INTEGER NOT NULL,
  title        TEXT NOT NULL,
  artists      TEXT,
  year         INTEGER,
  cover_url    TEXT,
  added_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (selection_id, release_id)
);

CREATE INDEX record_selection_albums_order_idx ON public.record_selection_albums (selection_id, sort_order);
