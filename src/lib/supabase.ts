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

export type Frequency = 'daily' | 'weekly' | 'monthly';

export interface RecurringTask {
  id: string;
  name: string;
  active: boolean;
  sort_order: number;
  frequency: Frequency;
  emoji: string | null;
}
