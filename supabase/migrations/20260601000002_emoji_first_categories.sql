-- Migration: move emoji to front of category values  (word 🐸 → 🐸 word)
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

-- Step 2: swap emoji to front
UPDATE public.logs SET category = '🎤 gig'        WHERE category = 'gig 🎤';
UPDATE public.logs SET category = '📖 book'       WHERE category = 'book 📖';
UPDATE public.logs SET category = '🍵 tea'        WHERE category = 'tea 🍵';
UPDATE public.logs SET category = '🌶️ chilli'    WHERE category = 'chilli 🌶️';
UPDATE public.logs SET category = '🌍 countries'  WHERE category = 'countries 🌍';
UPDATE public.logs SET category = '🐸 wildlife'   WHERE category = 'wildlife 🐸';

-- Step 3: re-add constraint with new values
ALTER TABLE public.logs
  ADD CONSTRAINT logs_category_check
  CHECK (category IN (
    '🎤 gig',
    '📖 book',
    '🍵 tea',
    '🌶️ chilli',
    '🌍 countries',
    '🐸 wildlife'
  ));
