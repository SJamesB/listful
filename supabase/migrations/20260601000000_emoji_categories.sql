-- Migration: add emoji suffix to logs.category values
--
-- Run this in the Supabase SQL Editor:
-- https://supabase.com/dashboard/project/plkygtcvjtvwgzfqvznv/sql/new

-- Step 1: drop existing CHECK constraint on the category column
-- (handles any auto-generated constraint name)
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

-- Step 2: update existing rows to emoji-suffixed values
UPDATE public.logs SET category = 'gig 🎤'        WHERE category = 'gig';
UPDATE public.logs SET category = 'book 📖'       WHERE category = 'book';
UPDATE public.logs SET category = 'tea 🍵'        WHERE category = 'tea';
UPDATE public.logs SET category = 'chilli 🌶️'    WHERE category = 'chili';
UPDATE public.logs SET category = 'countries 🌍'  WHERE category = 'country';
UPDATE public.logs SET category = 'wildlife 🐸'   WHERE category = 'wildlife';

-- Step 3: re-add constraint with new values
-- To allow future ad-hoc categories without another migration, remove this block.
ALTER TABLE public.logs
  ADD CONSTRAINT logs_category_check
  CHECK (category IN (
    'gig 🎤',
    'book 📖',
    'tea 🍵',
    'chilli 🌶️',
    'countries 🌍',
    'wildlife 🐸'
  ));
