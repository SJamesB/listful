-- Spotify backup tables
-- Run in Supabase SQL Editor: Project > SQL Editor > New query

create table if not exists spotify_playlists (
  id           uuid        default gen_random_uuid() primary key,
  spotify_id   text        not null unique,
  name         text        not null,
  description  text,
  image_url    text,
  tracks_total integer     not null default 0,
  owner_name   text,
  pinned       boolean     not null default false,
  page_order   integer,
  synced_at    timestamptz,
  created_at   timestamptz not null default now()
);

create table if not exists spotify_tracks (
  id              uuid        default gen_random_uuid() primary key,
  spotify_id      text        not null,
  playlist_id     text        not null references spotify_playlists(spotify_id) on delete cascade,
  name            text        not null,
  artists         text[]      not null default '{}',
  album_name      text,
  album_image_url text,
  duration_ms     integer,
  added_at        timestamptz,
  track_position  integer,
  synced_at       timestamptz,
  constraint spotify_tracks_unique unique (spotify_id, playlist_id)
);
