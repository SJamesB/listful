import { supabase } from '@/lib/supabase';

export interface CalEvent {
  id: string;
  summary: string;
  start: { dateTime?: string; date?: string };
  end:   { dateTime?: string; date?: string };
}

// Fetches events for each `YYYY-MM-DD` date key via the google-calendar-events
// Edge Function, which holds the OAuth credentials server-side.
export async function fetchEventsForDates(dateKeys: string[]): Promise<Record<string, CalEvent[]>> {
  const { data, error } = await supabase.functions.invoke('google-calendar-events', {
    body: { dates: dateKeys },
  });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  return (data?.events ?? {}) as Record<string, CalEvent[]>;
}

export function eventTime(event: CalEvent): string {
  if (event.start.date) return 'All day';
  if (!event.start.dateTime) return '';
  return new Date(event.start.dateTime).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}
