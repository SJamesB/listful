// ─── Google Calendar Integration ─────────────────────────────────────────────
//
// The OAuth client secret and refresh token live server-side only, as
// Supabase Edge Function secrets (see supabase/functions/google-calendar-events)
// — never in client code, since this app's web build is public.
//
// Flip off to hide the calendar section, e.g. on a fork without the
// integration configured.
export const GOOGLE_CALENDAR_ENABLED = true;
