ALTER TABLE public.cinema_items
  ALTER COLUMN status DROP NOT NULL,
  ADD COLUMN nine_club_category TEXT CHECK (nine_club_category IN ('film', 'tv', 'animation')),
  ADD COLUMN nine_club_added_at TIMESTAMPTZ;
