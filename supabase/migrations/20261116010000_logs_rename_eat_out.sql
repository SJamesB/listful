-- Migration: rename the '🍸 drinks & restaurants' category to
-- '🍺 eat out to help out' (also allows '🎲 boardgames' and '🎭 theatre',
-- so this can be run on its own without 20261116000000).
--
-- Run this in the Supabase SQL Editor:
-- https://supabase.com/dashboard/project/plkygtcvjtvwgzfqvznv/sql/new

-- Step 1: drop existing CHECK constraint on category
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT c.conname
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attnum = ANY(c.conkey) AND a.attrelid = c.conrelid
    WHERE c.conrelid = 'public.logs'::regclass
      AND c.contype = 'c'
      AND a.attname = 'category'
  LOOP
    EXECUTE 'ALTER TABLE public.logs DROP CONSTRAINT ' || quote_ident(r.conname);
  END LOOP;
END $$;

-- Step 2: rename existing rows
UPDATE public.logs SET category = '🍺 eat out to help out' WHERE category = '🍸 drinks & restaurants';

-- Step 3: re-add constraint with the new category list
ALTER TABLE public.logs
  ADD CONSTRAINT logs_category_check
  CHECK (category IN (
    '🎤 gig',
    '🍵 tea',
    '🌶️ chilli',
    '🌍 countries',
    '🐸 wildlife',
    '🍺 eat out to help out',
    '🎲 boardgames',
    '🎭 theatre'
  ));
