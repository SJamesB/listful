-- Expand Spotify backup columns
-- Run in Supabase SQL Editor: Project > SQL Editor > New query

alter table spotify_playlists
  add column if not exists owner_id      text,
  add column if not exists collaborative boolean not null default false,
  add column if not exists public        boolean,
  add column if not exists snapshot_id   text,
  add column if not exists spotify_url   text;

alter table spotify_tracks
  add column if not exists artist_ids             text[]  not null default '{}',
  add column if not exists explicit               boolean,
  add column if not exists popularity             integer,
  add column if not exists preview_url            text,
  add column if not exists release_date           text,
  add column if not exists release_date_precision text,
  add column if not exists album_id               text,
  add column if not exists album_type             text,
  add column if not exists album_total_tracks     integer,
  add column if not exists isrc                   text,
  add column if not exists spotify_url            text,
  add column if not exists added_by_id            text,
  add column if not exists is_local               boolean not null default false,
  add column if not exists track_number           integer,
  add column if not exists disc_number            integer;
