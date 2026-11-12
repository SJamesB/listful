import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';

import {
  EMPTY_SELECTION,
  GenreStyleFilter,
  matchesSelection,
  type GenreStyleSelection,
} from '@/components/GenreStyleFilter';
import { Text } from '@/components/Text';
import { TextInput } from '@/components/TextInput';
import { useSectionEdgeScroll, type EdgesChangeHandler } from '@/hooks/use-section-edge-scroll';
import { AudioBadge, AudioEditor, type AudioTrackRef } from '@/components/TrackAudio';
import { getTracklist, type Track } from '@/lib/discogs';
import { audioKey, backfillTrackAudio, loadTrackAudio, useTrackAudio, type TrackAudio } from '@/lib/trackAudio';
import { fetchAllRows, supabase } from '@/lib/supabase';

const C = {
  text: '#1A1626',
  muted: 'rgba(26,22,38,0.45)',
  accent: '#EA580C',
  danger: '#DC2626',
} as const;

const COLS = 3;
const PADDING = 16;
const GAP = 6;

export type RecordList = 'collection' | 'wantlist';

interface RecordItem {
  id: string;
  discogs_release_id: number;
  title: string;
  artists: string | null;
  year: number | null;
  cover_url: string | null;
  thumb_url: string | null;
  formats: string | null;
  labels: string | null;
  genres: string[];
  styles: string[];
  rating: number | null;
  date_added: string | null;
  synced_at: string;
}

interface SyncResponse {
  error?: string;
  tracklists?: { fetched: number; pending: number };
}

export interface RecordsPageProps {
  title: string;
  list: RecordList;
  onEdgesChange?: EdgesChangeHandler;
}

// A sync refreshes both lists, but the Collection and Wantlist pages are
// separate mounted components — this lets one page's sync reload the other.
const syncListeners = new Set<() => void>();

function formatSyncedAt(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'synced just now';
  if (mins < 60) return `synced ${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `synced ${hours}h ago`;
  return `synced ${new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`;
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue} numberOfLines={4}>{value}</Text>
    </View>
  );
}

function TrackRow({
  track,
  releaseId,
  audio,
  onEditAudio,
  nested = false,
}: {
  track: Track;
  releaseId: number;
  audio: Map<string, TrackAudio>;
  onEditAudio?: (track: Track) => void;
  nested?: boolean;
}) {
  if (track.type === 'heading') {
    return <Text style={styles.trackHeading}>{track.title}</Text>;
  }
  // Index tracks with sub-tracks get their BPM on the sub-tracks instead.
  const hasSubTracks = !!track.sub_tracks?.length;
  return (
    <>
      <View style={[styles.trackRow, nested && styles.trackRowNested]}>
        <Text style={styles.trackPosition}>{track.position ?? ''}</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.trackTitle}>{track.title}</Text>
          {track.artists ? <Text style={styles.trackArtists}>{track.artists}</Text> : null}
        </View>
        <View style={styles.trackSide}>
          {!hasSubTracks ? (
            <AudioBadge
              audio={audio.get(audioKey(releaseId, track.position, track.title))}
              onPress={onEditAudio ? () => onEditAudio(track) : undefined}
            />
          ) : null}
          {track.duration ? <Text style={styles.trackDuration}>{track.duration}</Text> : null}
        </View>
      </View>
      {track.sub_tracks?.map((sub, i) => (
        <TrackRow key={i} track={sub} releaseId={releaseId} audio={audio} onEditAudio={onEditAudio} nested />
      ))}
    </>
  );
}

function Cover({ uri, size, radius = 4 }: { uri: string | null; size: number; radius?: number }) {
  return uri ? (
    <Image
      source={{ uri }}
      style={[styles.cover, { width: size, height: size, borderRadius: radius }]}
      contentFit="cover"
      transition={150}
    />
  ) : (
    <View style={[styles.cover, styles.coverFallback, { width: size, height: size, borderRadius: radius }]}>
      <Text style={{ fontSize: size * 0.3 }}>💿</Text>
    </View>
  );
}

export default function RecordsPage({ title, list, onEdgesChange }: RecordsPageProps) {
  const edgeScroll = useSectionEdgeScroll(onEdgesChange);
  const { width } = useWindowDimensions();
  const coverSize = (width - PADDING * 2 - GAP * (COLS - 1)) / COLS;
  const detailCoverSize = Math.min(width * 0.68, 360);

  const [items, setItems] = useState<RecordItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [tags, setTags] = useState<GenreStyleSelection>(EMPTY_SELECTION);
  const [detailItem, setDetailItem] = useState<RecordItem | null>(null);
  const [tracklist, setTracklist] = useState<Track[] | null>(null);
  const [tracklistLoading, setTracklistLoading] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [editingAudio, setEditingAudio] = useState<AudioTrackRef | null>(null);
  const audio = useTrackAudio();
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    const rows = await fetchAllRows<RecordItem>((from, to) =>
      supabase
        .from('record_items')
        .select('*')
        .eq('list', list)
        .order('date_added', { ascending: false, nullsFirst: false })
        .range(from, to),
    );
    setItems(rows);
    setLoading(false);
  }, [list]);

  useEffect(() => {
    load();
    syncListeners.add(load);
    return () => {
      syncListeners.delete(load);
    };
  }, [load]);

  const sync = async () => {
    if (syncing) return;
    setSyncing(true);
    setSyncError(null);
    try {
      const invoke = async (body: object) => {
        const { data, error } = await supabase.functions.invoke<SyncResponse>('discogs-sync', { body });
        if (error) throw new Error(error.message);
        if (data?.error) throw new Error(data.error);
        return data;
      };
      let data = await invoke({});
      syncListeners.forEach((reload) => reload());

      // Each call only fetches the tracklists that fit in its time budget
      // (Discogs allows 60 requests a minute), so keep going until none are left.
      let pending = data?.tracklists?.pending ?? 0;
      while (pending > 0 && mounted.current) {
        setProgress(`Fetching tracklists… ${pending} left`);
        data = await invoke({ tracklistsOnly: true });
        const next = data?.tracklists?.pending ?? 0;
        if (next >= pending && !data?.tracklists?.fetched) break;
        pending = next;
      }

      // Then BPM and key for any new collection tracks, the same way.
      let audioPending = Infinity;
      while (mounted.current) {
        const result = await backfillTrackAudio();
        if (result.pending === 0 || (result.pending >= audioPending && !result.lookedUp)) break;
        audioPending = result.pending;
        setProgress(`Looking up BPM and key… ${audioPending} left`);
      }
      await loadTrackAudio(true);
    } catch (err) {
      if (mounted.current) setSyncError(err instanceof Error ? err.message : String(err));
    } finally {
      if (mounted.current) {
        setProgress(null);
        setSyncing(false);
      }
    }
  };

  // Ignore tracklist responses for a record that's no longer the open one.
  const openReleaseId = useRef<number | null>(null);

  const openDetail = async (item: RecordItem) => {
    openReleaseId.current = item.discogs_release_id;
    setDetailItem(item);
    setTracklist(null);
    setTracklistLoading(true);
    const isCurrent = () => openReleaseId.current === item.discogs_release_id;
    try {
      const tracks = await getTracklist(item.discogs_release_id);
      if (tracks && isCurrent()) setTracklist(tracks);
    } finally {
      if (isCurrent()) setTracklistLoading(false);
    }
  };

  const closeDetail = () => {
    openReleaseId.current = null;
    setDetailItem(null);
    setTracklist(null);
  };

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return items.filter(
      (i) =>
        matchesSelection(i, tags) &&
        (!q || `${i.title} ${i.artists ?? ''} ${i.labels ?? ''}`.toLowerCase().includes(q)),
    );
  }, [items, filter, tags]);

  const lastSynced = useMemo(
    () => items.reduce<string | null>((max, i) => (!max || i.synced_at > max ? i.synced_at : max), null),
    [items],
  );

  const renderItem = ({ item }: { item: RecordItem }) => (
    <Pressable style={[styles.coverWrap, { width: coverSize }]} onPress={() => openDetail(item)}>
      <Cover uri={item.cover_url ?? item.thumb_url} size={coverSize} />
    </Pressable>
  );

  const detailMeta = detailItem
    ? [detailItem.year ? String(detailItem.year) : null, detailItem.formats].filter(Boolean).join(' · ')
    : '';

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{title}</Text>
          {lastSynced ? (
            <Text style={styles.subtitle}>
              {visible.length !== items.length ? `${visible.length} of ` : ''}
              {items.length} {items.length === 1 ? 'record' : 'records'} · {formatSyncedAt(lastSynced)}
            </Text>
          ) : null}
        </View>
        <Pressable
          onPress={sync}
          disabled={syncing}
          style={({ pressed }) => [styles.syncBtn, { opacity: pressed || syncing ? 0.6 : 1 }]}
        >
          {syncing ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.syncBtnText}>↻ Sync</Text>
          )}
        </Pressable>
      </View>

      {syncError ? <Text style={styles.errorText}>{syncError}</Text> : null}
      {progress ? <Text style={styles.progressText}>{progress}</Text> : null}

      {items.length > 12 ? (
        <TextInput
          style={styles.filterInput}
          value={filter}
          onChangeText={setFilter}
          placeholder="Filter by artist, title or label"
          placeholderTextColor={C.muted}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
        />
      ) : null}
      {items.length > 0 ? <GenreStyleFilter items={items} value={tags} onChange={setTags} /> : null}

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={C.accent} /></View>
      ) : items.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>
            {list === 'collection'
              ? 'No records yet. Sync to pull in your Discogs collection.'
              : 'Your wantlist is empty. Sync to pull it in from Discogs.'}
          </Text>
          <Pressable
            onPress={sync}
            disabled={syncing}
            style={({ pressed }) => [styles.emptyBtn, { opacity: pressed || syncing ? 0.6 : 1 }]}
          >
            <Text style={styles.emptyBtnText}>{syncing ? 'Syncing…' : 'Sync from Discogs'}</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          numColumns={COLS}
          contentContainerStyle={[styles.grid, { paddingHorizontal: PADDING }]}
          columnWrapperStyle={{ gap: GAP }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={<Text style={styles.emptyText}>No matches</Text>}
          {...edgeScroll}
        />
      )}

      <Modal
        visible={!!detailItem}
        animationType="fade"
        transparent
        presentationStyle="overFullScreen"
        onRequestClose={closeDetail}
      >
        <View style={styles.detailOverlay}>
          {detailItem?.cover_url ? (
            <Image
              source={{ uri: detailItem.cover_url }}
              style={[StyleSheet.absoluteFill, { opacity: 0.2 }]}
              contentFit="cover"
              blurRadius={25}
            />
          ) : null}
          <LinearGradient
            colors={['rgba(8,8,8,0.1)', '#080808']}
            locations={[0, 0.55]}
            style={StyleSheet.absoluteFill}
          />
          <Pressable style={styles.detailClose} onPress={closeDetail} hitSlop={12}>
            <Text style={styles.detailCloseText}>✕</Text>
          </Pressable>
          {detailItem ? (
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={styles.detailContent}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.detailCoverShadow}>
                <Cover uri={detailItem.cover_url ?? detailItem.thumb_url} size={detailCoverSize} radius={8} />
              </View>
              <Text style={styles.detailTitle}>{detailItem.title}</Text>
              {detailItem.artists ? <Text style={styles.detailArtist}>{detailItem.artists}</Text> : null}
              {detailMeta ? <Text style={styles.detailMetaText}>{detailMeta}</Text> : null}

              <View style={styles.tracklist}>
                <Text style={styles.tracklistLabel}>Tracklist</Text>
                {tracklistLoading ? (
                  <ActivityIndicator color="rgba(255,255,255,0.35)" style={{ marginVertical: 16 }} />
                ) : tracklist?.length ? (
                  tracklist.map((track, i) => (
                    <TrackRow
                      key={i}
                      track={track}
                      releaseId={detailItem.discogs_release_id}
                      audio={audio}
                      onEditAudio={
                        list === 'collection'
                          ? (t) =>
                              setEditingAudio({
                                release_id: detailItem.discogs_release_id,
                                position: t.position,
                                title: t.title,
                                subtitle: t.artists ?? detailItem.artists,
                              })
                          : undefined
                      }
                    />
                  ))
                ) : (
                  <Text style={styles.trackEmpty}>No tracklist available</Text>
                )}
              </View>

              <View style={styles.detailFields}>
                {detailItem.labels ? <DetailRow label="Label" value={detailItem.labels} /> : null}
                {detailItem.genres.length ? <DetailRow label="Genre" value={detailItem.genres.join(', ')} /> : null}
                {detailItem.styles.length ? <DetailRow label="Style" value={detailItem.styles.join(', ')} /> : null}
                {detailItem.rating ? <DetailRow label="Rating" value={'★'.repeat(detailItem.rating)} /> : null}
                {detailItem.date_added ? (
                  <DetailRow
                    label="Added"
                    value={new Date(detailItem.date_added).toLocaleDateString('en-GB', {
                      day: 'numeric', month: 'long', year: 'numeric',
                    })}
                  />
                ) : null}
              </View>

              <Pressable
                onPress={() => Linking.openURL(`https://www.discogs.com/release/${detailItem.discogs_release_id}`)}
                style={({ pressed }) => [styles.discogsBtn, { opacity: pressed ? 0.6 : 1 }]}
              >
                <Text style={styles.discogsBtnText}>Open on Discogs ↗</Text>
              </Pressable>
            </ScrollView>
          ) : null}
          <AudioEditor
            track={editingAudio}
            audio={
              editingAudio
                ? audio.get(audioKey(editingAudio.release_id, editingAudio.position, editingAudio.title))
                : undefined
            }
            onClose={() => setEditingAudio(null)}
          />
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
    gap: 12,
    paddingHorizontal: PADDING,
    paddingTop: 60,
    marginBottom: 12,
  },
  title: { fontSize: 17, fontWeight: '600', color: C.text, letterSpacing: -0.3 },
  subtitle: { fontSize: 12, color: C.muted, marginTop: 2 },
  syncBtn: {
    backgroundColor: C.accent,
    paddingHorizontal: 14,
    borderRadius: 16,
    minWidth: 76,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  syncBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  errorText: { fontSize: 12, color: C.danger, paddingHorizontal: PADDING, marginBottom: 8 },
  progressText: { fontSize: 12, color: C.muted, paddingHorizontal: PADDING, marginBottom: 8 },
  // Tracklist
  tracklist: { width: '100%', marginBottom: 28 },
  tracklistLabel: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.3)',
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  trackRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 9,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.07)',
  },
  trackRowNested: { paddingLeft: 18 },
  trackPosition: {
    width: 30,
    fontSize: 12,
    color: 'rgba(255,255,255,0.35)',
    fontWeight: '600',
    paddingTop: 1,
  },
  trackTitle: { fontSize: 14, color: 'rgba(255,255,255,0.85)', lineHeight: 19 },
  trackArtists: { fontSize: 12, color: 'rgba(255,255,255,0.45)', marginTop: 2 },
  trackDuration: { fontSize: 12, color: 'rgba(255,255,255,0.4)', paddingTop: 1 },
  trackSide: { alignItems: 'flex-end', gap: 4 },
  trackHeading: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.55)',
    fontWeight: '700',
    marginTop: 14,
    marginBottom: 2,
  },
  trackEmpty: { fontSize: 13, color: 'rgba(255,255,255,0.4)', paddingVertical: 10 },
  filterInput: {
    fontSize: 14,
    color: C.text,
    marginHorizontal: PADDING,
    marginBottom: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.45)',
    outlineStyle: 'none',
  } as any,
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, paddingHorizontal: 40 },
  emptyText: { fontSize: 14, color: C.muted, textAlign: 'center', lineHeight: 20, marginTop: 24 },
  emptyBtn: { backgroundColor: C.accent, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20 },
  emptyBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  grid: { paddingBottom: 64 },
  coverWrap: { marginBottom: GAP },
  cover: { backgroundColor: 'rgba(26,22,38,0.08)' },
  coverFallback: { alignItems: 'center', justifyContent: 'center' },
  // Detail modal
  detailOverlay: { flex: 1, backgroundColor: '#080808' },
  detailClose: {
    position: 'absolute',
    top: 56,
    right: 20,
    zIndex: 10,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailCloseText: { color: 'rgba(255,255,255,0.65)', fontSize: 14, fontWeight: '600' },
  detailContent: { paddingTop: 96, paddingHorizontal: 28, paddingBottom: 64, alignItems: 'center' },
  detailCoverShadow: {
    marginBottom: 24,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.7,
    shadowRadius: 24,
    elevation: 14,
  },
  detailTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
    letterSpacing: -0.4,
    marginBottom: 6,
  },
  detailArtist: { fontSize: 16, color: 'rgba(255,255,255,0.75)', textAlign: 'center', marginBottom: 10 },
  detailMetaText: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.4)',
    fontWeight: '500',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    textAlign: 'center',
    marginBottom: 24,
  },
  detailFields: {
    width: '100%',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.07)',
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.07)',
  },
  detailLabel: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.3)',
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
    flex: 1,
    paddingTop: 2,
  },
  detailValue: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.82)',
    fontWeight: '500',
    flex: 2,
    textAlign: 'right',
    lineHeight: 20,
  },
  discogsBtn: {
    marginTop: 28,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  discogsBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
});
