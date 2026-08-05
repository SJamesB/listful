import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  ViewStyle,
  useWindowDimensions,
} from 'react-native';
import DraggableFlatList, { RenderItemParams, ScaleDecorator } from 'react-native-draggable-flatlist';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useSectionEdgeScroll, type EdgesChangeHandler } from '@/hooks/use-section-edge-scroll';
import { supabase } from '@/lib/supabase';

const C = {
  text: '#1A1626',
  muted: 'rgba(26,22,38,0.45)',
  accent: '#4F46E5',
  danger: '#DC2626',
} as const;

const COLS = 3;
const PADDING = 16;
const GAP = 6;
const MODAL_PADDING = 28;
const SEARCH_DEBOUNCE_MS = 400;

interface VideogameItem {
  id: string;
  igdb_id: string;
  title: string;
  year: string | null;
  cover_url: string | null;
  sort_order: number | null;
  status: 'to_play' | 'play' | null;
  nine_club: boolean;
}

interface SearchResult {
  igdb_id: string;
  title: string;
  year: string | null;
  cover_url: string | null;
}

interface DetailData {
  overview: string | null;
  developer: string | null;
  publisher: string | null;
  genres: string | null;
  year: string | null;
}

export type VideogamePosterPageProps =
  | { title: string; mode: 'play'; status: 'to_play' | 'play' }
  | { title: string; mode: 'nine_club' };

type Props = VideogamePosterPageProps & { onEdgesChange?: EdgesChangeHandler };

const coverUri = (path: string | null) => path;

const STATUS_OPTIONS: { key: 'to_play' | 'play'; label: string }[] = [
  { key: 'to_play', label: 'To Play' },
  { key: 'play', label: 'Played' },
];

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue} numberOfLines={3}>{value}</Text>
    </View>
  );
}

function FilterRow<T extends string>({ options, active, onSelect, style }: {
  options: { key: T; label: string }[];
  active: T;
  onSelect: (key: T) => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.filterRow, style]}>
      {options.map((o) => (
        <Pressable
          key={o.key}
          onPress={() => onSelect(o.key)}
          style={[styles.filterChip, active === o.key && styles.filterChipActive]}
        >
          <Text style={[styles.filterChipText, active === o.key && styles.filterChipTextActive]}>
            {o.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

export default function VideogamePosterPage(props: Props) {
  const { title, mode, onEdgesChange } = props;
  const edgeScroll = useSectionEdgeScroll(onEdgesChange);
  const insets = useSafeAreaInsets();
  const status = mode === 'play' ? props.status : undefined;

  const { width, height } = useWindowDimensions();
  const posterWidth = (width - PADDING * 2 - GAP * (COLS - 1)) / COLS;
  const posterHeight = posterWidth * 1.5;
  const resultWidth = (width - MODAL_PADDING * 2 - GAP * (COLS - 1)) / COLS;
  const resultHeight = resultWidth * 1.5;
  const posterDetailWidth = width * 0.52;

  const [items, setItems] = useState<VideogameItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [addedKeys, setAddedKeys] = useState<Set<string>>(new Set());

  const [actionItem, setActionItem] = useState<VideogameItem | null>(null);

  const [detailItem, setDetailItem] = useState<VideogameItem | null>(null);
  const [detailData, setDetailData] = useState<DetailData | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [reorderOpen, setReorderOpen] = useState(false);

  const load = useCallback(async () => {
    let q = supabase
      .from('videogame_items')
      .select('id, igdb_id, title, year, cover_url, sort_order, status, nine_club');
    q = mode === 'nine_club' ? q.eq('nine_club', true) : q.eq('status', status!);
    const { data } = await q.order('sort_order', { ascending: false, nullsFirst: false });
    if (data) setItems(data as VideogameItem[]);
    setLoading(false);
  }, [mode, status]);

  useEffect(() => {
    load();
  }, [load]);

  const existingKeys = useMemo(
    () => new Set(items.map((i) => i.igdb_id)),
    [items],
  );

  // Debounced IGDB search
  useEffect(() => {
    if (!searchOpen) return;
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      setSearchError(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    const timeout = setTimeout(async () => {
      try {
        const { data, error } = await supabase.functions.invoke('videogame-search', {
          body: { query: trimmed },
        });
        if (error) throw new Error(error.message);
        if (data?.error) throw new Error(data.error);
        setResults((data?.results ?? []) as SearchResult[]);
        setSearchError(null);
      } catch (err) {
        setSearchError(err instanceof Error ? err.message : String(err));
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [query, searchOpen]);

  const openSearch = () => {
    setQuery('');
    setResults([]);
    setSearchError(null);
    setAddedKeys(new Set());
    setSearchOpen(true);
  };

  const addResult = async (result: SearchResult) => {
    const now = new Date().toISOString();
    const payload: Record<string, unknown> = {
      igdb_id: result.igdb_id,
      title: result.title,
      year: result.year,
      cover_url: result.cover_url,
    };
    if (!existingKeys.has(result.igdb_id)) {
      const maxSortOrder = items.reduce((max, i) => (i.sort_order != null && i.sort_order > max ? i.sort_order : max), -1);
      payload.sort_order = maxSortOrder + 1;
    }
    if (mode === 'nine_club') {
      payload.nine_club = true;
      payload.nine_club_added_at = now;
      payload.status = 'play';
      payload.added_at = now;
      payload.played_at = now;
    } else {
      payload.status = status;
      payload.added_at = now;
      payload.played_at = status === 'play' ? now : null;
    }
    const { error } = await supabase.from('videogame_items').upsert(payload, { onConflict: 'igdb_id' });
    if (!error) {
      setAddedKeys((prev) => new Set(prev).add(result.igdb_id));
      load();
    }
  };

  const removeItem = async (item: VideogameItem) => {
    await supabase.from('videogame_items').delete().eq('id', item.id);
    setActionItem(null);
    load();
  };

  const updateItemStatus = async (item: VideogameItem, newStatus: 'to_play' | 'play') => {
    const payload: Record<string, unknown> = {
      status: newStatus,
      played_at: newStatus === 'play' ? new Date().toISOString() : null,
    };
    if (newStatus === 'play') {
      const { data: maxRow } = await supabase
        .from('videogame_items')
        .select('sort_order')
        .eq('status', 'play')
        .order('sort_order', { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();
      payload.sort_order = (maxRow?.sort_order ?? -1) + 1;
    }
    await supabase.from('videogame_items').update(payload).eq('id', item.id);
    setActionItem((prev) => (prev ? { ...prev, status: newStatus } : prev));
    load();
  };

  const openDetail = useCallback(async (item: VideogameItem) => {
    setDetailItem(item);
    setDetailData(null);
    setDetailLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('videogame-details', {
        body: { igdb_id: item.igdb_id },
      });
      if (!error && !data?.error) setDetailData(data as DetailData);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const closeDetail = useCallback(() => {
    setDetailItem(null);
    setDetailData(null);
  }, []);

  const toggleNineClub = async (item: VideogameItem, nineClub: boolean) => {
    await supabase
      .from('videogame_items')
      .update({ nine_club: nineClub, nine_club_added_at: nineClub ? new Date().toISOString() : null })
      .eq('id', item.id);
    setActionItem((prev) => (prev ? { ...prev, nine_club: nineClub } : prev));
    load();
  };

  const openReorder = useCallback(() => setReorderOpen(true), []);
  const closeReorder = useCallback(() => setReorderOpen(false), []);

  const onReorderDragEnd = useCallback(async ({ data }: { data: VideogameItem[] }) => {
    setItems(data);
    const count = data.length;
    await Promise.all(
      data.map((item, index) =>
        supabase.from('videogame_items').update({ sort_order: count - 1 - index }).eq('id', item.id),
      ),
    );
  }, []);

  const renderReorderItem = useCallback(
    ({ item, drag, isActive }: RenderItemParams<VideogameItem>) => (
      <ScaleDecorator>
        <Pressable
          onLongPress={drag}
          delayLongPress={300}
          disabled={isActive}
          style={[styles.reorderRow, isActive && styles.reorderRowActive]}
        >
          {item.cover_url ? (
            <Image source={{ uri: coverUri(item.cover_url)! }} style={styles.reorderThumb} contentFit="cover" />
          ) : (
            <View style={[styles.reorderThumb, styles.posterFallback]}>
              <Text style={{ fontSize: 14 }}>🎮</Text>
            </View>
          )}
          <Text style={styles.reorderTitle} numberOfLines={1}>{item.title}</Text>
          <Text style={styles.dragHandleText}>⠿</Text>
        </Pressable>
      </ScaleDecorator>
    ),
    [],
  );

  const renderItem = ({ item }: { item: VideogameItem }) => (
    <Pressable
      style={[styles.posterWrap, { width: posterWidth }]}
      onPress={() => openDetail(item)}
      onLongPress={() => setActionItem(item)}
      delayLongPress={350}
    >
      {item.cover_url ? (
        <Image
          source={{ uri: coverUri(item.cover_url)! }}
          style={[styles.poster, { width: posterWidth, height: posterHeight }]}
          contentFit="cover"
        />
      ) : (
        <View style={[styles.poster, styles.posterFallback, { width: posterWidth, height: posterHeight }]}>
          <Text style={styles.fallbackEmoji}>🎮</Text>
        </View>
      )}
    </Pressable>
  );

  const renderResult = ({ item }: { item: SearchResult }) => {
    const added = existingKeys.has(item.igdb_id) || addedKeys.has(item.igdb_id);
    return (
      <Pressable style={[styles.resultWrap, { width: resultWidth }]} onPress={() => addResult(item)}>
        <View>
          {item.cover_url ? (
            <Image
              source={{ uri: coverUri(item.cover_url)! }}
              style={[styles.resultPoster, { width: resultWidth, height: resultHeight }]}
              contentFit="cover"
            />
          ) : (
            <View style={[styles.resultPoster, styles.posterFallback, { width: resultWidth, height: resultHeight }]}>
              <Text style={styles.fallbackEmoji}>🎮</Text>
            </View>
          )}
          {added && (
            <View style={styles.addedBadge}>
              <Text style={styles.addedBadgeText}>✓</Text>
            </View>
          )}
        </View>
        <Text style={styles.resultTitle} numberOfLines={2}>{item.title}</Text>
        {item.year ? <Text style={styles.resultYear}>{item.year}</Text> : null}
      </Pressable>
    );
  };

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        <View style={styles.headerActions}>
          <Pressable
            onPress={openReorder}
            disabled={items.length < 2}
            style={({ pressed }) => [styles.reorderBtn, { opacity: pressed || items.length < 2 ? 0.4 : 1 }]}
          >
            <Text style={styles.reorderBtnText}>Reorder</Text>
          </Pressable>
          <Pressable
            onPress={openSearch}
            style={({ pressed }) => [styles.addBtn, { opacity: pressed ? 0.6 : 1 }]}
          >
            <Text style={styles.addBtnText}>+ Add</Text>
          </Pressable>
        </View>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={C.accent} /></View>
      ) : items.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>Nothing here yet</Text>
          <Pressable
            onPress={openSearch}
            style={({ pressed }) => [styles.emptyBtn, { opacity: pressed ? 0.6 : 1 }]}
          >
            <Text style={styles.emptyBtnText}>Search IGDB</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          numColumns={COLS}
          contentContainerStyle={[styles.grid, { padding: PADDING }]}
          columnWrapperStyle={{ gap: GAP }}
          showsVerticalScrollIndicator={false}
          {...edgeScroll}
        />
      )}

      <Modal
        visible={searchOpen}
        animationType="slide"
        transparent
        presentationStyle="overFullScreen"
        onRequestClose={() => setSearchOpen(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={[styles.modalCard, { maxHeight: height * 0.85 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add to {title}</Text>
              <Pressable onPress={() => setSearchOpen(false)} hitSlop={8}>
                <Text style={styles.doneText}>Done</Text>
              </Pressable>
            </View>
            <TextInput
              style={styles.modalInput}
              value={query}
              onChangeText={setQuery}
              placeholder="Search videogames"
              placeholderTextColor={C.muted}
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
              returnKeyType="search"
            />
            {searchError ? <Text style={styles.errorText}>{searchError}</Text> : null}
            {searching ? (
              <ActivityIndicator color={C.accent} style={styles.searchSpinner} />
            ) : (
              <FlatList
                style={styles.resultsList}
                data={results}
                keyExtractor={(item) => item.igdb_id}
                renderItem={renderResult}
                numColumns={COLS}
                columnWrapperStyle={{ gap: GAP }}
                contentContainerStyle={styles.resultsGrid}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                ListEmptyComponent={
                  query.trim() ? <Text style={styles.emptyText}>No results</Text> : null
                }
              />
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Game detail modal */}
      <Modal
        visible={!!detailItem}
        animationType="fade"
        transparent
        presentationStyle="overFullScreen"
        onRequestClose={closeDetail}
      >
        <View style={styles.detailOverlay}>
          {detailItem?.cover_url && (
            <Image
              source={{ uri: detailItem.cover_url }}
              style={[StyleSheet.absoluteFill, { opacity: 0.18 }]}
              contentFit="cover"
              blurRadius={25}
            />
          )}
          <LinearGradient
            colors={['rgba(8,8,8,0.1)', '#080808']}
            locations={[0, 0.5]}
            style={StyleSheet.absoluteFill}
          />
          <Pressable style={styles.detailClose} onPress={closeDetail} hitSlop={12}>
            <Text style={styles.detailCloseText}>✕</Text>
          </Pressable>
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={styles.detailContent}
            showsVerticalScrollIndicator={false}
          >
            {detailItem?.cover_url ? (
              <Image
                source={{ uri: detailItem.cover_url }}
                style={[styles.detailPoster, { width: posterDetailWidth, height: posterDetailWidth * 1.5 }]}
                contentFit="cover"
              />
            ) : (
              <View style={[styles.detailPoster, styles.detailPosterFallback, { width: posterDetailWidth, height: posterDetailWidth * 1.5 }]}>
                <Text style={{ fontSize: 48 }}>🎮</Text>
              </View>
            )}
            <Text style={styles.detailTitle}>{detailItem?.title}</Text>
            <Text style={styles.detailMetaText}>{detailItem?.year}</Text>
            {detailLoading ? (
              <ActivityIndicator color="rgba(255,255,255,0.35)" style={{ marginTop: 20 }} />
            ) : detailData ? (
              <>
                {detailData.overview ? (
                  <Text style={styles.detailOverview}>{detailData.overview}</Text>
                ) : null}
                <View style={styles.detailFields}>
                  {detailData.developer ? (
                    <DetailRow label="Developer" value={detailData.developer} />
                  ) : null}
                  {detailData.publisher ? (
                    <DetailRow label="Publisher" value={detailData.publisher} />
                  ) : null}
                  {detailData.genres ? (
                    <DetailRow label="Genres" value={detailData.genres} />
                  ) : null}
                </View>
              </>
            ) : null}
          </ScrollView>
        </View>
      </Modal>

      <Modal
        visible={!!actionItem}
        animationType="fade"
        transparent
        presentationStyle="overFullScreen"
        onRequestClose={() => setActionItem(null)}
      >
        <Pressable style={styles.actionOverlay} onPress={() => setActionItem(null)}>
          <Pressable style={styles.actionCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.actionTitle} numberOfLines={2}>{actionItem?.title}</Text>

            <Text style={styles.editSectionLabel}>Status</Text>
            <FilterRow
              options={STATUS_OPTIONS}
              active={actionItem?.status ?? 'to_play'}
              onSelect={(s) => actionItem && updateItemStatus(actionItem, s)}
              style={styles.editFilterRow}
            />

            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>In 9-Club</Text>
              <Switch
                value={!!actionItem?.nine_club}
                onValueChange={(v) => { if (actionItem) toggleNineClub(actionItem, v); }}
                trackColor={{ true: C.accent }}
              />
            </View>

            <Pressable
              style={({ pressed }) => [styles.actionBtn, pressed && styles.actionBtnPressed]}
              onPress={() => actionItem && removeItem(actionItem)}
            >
              <Text style={[styles.actionBtnText, styles.actionBtnDanger]}>Remove</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.actionBtn, pressed && styles.actionBtnPressed]}
              onPress={() => setActionItem(null)}
            >
              <Text style={styles.actionBtnText}>Done</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={reorderOpen} animationType="slide" transparent onRequestClose={closeReorder}>
        <GestureHandlerRootView style={styles.reorderBackdrop}>
          <View style={[styles.reorderSheet, { paddingBottom: insets.bottom + 24 }]}>
            <View style={styles.reorderHeader}>
              <Text style={styles.reorderHeading}>Reorder</Text>
              <Pressable onPress={closeReorder} hitSlop={12}>
                <Text style={styles.reorderDone}>Done</Text>
              </Pressable>
            </View>
            <DraggableFlatList
              data={items}
              keyExtractor={(item) => item.id}
              renderItem={renderReorderItem}
              onDragEnd={onReorderDragEnd}
              activationDistance={5}
              contentContainerStyle={styles.reorderList}
            />
          </View>
        </GestureHandlerRootView>
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
    marginBottom: 12,
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    color: C.text,
    letterSpacing: -0.3,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  reorderBtn: {
    paddingHorizontal: 4,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reorderBtnText: { color: C.accent, fontSize: 13, fontWeight: '600' },
  addBtn: {
    backgroundColor: C.accent,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    minWidth: 60,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: PADDING,
    marginBottom: 12,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: 'rgba(26,22,38,0.06)',
  },
  filterChipActive: {
    backgroundColor: C.accent,
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: C.muted,
  },
  filterChipTextActive: {
    color: '#fff',
  },
  errorText: {
    fontSize: 12,
    color: C.danger,
    marginBottom: 8,
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, paddingHorizontal: 40 },
  emptyText: { fontSize: 14, color: C.muted, textAlign: 'center', lineHeight: 20 },
  emptyBtn: {
    backgroundColor: C.accent,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  emptyBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  grid: { paddingBottom: 64 },
  posterWrap: { marginBottom: GAP },
  poster: { borderRadius: 6, backgroundColor: 'rgba(26,22,38,0.08)' },
  posterFallback: { alignItems: 'center', justifyContent: 'center' },
  fallbackEmoji: { fontSize: 24 },
  // Search modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: MODAL_PADDING,
    gap: 14,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: C.text },
  doneText: { fontSize: 14, color: C.accent, fontWeight: '600' },
  modalInput: {
    fontSize: 16,
    color: C.text,
    borderBottomWidth: 1.5,
    borderBottomColor: C.accent,
    paddingVertical: 6,
    outlineStyle: 'none',
  } as any,
  searchSpinner: { marginTop: 24, marginBottom: 24 },
  resultsList: { flexShrink: 1 },
  resultsGrid: { paddingTop: 8, paddingBottom: 12 },
  resultWrap: { marginBottom: 14 },
  resultPoster: { borderRadius: 6, backgroundColor: 'rgba(26,22,38,0.08)' },
  resultTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: C.text,
    marginTop: 6,
    lineHeight: 15,
  },
  resultYear: { fontSize: 11, color: C.muted, marginTop: 2 },
  addedBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addedBadgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  // Detail modal
  detailOverlay: {
    flex: 1,
    backgroundColor: '#080808',
  },
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
  detailCloseText: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 14,
    fontWeight: '600',
  },
  detailContent: {
    paddingTop: 72,
    paddingHorizontal: 28,
    paddingBottom: 64,
    alignItems: 'center',
  },
  detailPoster: {
    borderRadius: 10,
    marginBottom: 22,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.7,
    shadowRadius: 24,
    elevation: 14,
  },
  detailPosterFallback: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
    letterSpacing: -0.4,
    marginBottom: 8,
  },
  detailMetaText: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.38)',
    fontWeight: '500',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 24,
  },
  detailOverview: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 28,
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
  // Action modal
  actionOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  actionCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    width: '100%',
    maxWidth: 320,
    gap: 4,
  },
  actionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: C.text,
    marginBottom: 8,
    textAlign: 'center',
  },
  editSectionLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: C.muted,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginTop: 8,
    marginBottom: 6,
  },
  editFilterRow: {
    paddingHorizontal: 0,
    marginBottom: 4,
    flexWrap: 'wrap',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    marginTop: 4,
    marginBottom: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(26,22,38,0.08)',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(26,22,38,0.08)',
  },
  switchLabel: {
    fontSize: 15,
    fontWeight: '500',
    color: C.text,
  },
  actionBtn: {
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  actionBtnPressed: {
    backgroundColor: 'rgba(26,22,38,0.06)',
  },
  actionBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: C.text,
  },
  actionBtnDanger: {
    color: C.danger,
  },
  // Reorder modal
  reorderBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  reorderSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '70%',
  },
  reorderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(26,22,38,0.08)',
  },
  reorderHeading: {
    fontSize: 17,
    fontWeight: '700',
    color: C.text,
  },
  reorderDone: {
    fontSize: 15,
    fontWeight: '600',
    color: C.accent,
  },
  reorderList: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  reorderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(26,22,38,0.08)',
  },
  reorderRowActive: {
    opacity: 0.85,
  },
  reorderThumb: {
    width: 32,
    height: 48,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reorderTitle: {
    flex: 1,
    fontSize: 15,
    color: C.text,
    fontWeight: '500',
  },
  dragHandleText: {
    fontSize: 18,
    color: C.muted,
  },
});
