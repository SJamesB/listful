ALTER TABLE public.library_items DROP CONSTRAINT library_items_olid_key;
ALTER TABLE public.library_items RENAME COLUMN olid TO google_id;
ALTER TABLE public.library_items ADD CONSTRAINT library_items_google_id_key UNIQUE (google_id);

ALTER TABLE public.library_items DROP COLUMN cover_id;
ALTER TABLE public.library_items ADD COLUMN cover_url TEXT;
