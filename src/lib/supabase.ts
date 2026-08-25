import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://plkygtcvjtvwgzfqvznv.supabase.co';
const SUPABASE_KEY = 'sb_publishable_IQ52TacbLUs2ZCGnoz-AUg_9TPRTHYU';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});

// This project's Data API has a "Max Rows" setting of 1000, which silently
// clamps any single request's result — including one with an explicit
// larger .limit() — to 1000 rows. Queries that can exceed that (e.g. the
// full dead_shows or dead_songs tables) need to page through with .range()
// instead of trusting a single request to return everything.
const MAX_ROWS_PER_REQUEST = 1000;

export async function fetchAllRows<T>(
  fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null }>,
): Promise<T[]> {
  const all: T[] = [];
  let offset = 0;
  for (;;) {
    const { data } = await fetchPage(offset, offset + MAX_ROWS_PER_REQUEST - 1);
    const page = data ?? [];
    all.push(...page);
    if (page.length < MAX_ROWS_PER_REQUEST) return all;
    offset += MAX_ROWS_PER_REQUEST;
  }
}

export type Frequency = 'daily' | 'weekly' | 'monthly';

export interface RecurringTask {
  id: string;
  name: string;
  active: boolean;
  sort_order: number;
  frequency: Frequency;
  emoji: string | null;
}
