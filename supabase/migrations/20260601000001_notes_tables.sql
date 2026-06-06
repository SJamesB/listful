-- Migration: create notes and notes_archive tables
--
-- Run this in the Supabase SQL Editor:
-- https://supabase.com/dashboard/project/plkygtcvjtvwgzfqvznv/sql/new

CREATE TABLE public.notes (
  id         UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  title      TEXT        NOT NULL DEFAULT '',
  content    TEXT        NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.notes_archive (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  title       TEXT        NOT NULL DEFAULT '',
  content     TEXT        NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL,
  archived_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
