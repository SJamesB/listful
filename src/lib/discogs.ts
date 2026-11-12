import { supabase } from '@/lib/supabase';

// One entry of a release's tracklist, as stored in discogs_releases.tracklist
// by the discogs-sync edge function.
export interface Track {
  position: string | null;
  title: string;
  duration: string | null;
  type: 'track' | 'heading' | 'index';
  artists: string | null;
  sub_tracks?: Track[];
}

// The stored tracklist for a release; if it hasn't been backfilled yet, asks
// the edge function to fetch and store it now. Null if it couldn't be loaded.
export async function getTracklist(releaseId: number): Promise<Track[] | null> {
  const { data: stored } = await supabase
    .from('discogs_releases')
    .select('tracklist')
    .eq('release_id', releaseId)
    .maybeSingle();
  if (stored) return stored.tracklist as Track[];
  const { data } = await supabase.functions.invoke<{ tracklist?: Track[] }>('discogs-sync', {
    body: { releaseId },
  });
  return data?.tracklist ?? null;
}

// The tracks a DJ can actually pick: headings dropped, and index tracks
// (e.g. a medley) replaced by their sub-tracks when they have any.
export function playableTracks(tracklist: Track[]): Track[] {
  return tracklist.flatMap((t) => {
    if (t.type === 'heading') return [];
    if (t.type === 'index' && t.sub_tracks?.length) return playableTracks(t.sub_tracks);
    return [t];
  });
}

// "3:45" or "1:02:10" -> seconds; null if missing or unparseable.
export function parseDuration(duration: string | null): number | null {
  if (!duration) return null;
  const parts = duration.split(':').map(Number);
  if (parts.length < 2 || parts.some((n) => !Number.isFinite(n))) return null;
  return parts.reduce((total, n) => total * 60 + n, 0);
}

export function formatDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  const ss = String(s).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}
