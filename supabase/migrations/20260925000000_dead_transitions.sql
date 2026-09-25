-- Transitions: a track whose title ends in ' >' segues into the next track of
-- the same show (ordered by track_number, then id). Two shapes are exposed:
--   kind = 'pair' -- every adjacent A > B link, including links that sit
--                    inside a longer run (so "Drums > Space" counts every time
--                    it happens, whatever surrounds it).
--   kind = 'run'  -- each unbroken chain of 3+ songs, taken as a whole
--                    (maximal: it starts after a track that doesn't segue and
--                    ends on the first track that doesn't).
-- transition_key is the lowercased ' > '-joined song list, used to group and
-- to look up one transition's performances from the app.

CREATE OR REPLACE VIEW public.dead_transition_performances
WITH (security_invoker = on) AS
WITH ordered AS (
  SELECT
    t.show_id,
    t.track_number,
    t.normalized_title AS song,
    t.length_seconds,
    (t.title ~ '\s>\s*$') AS segues,
    row_number() OVER (PARTITION BY t.show_id ORDER BY t.track_number, t.id) AS pos
  FROM public.dead_tracks t
  WHERE t.show_id IS NOT NULL
    AND coalesce(t.normalized_title, '') <> ''
),
linked AS (
  SELECT
    o.*,
    coalesce(lag(o.segues) OVER w, false) AS prev_segues,
    lead(o.song) OVER w AS next_song,
    lead(o.length_seconds) OVER w AS next_length
  FROM ordered o
  WINDOW w AS (PARTITION BY o.show_id ORDER BY o.pos)
),
grouped AS (
  SELECT
    l.*,
    sum(CASE WHEN l.prev_segues THEN 0 ELSE 1 END) OVER (PARTITION BY l.show_id ORDER BY l.pos) AS run_id
  FROM linked l
),
performances AS (
  SELECT
    'pair'::text AS kind,
    show_id,
    track_number AS start_track,
    ARRAY[song, next_song] AS songs,
    length_seconds + next_length AS length_seconds
  FROM linked
  WHERE segues AND next_song IS NOT NULL
  UNION ALL
  SELECT
    'run'::text,
    show_id,
    min(track_number),
    array_agg(song ORDER BY pos),
    -- Only report a run's length when every track in it has one
    CASE WHEN count(length_seconds) = count(*) THEN sum(length_seconds) END
  FROM grouped
  GROUP BY show_id, run_id
  HAVING count(*) >= 3
)
SELECT
  p.kind,
  lower(array_to_string(p.songs, ' > ')) AS transition_key,
  array_to_string(p.songs, ' > ') AS title,
  cardinality(p.songs) AS song_count,
  p.show_id,
  p.start_track,
  p.length_seconds,
  s.date,
  s.venue,
  s.city,
  s.state
FROM performances p
LEFT JOIN public.dead_shows s ON s.show_id = p.show_id;

CREATE OR REPLACE VIEW public.dead_transitions
WITH (security_invoker = on) AS
SELECT
  kind,
  transition_key,
  mode() WITHIN GROUP (ORDER BY title) AS title,
  max(song_count) AS song_count,
  count(*) AS times_played
FROM public.dead_transition_performances
GROUP BY kind, transition_key;
