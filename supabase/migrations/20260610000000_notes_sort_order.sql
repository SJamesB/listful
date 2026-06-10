-- Migration: add sort_order to notes for drag-to-reorder
--
-- Run this in the Supabase SQL Editor:
-- https://supabase.com/dashboard/project/plkygtcvjtvwgzfqvznv/sql/new

ALTER TABLE public.notes ADD COLUMN sort_order INTEGER;

WITH ordered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) - 1 AS rn
  FROM public.notes
)
UPDATE public.notes n
SET sort_order = o.rn
FROM ordered o
WHERE n.id = o.id;
