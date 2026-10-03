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
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const { data, error } = await supabase.functions.invoke('google-calendar-events', {
    body: { dates: dateKeys, timeZone },
  });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  return (data?.events ?? {}) as Record<string, CalEvent[]>;
}

function localDateKey(d: Date): string {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${da}`;
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Time label for `event` as shown on the `YYYY-MM-DD` day `dateKey`. Timed
// events spanning several days show their start time on the first day,
// "Until <end>" on the last, and "All day" on any day in between.
export function eventTime(event: CalEvent, dateKey?: string): string {
  if (event.start.date) return 'All day';
  if (!event.start.dateTime) return '';
  const start = new Date(event.start.dateTime);
  if (!dateKey || localDateKey(start) >= dateKey) return formatTime(start);
  if (!event.end.dateTime) return 'All day';
  const end = new Date(event.end.dateTime);
  return localDateKey(new Date(end.getTime() - 1)) === dateKey ? `Until ${formatTime(end)}` : 'All day';
}
