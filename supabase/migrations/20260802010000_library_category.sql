ALTER TABLE public.library_items
  ADD COLUMN category TEXT CHECK (category IN ('fiction', 'non_fiction', 'graphic_novel'));

UPDATE public.library_items
SET category = CASE
  WHEN genre ILIKE '%comic%' OR genre ILIKE '%graphic novel%' THEN 'graphic_novel'
  WHEN genre ILIKE '%non-fiction%' OR genre ILIKE '%nonfiction%' OR genre ILIKE '%biograph%'
    OR genre ILIKE '%history%' OR genre ILIKE '%memoir%' OR genre ILIKE '%self-help%'
    OR genre ILIKE '%true crime%' THEN 'non_fiction'
  ELSE 'fiction'
END;
