-- Flag playlists that are just an album saved as a playlist
-- Run in Supabase SQL Editor: Project > SQL Editor > New query

alter table spotify_playlists
  add column if not exists is_album_playlist boolean not null default false;
