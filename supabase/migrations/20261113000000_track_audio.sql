-- Tempo (BPM) and musical key per collection track, keyed the same way the
-- set builder identifies a track: release + tracklist position + title.
--
-- Filled by the track-audio edge function (Deezer search -> ISRC ->
-- ReccoBeats audio features, falling back to Deezer's own BPM). A row with
-- source = 'none' means the lookup found nothing, so it isn't retried.
-- Edited by hand in the app (source = 'manual', confirmed = true); the
-- lookup never touches an existing row, so manual values are never replaced.
-- Written by both the app and the edge function, so no RLS, matching the
-- other user-edited tables.

CREATE TABLE public.track_audio (
  release_id     INTEGER NOT NULL,
  track_position TEXT NOT NULL DEFAULT '',
  track_title    TEXT NOT NULL,
  bpm            NUMERIC(5, 1),
  musical_key    SMALLINT CHECK (musical_key BETWEEN 0 AND 11), -- pitch class, 0 = C
  mode           SMALLINT CHECK (mode IN (0, 1)),               -- 1 = major, 0 = minor
  source         TEXT NOT NULL CHECK (source IN ('reccobeats', 'deezer', 'manual', 'none')),
  confirmed      BOOLEAN NOT NULL DEFAULT false,
  isrc           TEXT,
  matched_artist TEXT,
  matched_title  TEXT,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (release_id, track_position, track_title)
);
