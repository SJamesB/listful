ALTER TABLE public.library_items DROP CONSTRAINT library_items_google_id_key;
ALTER TABLE public.library_items DROP COLUMN google_id;
ALTER TABLE public.library_items ADD COLUMN genre TEXT;
