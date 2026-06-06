import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN } from '@/lib/googleConfig';

const TOKEN_KEY  = 'gcal_access_token';
const EXPIRY_KEY = 'gcal_token_expiry';

export async function getStoredToken(): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  const [token, expiry] = await Promise.all([
    SecureStore.getItemAsync(TOKEN_KEY),
    SecureStore.getItemAsync(EXPIRY_KEY),
  ]);
  if (!token || !expiry || Date.now() > Number(expiry)) return null;
  return token;
}

async function storeToken(token: string, expiresIn: number): Promise<void> {
  if (Platform.OS === 'web') return;
  await Promise.all([
    SecureStore.setItemAsync(TOKEN_KEY, token),
    SecureStore.setItemAsync(EXPIRY_KEY, String(Date.now() + expiresIn * 1000)),
  ]);
}

// Silently exchange the refresh token for a short-lived access token.
// Uses SecureStore to cache it so we don't hit the token endpoint on every mount.
export async function getAccessToken(): Promise<string> {
  const cached = await getStoredToken();
  if (cached) return cached;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: GOOGLE_REFRESH_TOKEN,
      grant_type:    'refresh_token',
    }).toString(),
  });

  const data = await res.json();
  if (data.error) throw new Error(data.error_description ?? data.error);

  await storeToken(data.access_token as string, (data.expires_in as number) ?? 3600);
  return data.access_token as string;
}

export interface CalEvent {
  id: string;
  summary: string;
  start: { dateTime?: string; date?: string };
  end:   { dateTime?: string; date?: string };
}

export async function fetchEventsForDate(token: string, date: Date): Promise<CalEvent[]> {
  const start = new Date(date); start.setHours(0, 0, 0, 0);
  const end   = new Date(date); end.setHours(23, 59, 59, 999);

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events` +
    `?timeMin=${encodeURIComponent(start.toISOString())}` +
    `&timeMax=${encodeURIComponent(end.toISOString())}` +
    `&singleEvents=true&orderBy=startTime`,
    { headers: { Authorization: `Bearer ${token}` } },
  );

  if (res.status === 401) throw new Error('UNAUTHORIZED');
  if (!res.ok) throw new Error(`Calendar API ${res.status}`);
  const data = await res.json();
  return (data.items ?? []) as CalEvent[];
}

export function eventTime(event: CalEvent): string {
  if (event.start.date) return 'All day';
  if (!event.start.dateTime) return '';
  return new Date(event.start.dateTime).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}
