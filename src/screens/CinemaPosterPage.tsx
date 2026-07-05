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
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';

import { useSectionEdgeScroll, type EdgesChangeHandler } from '@/hooks/use-section-edge-scroll';
import { supabase } from '@/lib/supabase';

const C = {
  text: '#1A1626',
  muted: 'rgba(26,22,38,0.45)',
  accent: '#7C3AED',
  danger: '#DC2626',
} as const;

const POSTER_BASE = 'https://image.tmdb.org/t/p/w342';
const POSTER_BASE_LG = 'https://image.tmdb.org/t/p/w780';
const COLS = 3;
const PADDING = 16;
const GAP = 6;
const MODAL_PADDING = 28;
const SEARCH_DEBOUNCE_MS = 400;

interface CinemaItem {
  id: string;
  tmdb_id: number;
  media_type: 'movie' | 'tv';
  title: string;
  year: string | null;
  poster_path: string | null;
}

interface SearchResult {
  tmdb_id: number;
  media_type: 'movie' | 'tv';
  title: string;
  year: string | null;
  poster_path: string | null;
}

interface DetailData {
  overview: string | null;
  director?: string | null;
  created_by?: string | null;
  studio: string | null;
  composer: string | null;
  year: string | null;
}

export type CinemaPosterPageProps =
  | { title: string; mode: 'watch'; status: 'to_watch' | 'watched' }
  | { title: string; mode: 'nine_club' };

type Props = CinemaPosterPageProps & { onEdgesChange?: EdgesChangeHandler };

type NineClubCategory = 'film' | 'tv' | 'animation';

const NINE_CLUB_CATEGORIES: { key: NineClubCategory; label: string }[] = [
  { key: 'film', label: 'Film' },
  { key: 'tv', label: 'TV' },
  { key: 'animation', label: 'Animation' },
];

const WATCHLIST_FILTERS: { key: 'movie' | 'tv'; label: string }[] = [
  { key: 'movie', label: 'Film' },
  { key: 'tv', label: 'TV' },
];

const posterUri = (path: string | null) => (path ? `${POSTER_BASE}${path}` : null);
const resultKey = (tmdbId: number, mediaType: string) => `${tmdbId}-${mediaType}`;

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue} numberOfLines={3}>{value}</Text>
    </View>
  );
}

function FilterRow<T extends string>({ options, active, onSelect }: {
  options: { key: T; label: string }[];
  active: T;
  onSelect: (key: T) => void;
}) {
  return (
    <View style={styles.filterRow}>
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

export default function CinemaPosterPage(props: Props) {
  const { title, mode, onEdgesChange } = props;
  const edgeScroll = useSectionEdgeScroll(onEdgesChange);
  const status = mode === 'watch' ? props.status : undefined;
  const [category, setCategory] = useState<NineClubCategory>('film');
  const [mediaTypeFilter, setMediaTypeFilter] = useState<'movie' | 'tv'>('movie');
  const searchMediaType = mode === 'watch' ? mediaTypeFilter : undefined;
  const modalCategoryLabel =
    mode === 'nine_club'
      ? NINE_CLUB_CATEGORIES.find((c) => c.key === category)?.label
      : mode === 'watch'
        ? WATCHLIST_FILTERS.find((f) => f.key === mediaTypeFilter)?.label
        : undefined;

  const { width, height } = useWindowDimensions();
  const posterWidth = (width - PADDING * 2 - GAP * (COLS - 1)) / COLS;
  const posterHeight = posterWidth * 1.5;
  const resultWidth = (width - MODAL_PADDING * 2 - GAP * (COLS - 1)) / COLS;
  const resultHeight = resultWidth * 1.5;
  const posterDetailWidth = width * 0.52;

  const [items, setItems] = useState<CinemaItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [addedKeys, setAddedKeys] = useState<Set<string>>(new Set());

  const [actionItem, setActionItem] = useState<CinemaItem | null>(null);

  const [detailItem, setDetailItem] = useState<CinemaItem | null>(null);
  const [detailData, setDetailData] = useState<DetailData | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = useCallback(async () => {
    let q = supabase
      .from('cinema_items')
      .select('id, tmdb_id, media_type, title, year, poster_path');
    let orderCol: string;
    if (mode === 'nine_club') {
      q = q.eq('nine_club_category', category);
      orderCol = 'nine_club_added_at';
    } else {
      q = q.eq('status', status!);
      q = q.eq('media_type', mediaTypeFilter);
      orderCol = status === 'watched' ? 'watched_at' : 'added_at';
    }
    const { data } = await q.order(orderCol, { ascending: false });
    if (data) setItems(data as CinemaItem[]);
    setLoading(false);
  }, [mode, status, mediaTypeFilter, category]);

  useEffect(() => {
    load();
  }, [load]);

  const existingKeys = useMemo(
    () => new Set(items.map((i) => resultKey(i.tmdb_id, i.media_type))),
    [items],
  );

  // Debounced TMDB search
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
        const { data, error } = await supabase.functions.invoke('tmdb-search', {
          body: { query: trimmed, mediaType: searchMediaType },
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
  }, [query, searchOpen, searchMediaType]);

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
      tmdb_id: result.tmdb_id,
      media_type: result.media_type,
      title: result.title,
      year: result.year,
      poster_path: result.poster_path,
    };
    if (mode === 'nine_club') {
      payload.nine_club_category = category;
      payload.nine_club_added_at = now;
    } else {
      payload.status = status;
      payload.added_at = now;
      payload.watched_at = status === 'watched' ? now : null;
    }
    const { error } = await supabase.from('cinema_items').upsert(payload, { onConflict: 'tmdb_id,media_type' });
    if (!error) {
      setAddedKeys((prev) => new Set(prev).add(resultKey(result.tmdb_id, result.media_type)));
      load();
    }
  };

  const markWatched = async (item: CinemaItem) => {
    await supabase
      .from('cinema_items')
      .update({ status: 'watched', watched_at: new Date().toISOString() })
      .eq('id', item.id);
    setActionItem(null);
    load();
  };

  const moveToWatchlist = async (item: CinemaItem) => {
    await supabase
      .from('cinema_items')
      .update({ status: 'to_watch', watched_at: null })
      .eq('id', item.id);
    setActionItem(null);
    load();
  };

  const removeItem = async (item: CinemaItem) => {
    await supabase.from('cinema_items').delete().eq('id', item.id);
    setActionItem(null);
    load();
  };

  const openDetail = useCallback(async (item: CinemaItem) => {
    setDetailItem(item);
    setDetailData(null);
    setDetailLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('tmdb-details', {
        body: { tmdb_id: item.tmdb_id, media_type: item.media_type },
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

  const removeFromNineClub = async (item: CinemaItem) => {
    await supabase
      .from('cinema_items')
      .update({ nine_club_category: null, nine_club_added_at: null })
      .eq('id', item.id);
    setActionItem(null);
    load();
  };

  const renderItem = ({ item }: { item: CinemaItem }) => (
    <Pressable
      style={[styles.posterWrap, { width: posterWidth }]}
      onPress={() => openDetail(item)}
      onLongPress={() => setActionItem(item)}
      delayLongPress={350}
    >
      {item.poster_path ? (
        <Image
          source={{ uri: posterUri(item.poster_path)! }}
          style={[styles.poster, { width: posterWidth, height: posterHeight }]}
          contentFit="cover"
        />
      ) : (
        <View style={[styles.poster, styles.posterFallback, { width: posterWidth, height: posterHeight }]}>
          <Text style={styles.fallbackEmoji}>{item.media_type === 'tv' ? '📺' : '🎬'}</Text>
        </View>
      )}
    </Pressable>
  );

  const renderResult = ({ item }: { item: SearchResult }) => {
    const added = existingKeys.has(resultKey(item.tmdb_id, item.media_type)) ||
      addedKeys.has(resultKey(item.tmdb_id, item.media_type));
    return (
      <Pressable style={[styles.resultWrap, { width: resultWidth }]} onPress={() => addResult(item)}>
        <View>
          {item.poster_path ? (
            <Image
              source={{ uri: posterUri(item.poster_path)! }}
              style={[styles.resultPoster, { width: resultWidth, height: resultHeight }]}
              contentFit="cover"
            />
          ) : (
            <View style={[styles.resultPoster, styles.posterFallback, { width: resultWidth, height: resultHeight }]}>
              <Text style={styles.fallbackEmoji}>{item.media_type === 'tv' ? '📺' : '🎬'}</Text>
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
        <Pressable
          onPress={openSearch}
          style={({ pressed }) => [styles.addBtn, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Text style={styles.addBtnText}>+ Add</Text>
        </Pressable>
      </View>

      {mode === 'nine_club' && (
        <FilterRow options={NINE_CLUB_CATEGORIES} active={category} onSelect={setCategory} />
      )}
      {mode === 'watch' && (
        <FilterRow options={WATCHLIST_FILTERS} active={mediaTypeFilter} onSelect={setMediaTypeFilter} />
      )}

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={C.accent} /></View>
      ) : items.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>Nothing here yet</Text>
          <Pressable
            onPress={openSearch}
            style={({ pressed }) => [styles.emptyBtn, { opacity: pressed ? 0.6 : 1 }]}
          >
            <Text style={styles.emptyBtnText}>Search TMDB</Text>
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
              <Text style={styles.modalTitle}>
                Add to {title}{modalCategoryLabel ? `: ${modalCategoryLabel}` : ''}
              </Text>
              <Pressable onPress={() => setSearchOpen(false)} hitSlop={8}>
                <Text style={styles.doneText}>Done</Text>
              </Pressable>
            </View>
            <TextInput
              style={styles.modalInput}
              value={query}
              onChangeText={setQuery}
              placeholder="Search movies & TV shows"
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
                keyExtractor={(item) => resultKey(item.tmdb_id, item.media_type)}
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

      {/* Poster detail modal */}
      <Modal
        visible={!!detailItem}
        animationType="fade"
        transparent
        presentationStyle="overFullScreen"
        onRequestClose={closeDetail}
      >
        <View style={styles.detailOverlay}>
          {detailItem?.poster_path && (
            <Image
              source={{ uri: `${POSTER_BASE_LG}${detailItem.poster_path}` }}
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
            {detailItem?.poster_path ? (
              <Image
                source={{ uri: `${POSTER_BASE_LG}${detailItem.poster_path}` }}
                style={[styles.detailPoster, { width: posterDetailWidth, height: posterDetailWidth * 1.5 }]}
                contentFit="cover"
              />
            ) : (
              <View style={[styles.detailPoster, styles.detailPosterFallback, { width: posterDetailWidth, height: posterDetailWidth * 1.5 }]}>
                <Text style={{ fontSize: 48 }}>{detailItem?.media_type === 'tv' ? '📺' : '🎬'}</Text>
              </View>
            )}
            <Text style={styles.detailTitle}>{detailItem?.title}</Text>
            <Text style={styles.detailMetaText}>
              {[detailItem?.year, detailItem?.media_type === 'tv' ? 'Series' : 'Film'].filter(Boolean).join(' · ')}
            </Text>
            {detailLoading ? (
              <ActivityIndicator color="rgba(255,255,255,0.35)" style={{ marginTop: 20 }} />
            ) : detailData ? (
              <>
                {detailData.overview ? (
                  <Text style={styles.detailOverview}>{detailData.overview}</Text>
                ) : null}
                <View style={styles.detailFields}>
                  {detailItem?.media_type === 'movie' && detailData.director ? (
                    <DetailRow label="Director" value={detailData.director} />
                  ) : null}
                  {detailItem?.media_type === 'tv' && detailData.created_by ? (
                    <DetailRow label="Created by" value={detailData.created_by} />
                  ) : null}
                  {detailData.studio ? (
                    <DetailRow label={detailItem?.media_type === 'tv' ? 'Network' : 'Studio'} value={detailData.studio} />
                  ) : null}
                  {detailData.composer ? (
                    <DetailRow label="Score" value={detailData.composer} />
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
            {mode === 'nine_club' ? (
              <Pressable
                style={({ pressed }) => [styles.actionBtn, pressed && styles.actionBtnPressed]}
                onPress={() => actionItem && removeFromNineClub(actionItem)}
              >
                <Text style={styles.actionBtnText}>Remove from 9-Club</Text>
              </Pressable>
            ) : status === 'to_watch' ? (
              <Pressable
                style={({ pressed }) => [styles.actionBtn, pressed && styles.actionBtnPressed]}
                onPress={() => actionItem && markWatched(actionItem)}
              >
                <Text style={styles.actionBtnText}>Mark as watched</Text>
              </Pressable>
            ) : (
              <Pressable
                style={({ pressed }) => [styles.actionBtn, pressed && styles.actionBtnPressed]}
                onPress={() => actionItem && moveToWatchlist(actionItem)}
              >
                <Text style={styles.actionBtnText}>Move to Watchlist</Text>
              </Pressable>
            )}
            {mode === 'watch' && (
              <Pressable
                style={({ pressed }) => [styles.actionBtn, pressed && styles.actionBtnPressed]}
                onPress={() => actionItem && removeItem(actionItem)}
              >
                <Text style={[styles.actionBtnText, styles.actionBtnDanger]}>Remove</Text>
              </Pressable>
            )}
            <Pressable
              style={({ pressed }) => [styles.actionBtn, pressed && styles.actionBtnPressed]}
              onPress={() => setActionItem(null)}
            >
              <Text style={styles.actionBtnText}>Cancel</Text>
            </Pressable>
          </Pressable>
        </Pressable>
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
});
