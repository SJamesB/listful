-- Migration: add the Drinks & Restaurants category to logs
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

-- Step 2: re-add constraint including the new category
ALTER TABLE public.logs
  ADD CONSTRAINT logs_category_check
  CHECK (category IN (
    '🎤 gig',
    '🍵 tea',
    '🌶️ chilli',
    '🌍 countries',
    '🐸 wildlife',
    '🍸 drinks & restaurants'
  ));
