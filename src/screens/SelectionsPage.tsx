import { Image } from 'expo-image';
import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { fetchAllRows, supabase } from '@/lib/supabase';

// Light colours for the section page; the selection view itself is dark, like
// the set view and the record detail view.
const C = {
  text: '#1A1626',
  muted: 'rgba(26,22,38,0.45)',
  accent: '#EA580C',
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

interface SelectionSummary {
  id: string;
  name: string;
  updated_at: string;
  record_selection_albums: { cover_url: string | null; sort_order: number }[];
}

interface SelectionAlbum {
  id: string;
  sort_order: number;
  release_id: number;
  title: string;
  artists: string | null;
  year: number | null;
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

const albumCount = (n: number) => `${n} ${n === 1 ? 'album' : 'albums'}`;

function Thumb({ uri, size, radius = 4 }: { uri: string | null; size: number; radius?: number }) {
  return uri ? (
    <Image source={{ uri }} style={{ width: size, height: size, borderRadius: radius }} contentFit="cover" />
  ) : (
    <View style={[styles.thumbFallback, { width: size, height: size, borderRadius: radius }]}>
      <Text style={{ fontSize: size * 0.4 }}>💿</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Selections list (section page)
// ---------------------------------------------------------------------------

export default function SelectionsPage({ onEdgesChange }: { onEdgesChange?: EdgesChangeHandler }) {
  const edgeScroll = useSectionEdgeScroll(onEdgesChange);
  const [selections, setSelections] = useState<SelectionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('record_selections')
      .select('id, name, updated_at, record_selection_albums(cover_url, sort_order)')
      .order('updated_at', { ascending: false });
    if (data) setSelections(data as SelectionSummary[]);
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
    const { data, error } = await supabase.from('record_selections').insert({ name }).select('id').single();
    setNewName('');
    setCreating(false);
    if (error) {
      console.error('create selection failed:', error.message);
      return;
    }
    await load();
    setOpenId(data.id);
  };

  const renderSelection = ({ item }: { item: SelectionSummary }) => {
    const mosaic = [...item.record_selection_albums]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((a) => a.cover_url)
      .filter((c): c is string => !!c)
      .slice(0, 4);
    return (
      <Pressable
        style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}
        onPress={() => setOpenId(item.id)}
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
            <Text style={{ fontSize: 22 }}>📚</Text>
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.rowName} numberOfLines={1}>{item.name}</Text>
          <Text style={styles.rowMeta}>{albumCount(item.record_selection_albums.length)}</Text>
        </View>
        <Text style={styles.chevron}>›</Text>
      </Pressable>
    );
  };

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.title}>📚 Selections</Text>
        <Pressable
          onPress={() => setCreating(true)}
          style={({ pressed }) => [styles.accentBtn, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Text style={styles.accentBtnText}>+ New selection</Text>
        </Pressable>
      </View>

      {creating ? (
        <View style={styles.createRow}>
          <TextInput
            style={styles.createInput}
            value={newName}
            onChangeText={setNewName}
            onSubmitEditing={create}
            placeholder="Selection title"
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
      ) : selections.length === 0 && !creating ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>No selections yet. Create one and add albums from your collection.</Text>
          <Pressable onPress={() => setCreating(true)} style={styles.emptyBtn}>
            <Text style={styles.accentBtnText}>Create a selection</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={selections}
          keyExtractor={(s) => s.id}
          renderItem={renderSelection}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          {...edgeScroll}
        />
      )}

      <Modal
        visible={!!openId}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setOpenId(null)}
      >
        {openId ? (
          <SafeAreaProvider>
            <GestureHandlerRootView style={{ flex: 1 }}>
              <SelectionDetail
                selectionId={openId}
                onClose={() => { setOpenId(null); load(); }}
              />
            </GestureHandlerRootView>
          </SafeAreaProvider>
        ) : null}
      </Modal>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Selection view: cover grid / album list, reorder, remove, rename, delete
// ---------------------------------------------------------------------------

function SelectionDetail({ selectionId, onClose }: { selectionId: string; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const coverSize = (width - PADDING * 2 - GAP * (GRID_COLS - 1)) / GRID_COLS;

  const [name, setName] = useState('');
  const [albums, setAlbums] = useState<SelectionAlbum[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [adding, setAdding] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const load = useCallback(async () => {
    const [{ data: selection }, { data: rows }] = await Promise.all([
      supabase.from('record_selections').select('name').eq('id', selectionId).single(),
      supabase.from('record_selection_albums').select('*').eq('selection_id', selectionId).order('sort_order'),
    ]);
    if (selection) setName(selection.name);
    if (rows) setAlbums(rows as SelectionAlbum[]);
    setLoading(false);
  }, [selectionId]);

  useEffect(() => {
    load();
  }, [load]);

  const touch = () =>
    supabase.from('record_selections').update({ updated_at: new Date().toISOString() }).eq('id', selectionId);

  const existingIds = useMemo(() => new Set(albums.map((a) => a.release_id)), [albums]);

  const addAlbum = async (record: CollectionRecord) => {
    const sortOrder = albums.reduce((max, a) => Math.max(max, a.sort_order), -1) + 1;
    const { data, error } = await supabase
      .from('record_selection_albums')
      .insert({
        selection_id: selectionId,
        sort_order: sortOrder,
        release_id: record.discogs_release_id,
        title: record.title,
        artists: record.artists,
        year: record.year,
        cover_url: record.cover_url ?? record.thumb_url,
      })
      .select('*')
      .single();
    if (error) {
      console.error('add album failed:', error.message);
      return;
    }
    setAlbums((prev) => [...prev, data as SelectionAlbum]);
    touch();
  };

  const removeAlbum = async (releaseId: number) => {
    setAlbums((prev) => prev.filter((a) => a.release_id !== releaseId));
    await supabase
      .from('record_selection_albums')
      .delete()
      .eq('selection_id', selectionId)
      .eq('release_id', releaseId);
    touch();
  };

  const toggleAlbum = (record: CollectionRecord) =>
    existingIds.has(record.discogs_release_id) ? removeAlbum(record.discogs_release_id) : addAlbum(record);

  const onDragEnd = async ({ data }: { data: SelectionAlbum[] }) => {
    const reordered = data.map((a, i) => ({ ...a, sort_order: i }));
    setAlbums(reordered);
    await Promise.all(
      reordered.map((a) =>
        supabase.from('record_selection_albums').update({ sort_order: a.sort_order }).eq('id', a.id),
      ),
    );
    touch();
  };

  const saveName = async () => {
    const next = nameDraft.trim();
    setEditingName(false);
    if (!next || next === name) return;
    setName(next);
    await supabase
      .from('record_selections')
      .update({ name: next, updated_at: new Date().toISOString() })
      .eq('id', selectionId);
  };

  const deleteSelection = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    await supabase.from('record_selections').delete().eq('id', selectionId);
    onClose();
  };

  const renderRow = ({ item, drag, isActive, getIndex }: RenderItemParams<SelectionAlbum>) => (
    <ScaleDecorator>
      <Pressable
        onLongPress={drag}
        delayLongPress={250}
        disabled={isActive}
        style={[styles.albumRow, isActive && styles.albumRowActive]}
      >
        <Text style={styles.albumNumber}>{(getIndex() ?? 0) + 1}</Text>
        <Thumb uri={item.cover_url} size={44} />
        <View style={{ flex: 1 }}>
          <Text style={styles.albumTitle} numberOfLines={1}>{item.title}</Text>
          <Text style={styles.albumArtist} numberOfLines={1}>
            {[item.artists, item.year].filter(Boolean).join(' · ')}
          </Text>
        </View>
        <Pressable onPress={() => removeAlbum(item.release_id)} hitSlop={10} style={styles.removeBtn}>
          <Text style={styles.removeText}>✕</Text>
        </Pressable>
      </Pressable>
    </ScaleDecorator>
  );

  const renderCover = ({ item }: { item: SelectionAlbum }) => (
    <View style={{ width: coverSize, marginBottom: 12 }}>
      <Thumb uri={item.cover_url} size={coverSize} radius={4} />
      <Text style={styles.coverTitle} numberOfLines={1}>{item.title}</Text>
      <Text style={styles.coverArtist} numberOfLines={1}>{item.artists}</Text>
    </View>
  );

  const header = (
    <View style={[styles.detailHeader, { paddingTop: insets.top + 12 }]}>
      <View style={styles.detailTopRow}>
        <Pressable onPress={onClose} hitSlop={12} style={styles.closeBtn}>
          <Text style={styles.closeText}>✕</Text>
        </Pressable>
        <Pressable onPress={() => setAdding(!adding)} style={styles.doneBtn}>
          <Text style={styles.accentBtnText}>{adding ? 'Done' : '+ Add albums'}</Text>
        </Pressable>
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
      <Text style={styles.detailMeta}>{albumCount(albums.length)}</Text>

      {!adding ? (
        <View style={styles.segment}>
          {(['grid', 'list'] as const).map((v) => (
            <Pressable
              key={v}
              onPress={() => setView(v)}
              style={[styles.segmentBtn, view === v && styles.segmentBtnActive]}
            >
              <Text style={[styles.segmentText, view === v && styles.segmentTextActive]}>
                {v === 'grid' ? 'Covers' : 'List'}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );

  const footer = (
    <View style={[styles.detailFooter, { paddingBottom: insets.bottom + 32 }]}>
      <Pressable onPress={deleteSelection} onBlur={() => setConfirmDelete(false)}>
        <Text style={styles.deleteText}>
          {confirmDelete ? 'Tap again to delete this selection' : 'Delete selection'}
        </Text>
      </Pressable>
    </View>
  );

  const empty = (
    <View style={styles.detailEmpty}>
      <Text style={styles.detailEmptyText}>No albums yet.</Text>
      <Pressable onPress={() => setAdding(true)} style={styles.emptyBtn}>
        <Text style={styles.accentBtnText}>Add albums from your collection</Text>
      </Pressable>
    </View>
  );

  return (
    <View style={styles.detailRoot}>
      {header}
      {loading ? (
        <View style={styles.center}><ActivityIndicator color={D.muted} /></View>
      ) : adding ? (
        <AlbumPicker existingIds={existingIds} onToggle={toggleAlbum} />
      ) : view === 'list' ? (
        <DraggableFlatList
          data={albums}
          keyExtractor={(a) => a.id}
          renderItem={renderRow}
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
          keyExtractor={(a) => a.id}
          renderItem={renderCover}
          numColumns={GRID_COLS}
          columnWrapperStyle={{ gap: GAP }}
          contentContainerStyle={{ paddingHorizontal: PADDING, paddingTop: 4 }}
          ListEmptyComponent={empty}
          ListFooterComponent={footer}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Album picker: search the collection, tap an album to add or remove it
// ---------------------------------------------------------------------------

// The collection rarely changes while the app is open; load it once.
let collectionCache: CollectionRecord[] | null = null;

function AlbumPicker({
  existingIds,
  onToggle,
}: {
  existingIds: Set<number>;
  onToggle: (record: CollectionRecord) => void;
}) {
  const insets = useSafeAreaInsets();
  const [records, setRecords] = useState<CollectionRecord[] | null>(collectionCache);
  const [query, setQuery] = useState('');
  const [tags, setTags] = useState<GenreStyleSelection>(EMPTY_SELECTION);

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
      (r) => matchesSelection(r, tags) && (!q || `${r.title} ${r.artists ?? ''}`.toLowerCase().includes(q)),
    );
  }, [records, query, tags]);

  const renderRecord = ({ item }: { item: CollectionRecord }) => {
    const added = existingIds.has(item.discogs_release_id);
    return (
      <Pressable
        onPress={() => onToggle(item)}
        style={({ pressed }) => [styles.pickRow, pressed && { opacity: 0.6 }]}
      >
        <Thumb uri={item.thumb_url ?? item.cover_url} size={44} />
        <View style={{ flex: 1 }}>
          <Text style={styles.albumTitle} numberOfLines={1}>{item.title}</Text>
          <Text style={styles.albumArtist} numberOfLines={1}>
            {[item.artists, item.year].filter(Boolean).join(' · ')}
          </Text>
        </View>
        <View style={[styles.addCircle, added && styles.addCircleDone]}>
          <Text style={styles.addCircleText}>{added ? '✓' : '+'}</Text>
        </View>
      </Pressable>
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
      {!records ? (
        <View style={styles.center}><ActivityIndicator color={D.muted} /></View>
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(r) => String(r.discogs_release_id)}
          renderItem={renderRecord}
          extraData={existingIds}
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
  // Selections list
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
  row: {
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
  rowName: { fontSize: 15, fontWeight: '600', color: C.text },
  rowMeta: { fontSize: 12, color: C.muted, marginTop: 2 },
  chevron: { fontSize: 20, color: C.muted },
  thumbFallback: { backgroundColor: 'rgba(127,127,127,0.15)', alignItems: 'center', justifyContent: 'center' },

  // Selection view
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
  albumRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: D.faint,
    backgroundColor: D.bg,
  },
  albumRowActive: { backgroundColor: '#1C1826' },
  albumNumber: { width: 22, fontSize: 13, color: D.muted, fontWeight: '600', textAlign: 'right' },
  albumTitle: { fontSize: 14, color: D.text, fontWeight: '600' },
  albumArtist: { fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 1 },
  removeBtn: { paddingHorizontal: 4 },
  removeText: { fontSize: 13, color: D.muted },
  coverTitle: { fontSize: 12, color: D.text, fontWeight: '600', marginTop: 6 },
  coverArtist: { fontSize: 11, color: D.muted, marginTop: 1 },
  detailFooter: { alignItems: 'center', paddingTop: 32 },
  deleteText: { fontSize: 14, color: '#F87171', fontWeight: '600' },
  detailEmpty: { alignItems: 'center', gap: 16, paddingVertical: 48 },
  detailEmptyText: { fontSize: 14, color: D.muted, textAlign: 'center', paddingVertical: 10 },

  // Album picker
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
  pickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: D.faint,
  },
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
