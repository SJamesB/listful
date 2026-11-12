import { useEffect, useState } from 'react';

import { fetchAllRows, supabase } from '@/lib/supabase';

// Tempo and key per collection track (table track_audio), filled by the
// track-audio edge function and editable by hand.

export interface TrackAudio {
  release_id: number;
  track_position: string;
  track_title: string;
  bpm: number | null;
  musical_key: number | null; // pitch class, 0 = C
  mode: number | null; // 1 = major, 0 = minor
  source: 'reccobeats' | 'deezer' | 'manual' | 'none';
  confirmed: boolean;
  matched_artist: string | null;
  matched_title: string | null;
}

export const audioKey = (releaseId: number, position: string | null, title: string) =>
  `${releaseId}|${position ?? ''}|${title}`;

const COLUMNS =
  'release_id, track_position, track_title, bpm, musical_key, mode, source, confirmed, matched_artist, matched_title';

// One shared copy for the whole app (about 5k small rows), kept in sync with
// edits and lookups made on any page.
let cache = new Map<string, TrackAudio>();
let loaded: Promise<void> | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

function put(rows: TrackAudio[]) {
  const next = new Map(cache);
  for (const r of rows) {
    next.set(audioKey(r.release_id, r.track_position, r.track_title), { ...r, bpm: r.bpm == null ? null : Number(r.bpm) });
  }
  cache = next;
  notify();
}

export function loadTrackAudio(force = false): Promise<void> {
  if (!loaded || force) {
    loaded = fetchAllRows<TrackAudio>((from, to) =>
      supabase.from('track_audio').select(COLUMNS).range(from, to),
    ).then((rows) => {
      cache = new Map();
      put(rows);
    });
  }
  return loaded;
}

// The current map, re-rendering whenever it changes.
export function useTrackAudio(): Map<string, TrackAudio> {
  const [map, setMap] = useState(cache);
  useEffect(() => {
    const update = () => setMap(cache);
    listeners.add(update);
    loadTrackAudio().then(update);
    return () => {
      listeners.delete(update);
    };
  }, []);
  return map;
}

export async function saveManualAudio(
  releaseId: number,
  position: string | null,
  title: string,
  values: { bpm: number | null; musical_key: number | null; mode: number | null },
): Promise<void> {
  const row = {
    release_id: releaseId,
    track_position: position ?? '',
    track_title: title,
    bpm: values.bpm == null ? null : Math.round(values.bpm * 10) / 10,
    musical_key: values.musical_key,
    mode: values.mode,
    source: 'manual' as const,
    confirmed: true,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase.from('track_audio').upsert(row).select(COLUMNS).single();
  if (error) throw new Error(error.message);
  put([data as TrackAudio]);
}

// Looks up tracks that have no row yet (e.g. just added to a set).
export async function lookUpTrackAudio(
  tracks: { release_id: number; position: string | null; title: string }[],
): Promise<void> {
  const missing = tracks.filter((t) => !cache.has(audioKey(t.release_id, t.position, t.title)));
  if (!missing.length) return;
  const { data } = await supabase.functions.invoke<{ rows?: TrackAudio[] }>('track-audio', {
    body: { tracks: missing },
  });
  if (data?.rows?.length) put(data.rows);
}

// Runs one backfill call; returns how many tracks are still pending.
export async function backfillTrackAudio(): Promise<{ pending: number; lookedUp: number }> {
  const { data, error } = await supabase.functions.invoke<{ pending?: number; looked_up?: number; error?: string }>(
    'track-audio',
    { body: {} },
  );
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  return { pending: data?.pending ?? 0, lookedUp: data?.looked_up ?? 0 };
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

// Camelot wheel numbers by pitch class (0 = C), for major (B) and minor (A).
const CAMELOT_MAJOR = [8, 3, 10, 5, 12, 7, 2, 9, 4, 11, 6, 1];
const CAMELOT_MINOR = [5, 12, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10];
const NOTE_NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];

export function camelot(key: number | null, mode: number | null): string | null {
  if (key == null || mode == null) return null;
  return mode === 1 ? `${CAMELOT_MAJOR[key]}B` : `${CAMELOT_MINOR[key]}A`;
}

export function keyName(key: number | null, mode: number | null): string | null {
  if (key == null || mode == null) return null;
  return `${NOTE_NAMES[key]}${mode === 1 ? '' : 'm'}`;
}

// "8A" -> { musical_key: 9, mode: 0 } (A minor)
export function fromCamelot(code: string): { musical_key: number; mode: number } | null {
  const m = code.match(/^(\d{1,2})([AB])$/);
  if (!m) return null;
  const n = Number(m[1]);
  const table = m[2] === 'B' ? CAMELOT_MAJOR : CAMELOT_MINOR;
  const key = table.indexOf(n);
  return key < 0 ? null : { musical_key: key, mode: m[2] === 'B' ? 1 : 0 };
}

export const formatBpm = (bpm: number) => String(Math.round(bpm));
