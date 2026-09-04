import { Image } from 'expo-image';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  View,
} from 'react-native';

import { Text } from '@/components/Text';
import { useSectionEdgeScroll, type EdgesChangeHandler } from '@/hooks/use-section-edge-scroll';
import { supabase } from '@/lib/supabase';

const C = {
  text: '#1A1626',
  muted: 'rgba(26,22,38,0.45)',
  accent: '#1DB954',
} as const;

const PADDING = 16;
const ALBUM_SIZE = 44;

interface DBTrack {
  id: string;
  name: string;
  artists: string[];
  album_name: string | null;
  album_image_url: string | null;
  duration_ms: number | null;
  track_position: number | null;
}

interface Props {
  title: string;
  spotifyId: string;
  onEdgesChange?: EdgesChangeHandler;
}

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}:${(s % 60).toString().padStart(2, '0')}`;
}

export default function SpotifyPlaylistPage({ title, spotifyId, onEdgesChange }: Props) {
  const edgeScroll = useSectionEdgeScroll(onEdgesChange);
  const [tracks, setTracks] = useState<DBTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [trackCount, setTrackCount] = useState<number>(0);

  const load = useCallback(async () => {
    const [playlistRes, tracksRes] = await Promise.all([
      supabase
        .from('spotify_playlists')
        .select('image_url, tracks_total')
        .eq('spotify_id', spotifyId)
        .single(),
      supabase
        .from('spotify_tracks')
        .select('id, name, artists, album_name, album_image_url, duration_ms, track_position')
        .eq('playlist_id', spotifyId)
        .order('track_position', { ascending: true }),
    ]);

    if (playlistRes.data) {
      setCoverUrl(playlistRes.data.image_url);
      setTrackCount(playlistRes.data.tracks_total);
    }
    if (tracksRes.data) setTracks(tracksRes.data as DBTrack[]);
    setLoading(false);
  }, [spotifyId]);

  useEffect(() => {
    load();
  }, [load]);

  const renderTrack = ({ item, index }: { item: DBTrack; index: number }) => (
    <View style={styles.row}>
      <Text style={styles.rowIndex}>{index + 1}</Text>
      {item.album_image_url ? (
        <Image
          source={{ uri: item.album_image_url }}
          style={styles.albumArt}
          contentFit="cover"
        />
      ) : (
        <View style={[styles.albumArt, styles.albumFallback]}>
          <Text style={styles.albumEmoji}>🎵</Text>
        </View>
      )}
      <View style={styles.rowInfo}>
        <Text style={styles.trackName} numberOfLines={1}>{item.name}</Text>
        <Text style={styles.trackArtists} numberOfLines={1}>
          {item.artists.join(', ')}
        </Text>
      </View>
      {item.duration_ms ? (
        <Text style={styles.duration}>{formatDuration(item.duration_ms)}</Text>
      ) : null}
    </View>
  );

  return (
    <View style={styles.root}>
      {/* Header */}
      <View style={styles.header}>
        {coverUrl ? (
          <Image source={{ uri: coverUrl }} style={styles.headerCover} contentFit="cover" />
        ) : (
          <View style={[styles.headerCover, styles.headerCoverFallback]}>
            <Text style={styles.headerEmoji}>🎵</Text>
          </View>
        )}
        <View style={styles.headerText}>
          <Text style={styles.headerTitle} numberOfLines={2}>{title}</Text>
          <Text style={styles.headerCount}>{trackCount} tracks</Text>
        </View>
      </View>

      <View style={styles.divider} />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={C.accent} />
        </View>
      ) : tracks.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>No tracks — sync from the Spotify page</Text>
        </View>
      ) : (
        <FlatList
          data={tracks}
          keyExtractor={(item) => item.id}
          renderItem={renderTrack}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          {...edgeScroll}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: PADDING,
    paddingTop: 60,
    paddingBottom: 16,
  },
  headerCover: {
    width: 72,
    height: 72,
    borderRadius: 8,
    backgroundColor: 'rgba(26,22,38,0.08)',
  },
  headerCoverFallback: { alignItems: 'center', justifyContent: 'center' },
  headerEmoji: { fontSize: 28 },
  headerText: { flex: 1, gap: 4 },
  headerTitle: { fontSize: 17, fontWeight: '700', color: C.text, letterSpacing: -0.3 },
  headerCount: { fontSize: 13, color: C.muted },
  divider: {
    height: 1,
    backgroundColor: 'rgba(26,22,38,0.08)',
    marginHorizontal: PADDING,
    marginBottom: 4,
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontSize: 14, color: C.muted, textAlign: 'center', paddingHorizontal: 40 },
  list: { paddingBottom: 80 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: PADDING,
    paddingVertical: 8,
    gap: 10,
  },
  rowIndex: {
    width: 22,
    fontSize: 12,
    color: C.muted,
    textAlign: 'right',
  },
  albumArt: {
    width: ALBUM_SIZE,
    height: ALBUM_SIZE,
    borderRadius: 4,
    backgroundColor: 'rgba(26,22,38,0.08)',
  },
  albumFallback: { alignItems: 'center', justifyContent: 'center' },
  albumEmoji: { fontSize: 18 },
  rowInfo: { flex: 1 },
  trackName: { fontSize: 14, fontWeight: '600', color: C.text },
  trackArtists: { fontSize: 12, color: C.muted, marginTop: 2 },
  duration: { fontSize: 12, color: C.muted },
});
