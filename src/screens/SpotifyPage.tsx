import { Image } from 'expo-image';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';

import { Text } from '@/components/Text';
import { TextInput } from '@/components/TextInput';
import { useSectionEdgeScroll, type EdgesChangeHandler } from '@/hooks/use-section-edge-scroll';
import { supabase } from '@/lib/supabase';
import {
  clearAuth,
  fetchAllPlaylists,
  fetchPlaylistTracks,
  getClientId,
  isAuthenticated,
  setClientId,
  startAuth,
} from '@/lib/spotify';

const C = {
  text: '#1A1626',
  muted: 'rgba(26,22,38,0.45)',
  accent: '#1DB954',
} as const;

const COLS = 2;
const PADDING = 16;
const GAP = 12;

interface DBPlaylist {
  id: string;
  spotify_id: string;
  name: string;
  image_url: string | null;
  tracks_total: number;
  pinned: boolean;
}

interface Props {
  onPinsChanged?: () => void;
  onEdgesChange?: EdgesChangeHandler;
}

export default function SpotifyPage({ onPinsChanged, onEdgesChange }: Props) {
  const edgeScroll = useSectionEdgeScroll(onEdgesChange);
  const { width } = useWindowDimensions();
  const cardWidth = (width - PADDING * 2 - GAP) / COLS;

  const [playlists, setPlaylists] = useState<DBPlaylist[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState('');
  const [syncError, setSyncError] = useState<string | null>(null);
  const [authed, setAuthed] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [clientIdDraft, setClientIdDraft] = useState('');

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('spotify_playlists')
      .select('id, spotify_id, name, image_url, tracks_total, pinned')
      .eq('is_album_playlist', false)
      .order('name');
    if (data) setPlaylists(data as DBPlaylist[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    const init = async () => {
      const ok = await isAuthenticated();
      setAuthed(ok);
      await load();
    };
    init();
  }, [load]);

  const openSetup = async () => {
    const saved = await getClientId();
    setClientIdDraft(saved ?? '');
    setSetupOpen(true);
  };

  const saveSetup = async () => {
    const trimmed = clientIdDraft.trim();
    if (!trimmed) return;
    await setClientId(trimmed);
    setSetupOpen(false);
  };

  const connect = async () => {
    const clientId = await getClientId();
    if (!clientId) { openSetup(); return; }
    setSyncing(true);
    setSyncError(null);
    try {
      const ok = await startAuth();
      if (ok) setAuthed(true);
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : String(err));
    } finally {
      setSyncing(false);
    }
  };

  const disconnect = async () => {
    await clearAuth();
    setAuthed(false);
  };

  const sync = async () => {
    setSyncing(true);
    setSyncError(null);
    try {
      setSyncStatus('Fetching playlists…');
      const apiPlaylists = await fetchAllPlaylists();
      const now = new Date().toISOString();

      const playlistRows = apiPlaylists.map((p) => ({
        spotify_id: p.id,
        name: p.name,
        description: p.description || null,
        image_url: p.images?.[0]?.url ?? null,
        tracks_total: p.tracks.total,
        owner_name: p.owner.display_name,
        owner_id: p.owner.id,
        collaborative: p.collaborative,
        public: p.public ?? null,
        snapshot_id: p.snapshot_id,
        spotify_url: p.external_urls?.spotify ?? null,
        synced_at: now,
      }));

      if (playlistRows.length > 0) {
        await supabase
          .from('spotify_playlists')
          .upsert(playlistRows, { onConflict: 'spotify_id' });
      }

      for (let i = 0; i < apiPlaylists.length; i++) {
        const p = apiPlaylists[i];
        setSyncStatus(`Syncing "${p.name}" (${i + 1}/${apiPlaylists.length})…`);

        const trackItems = await fetchPlaylistTracks(p.id);
        const trackRows = trackItems.map((item, idx) => ({
          spotify_id: item.track!.id!,
          playlist_id: p.id,
          name: item.track!.name,
          artists: item.track!.artists.map((a) => a.name),
          artist_ids: item.track!.artists.map((a) => a.id),
          album_id: item.track!.album.id,
          album_name: item.track!.album.name,
          album_type: item.track!.album.album_type,
          album_total_tracks: item.track!.album.total_tracks,
          album_image_url: item.track!.album.images?.[0]?.url ?? null,
          duration_ms: item.track!.duration_ms,
          explicit: item.track!.explicit,
          popularity: item.track!.popularity,
          preview_url: item.track!.preview_url ?? null,
          track_number: item.track!.track_number,
          disc_number: item.track!.disc_number,
          release_date: item.track!.album.release_date ?? null,
          release_date_precision: item.track!.album.release_date_precision ?? null,
          isrc: item.track!.external_ids?.isrc ?? null,
          spotify_url: item.track!.external_urls?.spotify ?? null,
          added_at: item.added_at ?? null,
          added_by_id: item.added_by?.id ?? null,
          is_local: item.is_local,
          track_position: idx,
          synced_at: now,
        }));

        if (trackRows.length > 0) {
          await supabase
            .from('spotify_tracks')
            .upsert(trackRows, { onConflict: 'spotify_id,playlist_id' });
        }

        const distinctAlbums = new Set(trackItems.map((item) => item.track!.album.name));
        const isAlbumPlaylist = distinctAlbums.size === 1 && distinctAlbums.has(p.name);
        await supabase
          .from('spotify_playlists')
          .update({ is_album_playlist: isAlbumPlaylist })
          .eq('spotify_id', p.id);
      }

      await load();
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : String(err));
    } finally {
      setSyncing(false);
      setSyncStatus('');
    }
  };

  const togglePin = async (spotifyId: string, currentPinned: boolean) => {
    const newPinned = !currentPinned;
    setPlaylists((prev) =>
      prev.map((p) => (p.spotify_id === spotifyId ? { ...p, pinned: newPinned } : p)),
    );
    await supabase
      .from('spotify_playlists')
      .update({ pinned: newPinned })
      .eq('spotify_id', spotifyId);
    onPinsChanged?.();
  };

  const renderCard = ({ item }: { item: DBPlaylist }) => (
    <Pressable
      style={[styles.card, { width: cardWidth }, item.pinned && styles.cardPinned]}
      onPress={() => togglePin(item.spotify_id, item.pinned)}
    >
      {item.image_url ? (
        <Image
          source={{ uri: item.image_url }}
          style={[styles.cover, { width: cardWidth, height: cardWidth }]}
          contentFit="cover"
        />
      ) : (
        <View style={[styles.cover, styles.coverFallback, { width: cardWidth, height: cardWidth }]}>
          <Text style={styles.coverEmoji}>🎵</Text>
        </View>
      )}
      {item.pinned && (
        <View style={styles.pinBadge}>
          <Text style={styles.pinEmoji}>📌</Text>
        </View>
      )}
      <View style={styles.cardInfo}>
        <Text style={styles.cardName} numberOfLines={1}>{item.name}</Text>
        <Text style={styles.cardCount}>{item.tracks_total} tracks</Text>
      </View>
    </Pressable>
  );

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.title}>🎵 Music</Text>
        <View style={styles.headerActions}>
          <Pressable onPress={openSetup} hitSlop={10}>
            <Text style={styles.iconBtn}>⚙️</Text>
          </Pressable>
          {authed && (
            <Pressable
              onPress={sync}
              disabled={syncing}
              style={({ pressed }) => [styles.syncBtn, { opacity: pressed || syncing ? 0.6 : 1 }]}
            >
              {syncing
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={styles.syncBtnText}>Sync</Text>
              }
            </Pressable>
          )}
        </View>
      </View>

      {syncStatus ? (
        <Text style={styles.statusText} numberOfLines={1}>{syncStatus}</Text>
      ) : null}
      {syncError ? (
        <Text style={styles.errorText} numberOfLines={3}>{syncError}</Text>
      ) : null}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={C.accent} />
        </View>
      ) : !authed ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>
            Connect your Spotify account to back up your playlists
          </Text>
          <Pressable
            onPress={connect}
            disabled={syncing}
            style={({ pressed }) => [styles.emptyBtn, { opacity: pressed || syncing ? 0.6 : 1 }]}
          >
            {syncing
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={styles.emptyBtnText}>Connect Spotify</Text>
            }
          </Pressable>
          <Pressable onPress={openSetup} hitSlop={8}>
            <Text style={styles.setupHint}>Need to set your Client ID first?</Text>
          </Pressable>
        </View>
      ) : playlists.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>No playlists backed up yet — tap Sync to import</Text>
          <Pressable
            onPress={sync}
            disabled={syncing}
            style={({ pressed }) => [styles.emptyBtn, { opacity: pressed || syncing ? 0.6 : 1 }]}
          >
            {syncing
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={styles.emptyBtnText}>Sync</Text>
            }
          </Pressable>
        </View>
      ) : (
        <>
          <Text style={styles.hint}>Tap a playlist to pin it as a page</Text>
          <FlatList
            data={playlists}
            keyExtractor={(item) => item.id}
            renderItem={renderCard}
            numColumns={COLS}
            contentContainerStyle={[styles.grid, { padding: PADDING }]}
            columnWrapperStyle={{ gap: GAP }}
            showsVerticalScrollIndicator={false}
            {...edgeScroll}
          />
        </>
      )}

      {/* Disconnect link — only when authed */}
      {authed && !loading && (
        <Pressable style={styles.disconnectWrap} onPress={disconnect} hitSlop={8}>
          <Text style={styles.disconnectText}>Disconnect</Text>
        </Pressable>
      )}

      <Modal
        visible={setupOpen}
        animationType="slide"
        transparent
        presentationStyle="overFullScreen"
        onRequestClose={() => setSetupOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Spotify Setup</Text>
            <Text style={styles.modalHint}>
              1. Go to{' '}
              <Text style={{ fontWeight: '700' }}>developer.spotify.com/dashboard</Text>
              {'\n'}
              2. Create an app and add redirect URI:{'\n'}
              <Text style={{ fontWeight: '700' }}>listful://spotify-auth</Text>
              {'\n'}
              3. Copy your Client ID below
            </Text>
            <TextInput
              style={styles.modalInput}
              value={clientIdDraft}
              onChangeText={setClientIdDraft}
              placeholder="Spotify Client ID"
              placeholderTextColor={C.muted}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="done"
              onSubmitEditing={saveSetup}
            />
            <View style={styles.modalActions}>
              <Pressable onPress={() => setSetupOpen(false)}>
                <Text style={styles.cancelText}>cancel</Text>
              </Pressable>
              <Pressable
                onPress={saveSetup}
                style={({ pressed }) => [styles.saveBtn, { opacity: pressed ? 0.6 : 1 }]}
              >
                <Text style={styles.saveBtnText}>Save</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: PADDING,
    paddingTop: 60,
    marginBottom: 4,
  },
  title: { fontSize: 17, fontWeight: '600', color: C.text, letterSpacing: -0.3 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconBtn: { fontSize: 18 },
  syncBtn: {
    backgroundColor: C.accent,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    minWidth: 60,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  syncBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  statusText: {
    fontSize: 12,
    color: C.accent,
    paddingHorizontal: PADDING,
    marginBottom: 4,
  },
  errorText: {
    fontSize: 12,
    color: '#DC2626',
    paddingHorizontal: PADDING,
    marginBottom: 8,
  },
  hint: {
    fontSize: 12,
    color: C.muted,
    paddingHorizontal: PADDING,
    marginBottom: 8,
    marginTop: 4,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    paddingHorizontal: 40,
  },
  emptyText: { fontSize: 14, color: C.muted, textAlign: 'center', lineHeight: 20 },
  emptyBtn: {
    backgroundColor: C.accent,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  emptyBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  setupHint: { fontSize: 12, color: C.muted, textDecorationLine: 'underline' },
  grid: { paddingBottom: 80 },
  card: {
    borderRadius: 10,
    overflow: 'hidden',
    marginBottom: GAP,
    backgroundColor: 'rgba(26,22,38,0.06)',
    borderWidth: 2.5,
    borderColor: 'transparent',
  },
  cardPinned: {
    borderColor: C.accent,
  },
  cover: { backgroundColor: 'rgba(26,22,38,0.08)' },
  coverFallback: { alignItems: 'center', justifyContent: 'center' },
  coverEmoji: { fontSize: 32 },
  pinBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 12,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  pinEmoji: { fontSize: 12 },
  cardInfo: { padding: 8 },
  cardName: { fontSize: 13, fontWeight: '600', color: C.text, marginBottom: 2 },
  cardCount: { fontSize: 11, color: C.muted },
  disconnectWrap: {
    position: 'absolute',
    bottom: 28,
    alignSelf: 'center',
  },
  disconnectText: { fontSize: 12, color: C.muted, textDecorationLine: 'underline' },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 28,
    gap: 14,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: C.text, marginBottom: 2 },
  modalHint: { fontSize: 13, color: C.muted, lineHeight: 20 },
  modalInput: {
    fontSize: 16,
    color: C.text,
    borderBottomWidth: 1.5,
    borderBottomColor: C.accent,
    paddingVertical: 6,
    marginTop: 4,
    outlineStyle: 'none',
  } as any,
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 20,
    marginTop: 8,
  },
  cancelText: { fontSize: 14, color: C.muted },
  saveBtn: {
    backgroundColor: C.accent,
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
  },
  saveBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
});
