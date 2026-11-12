-- Per-release details fetched from Discogs /releases/{id}, shared by the
-- collection and wantlist rows in record_items (joined on release_id).
-- Filled in gradually by the discogs-sync edge function, since Discogs allows
-- only 60 requests a minute and each release needs its own request.
--
-- tracklist is an array of
--   { position, title, duration, type: 'track' | 'heading' | 'index',
--     artists, sub_tracks? }
-- and is [] for a release Discogs no longer has, so it is not retried.

CREATE TABLE public.discogs_releases (
  release_id INTEGER PRIMARY KEY,
  tracklist  JSONB NOT NULL DEFAULT '[]'::jsonb,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.discogs_releases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "discogs_releases are readable by anyone"
  ON public.discogs_releases FOR SELECT
  USING (true);
