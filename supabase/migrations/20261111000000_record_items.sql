-- Records mirrored from the owner's Discogs collection and wantlist. Rows are
-- written only by the discogs-sync edge function (service role), which
-- replaces each list wholesale on every sync; the app only ever reads them.

CREATE TABLE public.record_items (
  id                 UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  list               TEXT NOT NULL CHECK (list IN ('collection', 'wantlist')),
  discogs_release_id INTEGER NOT NULL,
  title              TEXT NOT NULL,
  artists            TEXT,
  year               INTEGER,
  cover_url          TEXT,
  thumb_url          TEXT,
  formats            TEXT,
  labels             TEXT,
  genres             TEXT[] NOT NULL DEFAULT '{}',
  styles             TEXT[] NOT NULL DEFAULT '{}',
  rating             SMALLINT,
  date_added         TIMESTAMPTZ,
  synced_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT record_items_list_release_key UNIQUE (list, discogs_release_id)
);

CREATE INDEX record_items_list_date_added_idx
  ON public.record_items (list, date_added DESC);

ALTER TABLE public.record_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "record_items are readable by anyone"
  ON public.record_items FOR SELECT
  USING (true);
