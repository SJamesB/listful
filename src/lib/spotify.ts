import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

// expo-secure-store has no web implementation — fall back to localStorage for browser testing
const store = {
  getItemAsync: (key: string): Promise<string | null> =>
    Platform.OS === 'web'
      ? Promise.resolve(localStorage.getItem(key))
      : SecureStore.getItemAsync(key),
  setItemAsync: (key: string, value: string): Promise<void> =>
    Platform.OS === 'web'
      ? Promise.resolve(void localStorage.setItem(key, value))
      : SecureStore.setItemAsync(key, value),
  deleteItemAsync: (key: string): Promise<void> =>
    Platform.OS === 'web'
      ? Promise.resolve(void localStorage.removeItem(key))
      : SecureStore.deleteItemAsync(key),
};

const AUTH_ENDPOINT = 'https://accounts.spotify.com/authorize';
const TOKEN_ENDPOINT = 'https://accounts.spotify.com/api/token';
const API_BASE = 'https://api.spotify.com/v1';

const SCOPES = 'playlist-read-private playlist-read-collaborative';

// On native: custom scheme deep link. On web: current origin (e.g. http://localhost:8081)
export function getRedirectUri(): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return window.location.origin;
  }
  return 'listful://spotify-auth';
}

const KEY = {
  clientId: 'spotify_client_id',
  accessToken: 'spotify_access_token',
  refreshToken: 'spotify_refresh_token',
  expiresAt: 'spotify_expires_at',
} as const;

// ─── PKCE ─────────────────────────────────────────────────────────────────────

function randomString(length: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const bytes = Crypto.getRandomBytes(length);
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

async function sha256Base64Url(plain: string): Promise<string> {
  const digest = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    plain,
    { encoding: Crypto.CryptoEncoding.BASE64 },
  );
  return digest.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// ─── Client ID storage ────────────────────────────────────────────────────────

export async function getClientId(): Promise<string | null> {
  return store.getItemAsync(KEY.clientId);
}

export async function setClientId(id: string): Promise<void> {
  await store.setItemAsync(KEY.clientId, id);
}

// ─── Token storage ────────────────────────────────────────────────────────────

async function loadTokens() {
  const [accessToken, refreshToken, expiresAtStr] = await Promise.all([
    store.getItemAsync(KEY.accessToken),
    store.getItemAsync(KEY.refreshToken),
    store.getItemAsync(KEY.expiresAt),
  ]);
  return {
    accessToken,
    refreshToken,
    expiresAt: expiresAtStr ? parseInt(expiresAtStr, 10) : 0,
  };
}

async function storeTokens(
  accessToken: string,
  refreshToken: string | null,
  expiresIn: number,
) {
  const expiresAt = Date.now() + expiresIn * 1000 - 60_000;
  const ops: Promise<void>[] = [
    store.setItemAsync(KEY.accessToken, accessToken),
    store.setItemAsync(KEY.expiresAt, String(expiresAt)),
  ];
  if (refreshToken) ops.push(store.setItemAsync(KEY.refreshToken, refreshToken));
  await Promise.all(ops);
}

export async function clearAuth(): Promise<void> {
  await Promise.all([
    store.deleteItemAsync(KEY.accessToken),
    store.deleteItemAsync(KEY.refreshToken),
    store.deleteItemAsync(KEY.expiresAt),
  ]);
}

export async function isAuthenticated(): Promise<boolean> {
  const token = await store.getItemAsync(KEY.accessToken);
  return !!token;
}

// ─── OAuth PKCE flow ──────────────────────────────────────────────────────────

async function exchangeCodeForTokens(
  code: string,
  verifier: string,
  redirectUri: string,
  clientId: string,
): Promise<void> {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      code_verifier: verifier,
    }).toString(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token exchange failed ${res.status}: ${text}`);
  }
  const json = await res.json();
  await storeTokens(json.access_token, json.refresh_token ?? null, json.expires_in ?? 3600);
}

export async function startAuth(): Promise<boolean> {
  const clientId = await getClientId();
  if (!clientId) throw new Error('no_client_id');

  const verifier = randomString(64);
  const challenge = await sha256Base64Url(verifier);
  const redirectUri = getRedirectUri();

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    scope: SCOPES,
    code_challenge_method: 'S256',
    code_challenge: challenge,
  });

  if (Platform.OS === 'web') {
    // Store verifier before navigating away — needed when we come back
    await store.setItemAsync('spotify_pkce_verifier', verifier);
    window.location.href = `${AUTH_ENDPOINT}?${params}`;
    return new Promise(() => {}); // page navigates away, never resolves
  }

  // Native: open in-app browser popup
  const result = await WebBrowser.openAuthSessionAsync(
    `${AUTH_ENDPOINT}?${params}`,
    redirectUri,
  );

  if (result.type !== 'success') return false;

  const code = new URLSearchParams(result.url.split('?')[1] ?? '').get('code');
  if (!code) return false;

  await exchangeCodeForTokens(code, verifier, redirectUri, clientId);
  return true;
}

// Called on web after Spotify redirects back with ?code=
export async function completeWebAuth(code: string): Promise<void> {
  const [verifier, clientId] = await Promise.all([
    store.getItemAsync('spotify_pkce_verifier'),
    getClientId(),
  ]);
  if (!verifier || !clientId) throw new Error('Missing PKCE state — try connecting again');
  await exchangeCodeForTokens(code, verifier, getRedirectUri(), clientId);
  await store.deleteItemAsync('spotify_pkce_verifier');
}

// ─── Token refresh ────────────────────────────────────────────────────────────

async function refreshAccessToken(): Promise<string> {
  const { refreshToken } = await loadTokens();
  const clientId = await getClientId();
  if (!refreshToken || !clientId) throw new Error('not_authenticated');

  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
    }).toString(),
  });

  if (!res.ok) throw new Error(`Token refresh failed: ${res.status}`);

  const json = await res.json();
  await storeTokens(
    json.access_token,
    json.refresh_token ?? refreshToken,
    json.expires_in ?? 3600,
  );
  return json.access_token;
}

export async function getAccessToken(): Promise<string> {
  const { accessToken, expiresAt } = await loadTokens();
  if (!accessToken) throw new Error('not_authenticated');
  if (Date.now() < expiresAt) return accessToken;
  return refreshAccessToken();
}

// ─── API ──────────────────────────────────────────────────────────────────────

async function apiFetch(url: string) {
  const token = await getAccessToken();
  const fullUrl = url.startsWith('http') ? url : `${API_BASE}${url}`;
  const res = await fetch(fullUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Spotify ${res.status}: ${url}`);
  return res.json();
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SpotifyPlaylist {
  id: string;
  name: string;
  description: string;
  images: { url: string }[];
  tracks: { total: number };
  owner: { id: string; display_name: string };
  collaborative: boolean;
  public: boolean | null;
  snapshot_id: string;
  external_urls: { spotify: string };
}

export interface SpotifyTrackItem {
  added_at: string | null;
  added_by: { id: string } | null;
  is_local: boolean;
  track: {
    id: string | null;
    name: string;
    duration_ms: number;
    explicit: boolean;
    popularity: number;
    preview_url: string | null;
    track_number: number;
    disc_number: number;
    artists: { id: string; name: string }[];
    album: {
      id: string;
      name: string;
      album_type: string;
      total_tracks: number;
      images: { url: string }[];
      release_date: string;
      release_date_precision: string;
    };
    external_ids: { isrc?: string };
    external_urls: { spotify: string };
  } | null;
}

// ─── Paginated fetchers ───────────────────────────────────────────────────────

export async function fetchAllPlaylists(): Promise<SpotifyPlaylist[]> {
  const results: SpotifyPlaylist[] = [];
  let next: string | null = `${API_BASE}/me/playlists?limit=50`;
  while (next) {
    const data = await apiFetch(next);
    results.push(...(data.items ?? []).filter(Boolean));
    next = data.next ?? null;
  }
  return results;
}

export async function fetchPlaylistTracks(playlistId: string): Promise<SpotifyTrackItem[]> {
  const results: SpotifyTrackItem[] = [];
  let next: string | null = `${API_BASE}/playlists/${playlistId}/tracks?limit=100`;
  while (next) {
    const data = await apiFetch(next);
    // Filter out null tracks (deleted) and local files (no Spotify ID)
    results.push(...(data.items ?? []).filter((i: SpotifyTrackItem) => i.track?.id));
    next = data.next ?? null;
  }
  return results;
}
