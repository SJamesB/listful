-- DJ set builder: named sets of tracks picked from the Discogs collection.
--
-- Each set track keeps its own copy of the track and album details, so a set
-- stays intact even if the record later leaves the collection or its
-- Discogs data changes. Written directly by the app, like the other
-- user-edited tables (no RLS, matching cinema_items, library_items, etc.).

CREATE TABLE public.dj_sets (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.dj_set_tracks (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  set_id         UUID NOT NULL REFERENCES public.dj_sets (id) ON DELETE CASCADE,
  sort_order     INTEGER NOT NULL DEFAULT 0,
  release_id     INTEGER NOT NULL,
  track_position TEXT,
  track_title    TEXT NOT NULL,
  track_artists  TEXT,
  duration       TEXT,
  album_title    TEXT NOT NULL,
  album_artists  TEXT,
  cover_url      TEXT,
  added_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX dj_set_tracks_set_order_idx ON public.dj_set_tracks (set_id, sort_order);
