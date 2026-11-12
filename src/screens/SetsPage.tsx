import { Image } from 'expo-image';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import DraggableFlatList, { RenderItemParams, ScaleDecorator } from 'react-native-draggable-flatlist';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

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
import { formatDuration, getTracklist, parseDuration, playableTracks, type Track } from '@/lib/discogs';
import { audioKey, formatBpm, lookUpTrackAudio, useTrackAudio } from '@/lib/trackAudio';
import { fetchAllRows, supabase } from '@/lib/supabase';

// Light colours for the section page; the set view itself is dark, like the
// record detail view.
const C = {
  text: '#1A1626',
  muted: 'rgba(26,22,38,0.45)',
  accent: '#EA580C',
  danger: '#DC2626',
} as const;
const D = {
  bg: '#0E0C14',
  text: 'rgba(255,255,255,0.88)',
  muted: 'rgba(255,255,255,0.45)',
  faint: 'rgba(255,255,255,0.07)',
  chip: 'rgba(255,255,255,0.08)',
} as const;

const PADDING = 16;
const GAP = 6;
const GRID_COLS = 3;

interface SetSummary {
  id: string;
  name: string;
  updated_at: string;
  dj_set_tracks: { cover_url: string | null; sort_order: number }[];
}

interface SetTrack {
  id: string;
  sort_order: number;
  release_id: number;
  track_position: string | null;
  track_title: string;
  track_artists: string | null;
  duration: string | null;
  album_title: string;
  album_artists: string | null;
  cover_url: string | null;
}

interface CollectionRecord {
  discogs_release_id: number;
  title: string;
  artists: string | null;
  year: number | null;
  cover_url: string | null;
  thumb_url: string | null;
  genres: string[];
  styles: string[];
}

const trackKey = (releaseId: number, position: string | null, title: string) =>
  `${releaseId}|${position ?? ''}|${title}`;

function Thumb({ uri, size, radius = 4 }: { uri: string | null; size: number; radius?: number }) {
  return uri ? (
    <Image source={{ uri }} style={{ width: size, height: size, borderRadius: radius }} contentFit="cover" />
  ) : (
    <View style={[styles.thumbFallback, { width: size, height: size, borderRadius: radius }]}>
      <Text style={{ fontSize: size * 0.4 }}>💿</Text>
    </View>
  );
}

function summarise(tracks: { duration: string | null }[], bpms: number[]): string {
  const parts = [`${tracks.length} ${tracks.length === 1 ? 'track' : 'tracks'}`];
  const seconds = tracks.map((t) => parseDuration(t.duration));
  const known = seconds.filter((s): s is number => s != null);
  if (known.length) {
    const missing = tracks.length - known.length;
    const total = formatDuration(known.reduce((a, b) => a + b, 0));
    parts.push(missing ? `${total}+ (${missing} without length)` : total);
  }
  if (bpms.length) {
    const lo = formatBpm(Math.min(...bpms));
    const hi = formatBpm(Math.max(...bpms));
    parts.push(lo === hi ? `${lo} BPM` : `${lo}–${hi} BPM`);
  }
  return parts.join(' · ');
}

// ---------------------------------------------------------------------------
// Sets list (section page)
// ---------------------------------------------------------------------------

export default function SetsPage({ onEdgesChange }: { onEdgesChange?: EdgesChangeHandler }) {
  const edgeScroll = useSectionEdgeScroll(onEdgesChange);
  const [sets, setSets] = useState<SetSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [openSetId, setOpenSetId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('dj_sets')
      .select('id, name, updated_at, dj_set_tracks(cover_url, sort_order)')
      .order('updated_at', { ascending: false });
    if (data) setSets(data as SetSummary[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const create = async () => {
    const name = newName.trim();
    if (!name) {
      setCreating(false);
      return;
    }
    const { data, error } = await supabase.from('dj_sets').insert({ name }).select('id').single();
    setNewName('');
    setCreating(false);
    if (error) {
      console.error('create set failed:', error.message);
      return;
    }
    await load();
    setOpenSetId(data.id);
  };

  const renderSet = ({ item }: { item: SetSummary }) => {
    const covers = [...item.dj_set_tracks]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((t) => t.cover_url)
      .filter((c): c is string => !!c);
    const mosaic = [...new Set(covers)].slice(0, 4);
    const count = item.dj_set_tracks.length;
    return (
      <Pressable
        style={({ pressed }) => [styles.setRow, pressed && { opacity: 0.6 }]}
        onPress={() => setOpenSetId(item.id)}
      >
        <View style={styles.mosaic}>
          {mosaic.length ? (
            mosaic.map((uri, i) => (
              <Image
                key={i}
                source={{ uri }}
                style={mosaic.length === 1 ? styles.mosaicFull : styles.mosaicTile}
                contentFit="cover"
              />
            ))
          ) : (
            <Text style={{ fontSize: 22 }}>🎧</Text>
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.setName} numberOfLines={1}>{item.name}</Text>
          <Text style={styles.setMeta}>{count} {count === 1 ? 'track' : 'tracks'}</Text>
        </View>
        <Text style={styles.chevron}>›</Text>
      </Pressable>
    );
  };

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.title}>🎧 Sets</Text>
        <Pressable
          onPress={() => setCreating(true)}
          style={({ pressed }) => [styles.accentBtn, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Text style={styles.accentBtnText}>+ New set</Text>
        </Pressable>
      </View>

      {creating ? (
        <View style={styles.createRow}>
          <TextInput
            style={styles.createInput}
            value={newName}
            onChangeText={setNewName}
            onSubmitEditing={create}
            placeholder="Set name"
            placeholderTextColor={C.muted}
            autoFocus
            returnKeyType="done"
          />
          <Pressable onPress={create} style={styles.accentBtn}>
            <Text style={styles.accentBtnText}>Create</Text>
          </Pressable>
          <Pressable onPress={() => { setCreating(false); setNewName(''); }} hitSlop={8}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </View>
      ) : null}

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={C.accent} /></View>
      ) : sets.length === 0 && !creating ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>No sets yet. Create one and add tracks from your collection.</Text>
          <Pressable onPress={() => setCreating(true)} style={styles.emptyBtn}>
            <Text style={styles.accentBtnText}>Create a set</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={sets}
          keyExtractor={(s) => s.id}
          renderItem={renderSet}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          {...edgeScroll}
        />
      )}

      <Modal
        visible={!!openSetId}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setOpenSetId(null)}
      >
        {openSetId ? (
          <SafeAreaProvider>
            <GestureHandlerRootView style={{ flex: 1 }}>
              <SetDetail
                setId={openSetId}
                onClose={() => { setOpenSetId(null); load(); }}
              />
            </GestureHandlerRootView>
          </SafeAreaProvider>
        ) : null}
      </Modal>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Set view: tracklist / cover grid, reorder, remove, rename, delete
// ---------------------------------------------------------------------------

function SetDetail({ setId, onClose }: { setId: string; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const coverSize = (width - PADDING * 2 - GAP * (GRID_COLS - 1)) / GRID_COLS;

  const [name, setName] = useState('');
  const [tracks, setTracks] = useState<SetTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'list' | 'grid'>('list');
  const [adding, setAdding] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const audio = useTrackAudio();
  const [editingAudio, setEditingAudio] = useState<AudioTrackRef | null>(null);

  const audioFor = (t: SetTrack) => audio.get(audioKey(t.release_id, t.track_position, t.track_title));
  const setBpms = tracks.map((t) => audioFor(t)?.bpm).filter((b): b is number => b != null);
  const editAudio = (t: SetTrack) =>
    setEditingAudio({
      release_id: t.release_id,
      position: t.track_position,
      title: t.track_title,
      subtitle: t.track_artists ?? t.album_artists,
    });

  const load = useCallback(async () => {
    const [{ data: set }, { data: rows }] = await Promise.all([
      supabase.from('dj_sets').select('name').eq('id', setId).single(),
      supabase.from('dj_set_tracks').select('*').eq('set_id', setId).order('sort_order'),
    ]);
    if (set) setName(set.name);
    if (rows) setTracks(rows as SetTrack[]);
    setLoading(false);
  }, [setId]);

  useEffect(() => {
    load();
  }, [load]);

  const touch = () => supabase.from('dj_sets').update({ updated_at: new Date().toISOString() }).eq('id', setId);

  const existingKeys = useMemo(
    () => new Set(tracks.map((t) => trackKey(t.release_id, t.track_position, t.track_title))),
    [tracks],
  );

  const addTrack = async (record: CollectionRecord, track: Track) => {
    const sortOrder = tracks.reduce((max, t) => Math.max(max, t.sort_order), -1) + 1;
    const { data, error } = await supabase
      .from('dj_set_tracks')
      .insert({
        set_id: setId,
        sort_order: sortOrder,
        release_id: record.discogs_release_id,
        track_position: track.position,
        track_title: track.title,
        track_artists: track.artists,
        duration: track.duration,
        album_title: record.title,
        album_artists: record.artists,
        cover_url: record.cover_url ?? record.thumb_url,
      })
      .select('*')
      .single();
    if (error) {
      console.error('add track failed:', error.message);
      return;
    }
    setTracks((prev) => [...prev, data as SetTrack]);
    touch();
    // If the background lookup hasn't reached this track yet, do it now.
    lookUpTrackAudio([{ release_id: record.discogs_release_id, position: track.position, title: track.title }])
      .catch(() => {});
  };

  const removeTrack = async (track: SetTrack) => {
    setTracks((prev) => prev.filter((t) => t.id !== track.id));
    await supabase.from('dj_set_tracks').delete().eq('id', track.id);
    touch();
  };

  const onDragEnd = async ({ data }: { data: SetTrack[] }) => {
    const reordered = data.map((t, i) => ({ ...t, sort_order: i }));
    setTracks(reordered);
    await Promise.all(
      reordered.map((t) => supabase.from('dj_set_tracks').update({ sort_order: t.sort_order }).eq('id', t.id)),
    );
    touch();
  };

  const saveName = async () => {
    const next = nameDraft.trim();
    setEditingName(false);
    if (!next || next === name) return;
    setName(next);
    await supabase.from('dj_sets').update({ name: next, updated_at: new Date().toISOString() }).eq('id', setId);
  };

  const deleteSet = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    await supabase.from('dj_sets').delete().eq('id', setId);
    onClose();
  };

  const renderRow = ({ item, drag, isActive, getIndex }: RenderItemParams<SetTrack>) => {
    const artist = item.track_artists ?? item.album_artists;
    return (
      <ScaleDecorator>
        <Pressable
          onLongPress={drag}
          delayLongPress={250}
          disabled={isActive}
          style={[styles.trackRow, isActive && styles.trackRowActive]}
        >
          <Text style={styles.trackNumber}>{(getIndex() ?? 0) + 1}</Text>
          <Thumb uri={item.cover_url} size={44} />
          <View style={{ flex: 1 }}>
            <Text style={styles.trackTitle} numberOfLines={1}>{item.track_title}</Text>
            {artist ? <Text style={styles.trackArtist} numberOfLines={1}>{artist}</Text> : null}
            <Text style={styles.trackAlbum} numberOfLines={1}>
              {item.album_title}{item.track_position ? ` · ${item.track_position}` : ''}
            </Text>
          </View>
          <View style={styles.trackSide}>
            <AudioBadge audio={audioFor(item)} onPress={() => editAudio(item)} />
            {item.duration ? <Text style={styles.trackDuration}>{item.duration}</Text> : null}
          </View>
          <Pressable onPress={() => removeTrack(item)} hitSlop={10} style={styles.removeBtn}>
            <Text style={styles.removeText}>✕</Text>
          </Pressable>
        </Pressable>
      </ScaleDecorator>
    );
  };

  // Covers view: each album once, in the order it first appears in the set.
  const albums = useMemo(() => {
    const byRelease = new Map<number, { track: SetTrack; count: number }>();
    for (const t of tracks) {
      const entry = byRelease.get(t.release_id);
      if (entry) entry.count++;
      else byRelease.set(t.release_id, { track: t, count: 1 });
    }
    return [...byRelease.values()];
  }, [tracks]);

  const renderCover = ({ item, index }: { item: { track: SetTrack; count: number }; index: number }) => (
    <View style={{ width: coverSize, marginBottom: 12 }}>
      <View>
        <Thumb uri={item.track.cover_url} size={coverSize} radius={4} />
        <View style={styles.coverBadge}>
          <Text style={styles.coverBadgeText}>{index + 1}</Text>
        </View>
      </View>
      <Text style={styles.coverTitle} numberOfLines={1}>{item.track.album_title}</Text>
      <Text style={styles.coverArtist} numberOfLines={1}>
        {item.track.album_artists}
        {item.count > 1 ? ` · ${item.count} tracks` : ''}
      </Text>
    </View>
  );

  const header = (
    <View style={[styles.detailHeader, { paddingTop: insets.top + 12 }]}>
      <View style={styles.detailTopRow}>
        <Pressable onPress={onClose} hitSlop={12} style={styles.closeBtn}>
          <Text style={styles.closeText}>✕</Text>
        </Pressable>
        {adding ? (
          <Pressable onPress={() => setAdding(false)} style={styles.doneBtn}>
            <Text style={styles.accentBtnText}>Done</Text>
          </Pressable>
        ) : (
          <Pressable onPress={() => setAdding(true)} style={styles.doneBtn}>
            <Text style={styles.accentBtnText}>+ Add tracks</Text>
          </Pressable>
        )}
      </View>

      {editingName ? (
        <TextInput
          style={styles.nameInput}
          value={nameDraft}
          onChangeText={setNameDraft}
          onSubmitEditing={saveName}
          onBlur={saveName}
          autoFocus
          returnKeyType="done"
        />
      ) : (
        <Pressable onPress={() => { setNameDraft(name); setEditingName(true); }}>
          <Text style={styles.detailName}>{name}</Text>
        </Pressable>
      )}
      <Text style={styles.detailMeta}>{summarise(tracks, setBpms)}</Text>

      {!adding ? (
        <View style={styles.segment}>
          {(['list', 'grid'] as const).map((v) => (
            <Pressable
              key={v}
              onPress={() => setView(v)}
              style={[styles.segmentBtn, view === v && styles.segmentBtnActive]}
            >
              <Text style={[styles.segmentText, view === v && styles.segmentTextActive]}>
                {v === 'list' ? 'Tracklist' : 'Covers'}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );

  const footer = (
    <View style={[styles.detailFooter, { paddingBottom: insets.bottom + 32 }]}>
      <Pressable onPress={deleteSet} onBlur={() => setConfirmDelete(false)}>
        <Text style={styles.deleteText}>{confirmDelete ? 'Tap again to delete this set' : 'Delete set'}</Text>
      </Pressable>
    </View>
  );

  const empty = (
    <View style={styles.detailEmpty}>
      <Text style={styles.detailEmptyText}>No tracks yet.</Text>
      <Pressable onPress={() => setAdding(true)} style={styles.emptyBtn}>
        <Text style={styles.accentBtnText}>Add tracks from your collection</Text>
      </Pressable>
    </View>
  );

  return (
    <View style={styles.detailRoot}>
      {header}
      {loading ? (
        <View style={styles.center}><ActivityIndicator color={D.muted} /></View>
      ) : adding ? (
        <TrackPicker existingKeys={existingKeys} onAdd={addTrack} />
      ) : view === 'list' ? (
        <DraggableFlatList
          data={tracks}
          keyExtractor={(t) => t.id}
          renderItem={renderRow}
          extraData={audio}
          onDragEnd={onDragEnd}
          activationDistance={5}
          containerStyle={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: PADDING }}
          ListEmptyComponent={empty}
          ListFooterComponent={footer}
          showsVerticalScrollIndicator={false}
        />
      ) : (
        <FlatList
          key="grid"
          data={albums}
          keyExtractor={(a) => String(a.track.release_id)}
          renderItem={renderCover}
          numColumns={GRID_COLS}
          columnWrapperStyle={{ gap: GAP }}
          contentContainerStyle={{ paddingHorizontal: PADDING, paddingTop: 4 }}
          ListEmptyComponent={empty}
          ListFooterComponent={footer}
          showsVerticalScrollIndicator={false}
        />
      )}
      <AudioEditor
        track={editingAudio}
        audio={editingAudio ? audio.get(audioKey(editingAudio.release_id, editingAudio.position, editingAudio.title)) : undefined}
        onClose={() => setEditingAudio(null)}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Track picker: search the collection, open a record, tap tracks to add
// ---------------------------------------------------------------------------

// The collection rarely changes while the app is open; load it once.
let collectionCache: CollectionRecord[] | null = null;
const tracklistCache = new Map<number, Track[] | null>();

function TrackPicker({
  existingKeys,
  onAdd,
}: {
  existingKeys: Set<string>;
  onAdd: (record: CollectionRecord, track: Track) => void;
}) {
  const insets = useSafeAreaInsets();
  const [records, setRecords] = useState<CollectionRecord[] | null>(collectionCache);
  const [query, setQuery] = useState('');
  const [tags, setTags] = useState<GenreStyleSelection>(EMPTY_SELECTION);
  const [openId, setOpenId] = useState<number | null>(null);
  const [tracklist, setTracklist] = useState<Track[] | null>(null);
  const [tracklistLoading, setTracklistLoading] = useState(false);
  const [bpmMin, setBpmMin] = useState('');
  const [bpmMax, setBpmMax] = useState('');
  const openRef = useRef<number | null>(null);
  const audio = useTrackAudio();

  // BPM range filter: a record is shown if any of its tracks is in range.
  const lo = bpmMin.trim() ? Number(bpmMin) : null;
  const hi = bpmMax.trim() ? Number(bpmMax) : null;
  const rangeActive = (lo != null && Number.isFinite(lo)) || (hi != null && Number.isFinite(hi));
  const inRange = useCallback(
    (bpm: number | null | undefined) =>
      bpm != null &&
      (lo == null || !Number.isFinite(lo) || bpm >= lo) &&
      (hi == null || !Number.isFinite(hi) || bpm <= hi),
    [lo, hi],
  );
  const releaseBpms = useMemo(() => {
    const map = new Map<number, number[]>();
    for (const a of audio.values()) {
      if (a.bpm == null) continue;
      const list = map.get(a.release_id) ?? [];
      list.push(a.bpm);
      map.set(a.release_id, list);
    }
    return map;
  }, [audio]);

  useEffect(() => {
    if (collectionCache) return;
    fetchAllRows<CollectionRecord>((from, to) =>
      supabase
        .from('record_items')
        .select('discogs_release_id, title, artists, year, cover_url, thumb_url, genres, styles')
        .eq('list', 'collection')
        .order('artists')
        .order('title')
        .range(from, to),
    ).then((rows) => {
      collectionCache = rows;
      setRecords(rows);
    });
  }, []);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (records ?? []).filter(
      (r) =>
        matchesSelection(r, tags) &&
        (!q || `${r.title} ${r.artists ?? ''}`.toLowerCase().includes(q)) &&
        (!rangeActive || (releaseBpms.get(r.discogs_release_id) ?? []).some(inRange)),
    );
  }, [records, query, tags, rangeActive, releaseBpms, inRange]);

  const toggle = async (record: CollectionRecord) => {
    const id = record.discogs_release_id;
    if (openRef.current === id) {
      openRef.current = null;
      setOpenId(null);
      return;
    }
    openRef.current = id;
    setOpenId(id);
    if (tracklistCache.has(id)) {
      setTracklist(tracklistCache.get(id) ?? null);
      return;
    }
    setTracklist(null);
    setTracklistLoading(true);
    try {
      const tracks = await getTracklist(id);
      tracklistCache.set(id, tracks);
      if (openRef.current === id) setTracklist(tracks);
    } finally {
      if (openRef.current === id) setTracklistLoading(false);
    }
  };

  const renderRecord = ({ item }: { item: CollectionRecord }) => {
    const open = openId === item.discogs_release_id;
    const tracks = open && tracklist ? playableTracks(tracklist) : [];
    return (
      <View style={styles.pickRecord}>
        <Pressable
          onPress={() => toggle(item)}
          style={({ pressed }) => [styles.pickRecordRow, pressed && { opacity: 0.6 }]}
        >
          <Thumb uri={item.thumb_url ?? item.cover_url} size={44} />
          <View style={{ flex: 1 }}>
            <Text style={styles.trackTitle} numberOfLines={1}>{item.title}</Text>
            <Text style={styles.trackArtist} numberOfLines={1}>
              {[item.artists, item.year].filter(Boolean).join(' · ')}
            </Text>
          </View>
          <Text style={[styles.pickChevron, open && { transform: [{ rotate: '90deg' }] }]}>›</Text>
        </Pressable>

        {open ? (
          <View style={styles.pickTracks}>
            {tracklistLoading ? (
              <ActivityIndicator color={D.muted} style={{ marginVertical: 12 }} />
            ) : tracks.length ? (
              tracks.map((track, i) => {
                const added = existingKeys.has(trackKey(item.discogs_release_id, track.position, track.title));
                const trackAudio = audio.get(audioKey(item.discogs_release_id, track.position, track.title));
                const outOfRange = rangeActive && !inRange(trackAudio?.bpm);
                return (
                  <Pressable
                    key={i}
                    disabled={added}
                    onPress={() => onAdd(item, track)}
                    style={({ pressed }) => [
                      styles.pickTrackRow,
                      outOfRange && { opacity: 0.4 },
                      pressed && { opacity: 0.6 },
                    ]}
                  >
                    <Text style={styles.pickPosition}>{track.position ?? ''}</Text>
                    <Text style={[styles.pickTrackTitle, added && { color: D.muted }]} numberOfLines={2}>
                      {track.title}
                    </Text>
                    <AudioBadge audio={trackAudio} />
                    {track.duration ? <Text style={styles.trackDuration}>{track.duration}</Text> : null}
                    <View style={[styles.addCircle, added && styles.addCircleDone]}>
                      <Text style={styles.addCircleText}>{added ? '✓' : '+'}</Text>
                    </View>
                  </Pressable>
                );
              })
            ) : (
              <Text style={styles.detailEmptyText}>No tracklist available</Text>
            )}
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <View style={{ flex: 1 }}>
      <TextInput
        style={styles.pickSearch}
        value={query}
        onChangeText={setQuery}
        placeholder="Search your collection"
        placeholderTextColor={D.muted}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
      />
      {records ? <GenreStyleFilter items={records} value={tags} onChange={setTags} tone="dark" /> : null}
      <View style={styles.bpmFilter}>
        <Text style={styles.bpmFilterLabel}>BPM</Text>
        <TextInput
          style={styles.bpmFilterInput}
          value={bpmMin}
          onChangeText={setBpmMin}
          placeholder="min"
          placeholderTextColor={D.muted}
          keyboardType="number-pad"
        />
        <Text style={styles.bpmFilterLabel}>–</Text>
        <TextInput
          style={styles.bpmFilterInput}
          value={bpmMax}
          onChangeText={setBpmMax}
          placeholder="max"
          placeholderTextColor={D.muted}
          keyboardType="number-pad"
        />
        {rangeActive ? (
          <Pressable onPress={() => { setBpmMin(''); setBpmMax(''); }} hitSlop={8}>
            <Text style={styles.bpmFilterClear}>Clear</Text>
          </Pressable>
        ) : null}
      </View>
      {!records ? (
        <View style={styles.center}><ActivityIndicator color={D.muted} /></View>
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(r) => String(r.discogs_release_id)}
          renderItem={renderRecord}
          extraData={[openId, tracklist, tracklistLoading, existingKeys, audio, lo, hi]}
          contentContainerStyle={{ paddingHorizontal: PADDING, paddingBottom: insets.bottom + 32 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={<Text style={styles.detailEmptyText}>No matches</Text>}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // Sets list
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: PADDING,
    paddingTop: 60,
    marginBottom: 12,
  },
  title: { fontSize: 17, fontWeight: '600', color: C.text, letterSpacing: -0.3 },
  accentBtn: {
    backgroundColor: C.accent,
    paddingHorizontal: 14,
    borderRadius: 16,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  accentBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  createRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: PADDING,
    marginBottom: 12,
  },
  createInput: {
    flex: 1,
    fontSize: 16,
    color: C.text,
    paddingVertical: 4,
    borderBottomWidth: 1.5,
    borderBottomColor: C.accent,
    outlineStyle: 'none',
  } as any,
  cancelText: { fontSize: 13, color: C.muted, fontWeight: '500' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, paddingHorizontal: 40 },
  emptyText: { fontSize: 14, color: C.muted, textAlign: 'center', lineHeight: 20 },
  emptyBtn: { backgroundColor: C.accent, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20 },
  list: { paddingHorizontal: PADDING, paddingBottom: 64 },
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(26,22,38,0.12)',
  },
  mosaic: {
    width: 60,
    height: 60,
    borderRadius: 6,
    overflow: 'hidden',
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: 'rgba(26,22,38,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mosaicTile: { width: 30, height: 30 },
  mosaicFull: { width: 60, height: 60 },
  setName: { fontSize: 15, fontWeight: '600', color: C.text },
  setMeta: { fontSize: 12, color: C.muted, marginTop: 2 },
  chevron: { fontSize: 20, color: C.muted },
  thumbFallback: { backgroundColor: 'rgba(127,127,127,0.15)', alignItems: 'center', justifyContent: 'center' },

  // Set view
  detailRoot: { flex: 1, backgroundColor: D.bg },
  detailHeader: { paddingHorizontal: PADDING, paddingBottom: 12 },
  detailTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: D.chip,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: { color: D.muted, fontSize: 14, fontWeight: '600' },
  doneBtn: {
    backgroundColor: C.accent,
    paddingHorizontal: 14,
    borderRadius: 16,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailName: { fontSize: 24, fontWeight: '700', color: '#fff', letterSpacing: -0.5 },
  nameInput: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
    paddingVertical: 0,
    borderBottomWidth: 1.5,
    borderBottomColor: C.accent,
    outlineStyle: 'none',
  } as any,
  detailMeta: { fontSize: 13, color: D.muted, marginTop: 4 },
  segment: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    marginTop: 14,
    backgroundColor: D.chip,
    borderRadius: 10,
    padding: 3,
  },
  segmentBtn: { paddingHorizontal: 16, paddingVertical: 6, borderRadius: 8 },
  segmentBtnActive: { backgroundColor: 'rgba(255,255,255,0.16)' },
  segmentText: { fontSize: 13, fontWeight: '600', color: D.muted },
  segmentTextActive: { color: '#fff' },
  trackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: D.faint,
    backgroundColor: D.bg,
  },
  trackRowActive: { backgroundColor: '#1C1826' },
  trackNumber: { width: 22, fontSize: 13, color: D.muted, fontWeight: '600', textAlign: 'right' },
  trackTitle: { fontSize: 14, color: D.text, fontWeight: '600' },
  trackArtist: { fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 1 },
  trackAlbum: { fontSize: 11, color: D.muted, marginTop: 1 },
  trackDuration: { fontSize: 12, color: D.muted },
  trackSide: { alignItems: 'flex-end', gap: 4 },
  bpmFilter: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: PADDING, paddingBottom: 10 },
  bpmFilterLabel: { fontSize: 13, color: D.muted, fontWeight: '600' },
  bpmFilterInput: {
    width: 64,
    fontSize: 14,
    color: '#fff',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: D.chip,
    textAlign: 'center',
    outlineStyle: 'none',
  } as any,
  bpmFilterClear: { fontSize: 13, color: D.muted, fontWeight: '500' },
  removeBtn: { paddingHorizontal: 4 },
  removeText: { fontSize: 13, color: D.muted },
  coverBadge: {
    position: 'absolute',
    top: 4,
    left: 4,
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  coverTitle: { fontSize: 12, color: D.text, fontWeight: '600', marginTop: 6 },
  coverArtist: { fontSize: 11, color: D.muted, marginTop: 1 },
  detailFooter: { alignItems: 'center', paddingTop: 32 },
  deleteText: { fontSize: 14, color: '#F87171', fontWeight: '600' },
  detailEmpty: { alignItems: 'center', gap: 16, paddingVertical: 48 },
  detailEmptyText: { fontSize: 14, color: D.muted, textAlign: 'center', paddingVertical: 10 },

  // Track picker
  pickSearch: {
    fontSize: 15,
    color: '#fff',
    marginHorizontal: PADDING,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: D.chip,
    outlineStyle: 'none',
  } as any,
  pickRecord: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: D.faint },
  pickRecordRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  pickChevron: { fontSize: 20, color: D.muted, width: 14, textAlign: 'center' },
  pickTracks: { paddingLeft: 56, paddingBottom: 10 },
  pickTrackRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  pickPosition: { width: 28, fontSize: 12, color: D.muted, fontWeight: '600' },
  pickTrackTitle: { flex: 1, fontSize: 14, color: D.text },
  addCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addCircleDone: { backgroundColor: 'rgba(255,255,255,0.14)' },
  addCircleText: { color: '#fff', fontSize: 14, fontWeight: '700' },
});
