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
import DraggableFlatList, { RenderItemParams, ScaleDecorator } from 'react-native-draggable-flatlist';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { useSectionEdgeScroll, type EdgesChangeHandler } from '@/hooks/use-section-edge-scroll';
import { supabase } from '@/lib/supabase';

const C = {
  text: '#1A1626',
  muted: 'rgba(26,22,38,0.45)',
  accent: '#B45309',
  danger: '#DC2626',
} as const;

const COLS = 3;
const PADDING = 16;
const GAP = 6;
const MODAL_PADDING = 28;
const SEARCH_DEBOUNCE_MS = 400;

type LibraryCategory = 'fiction' | 'non_fiction' | 'graphic_novel';

interface LibraryItem {
  id: string;
  title: string;
  author: string | null;
  year: string | null;
  cover_url: string | null;
  category: LibraryCategory;
  sort_order: number | null;
}

interface SearchResult {
  key: string;
  title: string;
  author: string | null;
  year: string | null;
  cover_url: string | null;
  publisher: string | null;
}

export type LibraryBookPageProps =
  | { title: string; mode: 'read'; status: 'to_read' | 'read' }
  | { title: string; mode: 'favorites' };

type Props = LibraryBookPageProps & { onEdgesChange?: EdgesChangeHandler };

const CATEGORIES: { key: LibraryCategory; label: string }[] = [
  { key: 'fiction', label: 'Fiction' },
  { key: 'non_fiction', label: 'Non-fiction' },
  { key: 'graphic_novel', label: 'Graphic Novel' },
];

const matchKey = (title: string, author: string | null) =>
  `${title.trim().toLowerCase()}|${(author ?? '').trim().toLowerCase()}`;

const coverUri = (coverUrl: string | null, size: 'M' | 'L' = 'M') => {
  if (!coverUrl || size !== 'L') return coverUrl;
  if (coverUrl.includes('zoom=1')) return coverUrl.replace('zoom=1', 'zoom=3');
  if (coverUrl.endsWith('-M.jpg')) return coverUrl.replace(/-M\.jpg$/, '-L.jpg');
  return coverUrl;
};

const isPenguinEdition = (publisher: string | null) => !!publisher && /penguin/i.test(publisher);

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

export default function LibraryBookPage(props: Props) {
  const { title, mode, onEdgesChange } = props;
  const edgeScroll = useSectionEdgeScroll(onEdgesChange);
  const status = mode === 'read' ? props.status : undefined;
  const [category, setCategory] = useState<LibraryCategory>('fiction');

  const { width, height } = useWindowDimensions();
  const coverWidth = (width - PADDING * 2 - GAP * (COLS - 1)) / COLS;
  const coverHeight = coverWidth * 1.5;
  const resultWidth = (width - MODAL_PADDING * 2 - GAP * (COLS - 1)) / COLS;
  const resultHeight = resultWidth * 1.5;
  const coverDetailWidth = width * 0.52;

  const [items, setItems] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [addedKeys, setAddedKeys] = useState<Set<string>>(new Set());

  const [actionItem, setActionItem] = useState<LibraryItem | null>(null);

  const [coverItem, setCoverItem] = useState<LibraryItem | null>(null);
  const [coverQuery, setCoverQuery] = useState('');
  const [coverSearching, setCoverSearching] = useState(false);
  const [coverError, setCoverError] = useState<string | null>(null);
  const [coverResults, setCoverResults] = useState<SearchResult[]>([]);

  const [detailItem, setDetailItem] = useState<LibraryItem | null>(null);

  const [reorderOpen, setReorderOpen] = useState(false);

  const load = useCallback(async () => {
    let q = supabase
      .from('library_items')
      .select('id, title, author, year, cover_url, category, sort_order')
      .eq('category', category);
    q = mode === 'favorites' ? q.eq('favorite', true) : q.eq('status', status!);
    const { data } = await q.order('sort_order', { ascending: true, nullsFirst: false });
    if (data) setItems(data as LibraryItem[]);
    setLoading(false);
  }, [mode, status, category]);

  useEffect(() => {
    load();
  }, [load]);

  const existingKeys = useMemo(
    () => new Set(items.map((i) => matchKey(i.title, i.author))),
    [items],
  );

  // Debounced Google Books search
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
        const { data, error } = await supabase.functions.invoke('books-search', {
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

  const openCoverPicker = (item: LibraryItem) => {
    setActionItem(null);
    setCoverResults([]);
    setCoverError(null);
    setCoverItem(item);
    setCoverQuery([item.title, item.author].filter(Boolean).join(' '));
  };

  const closeCoverPicker = () => {
    setCoverItem(null);
    setCoverQuery('');
    setCoverResults([]);
    setCoverError(null);
  };

  // Debounced cover search, scoped to the item being edited
  useEffect(() => {
    if (!coverItem) return;
    const trimmed = coverQuery.trim();
    if (!trimmed) {
      setCoverResults([]);
      setCoverError(null);
      setCoverSearching(false);
      return;
    }
    setCoverSearching(true);
    const timeout = setTimeout(async () => {
      try {
        const { data, error } = await supabase.functions.invoke('books-search', {
          body: { query: trimmed },
        });
        if (error) throw new Error(error.message);
        if (data?.error) throw new Error(data.error);
        setCoverResults(((data?.results ?? []) as SearchResult[]).filter((r) => r.cover_url));
        setCoverError(null);
      } catch (err) {
        setCoverError(err instanceof Error ? err.message : String(err));
        setCoverResults([]);
      } finally {
        setCoverSearching(false);
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [coverQuery, coverItem]);

  const selectCover = async (result: SearchResult) => {
    if (!coverItem || !result.cover_url) return;
    const { error } = await supabase
      .from('library_items')
      .update({ cover_url: result.cover_url })
      .eq('id', coverItem.id);
    if (!error) {
      closeCoverPicker();
      load();
    }
  };

  const addResult = async (result: SearchResult) => {
    const now = new Date().toISOString();
    const payload: Record<string, unknown> = {
      title: result.title,
      author: result.author,
      year: result.year,
      cover_url: result.cover_url,
      category,
      sort_order: items.length,
    };
    if (mode === 'favorites') {
      payload.favorite = true;
      payload.favorite_added_at = now;
    } else {
      payload.status = status;
      payload.read_at = status === 'read' ? now : null;
    }
    const { error } = await supabase.from('library_items').insert(payload);
    if (!error) {
      setAddedKeys((prev) => new Set(prev).add(result.key));
      load();
    }
  };

  const markRead = async (item: LibraryItem) => {
    await supabase
      .from('library_items')
      .update({ status: 'read', read_at: new Date().toISOString() })
      .eq('id', item.id);
    setActionItem(null);
    load();
  };

  const moveToReadList = async (item: LibraryItem) => {
    await supabase
      .from('library_items')
      .update({ status: 'to_read', read_at: null })
      .eq('id', item.id);
    setActionItem(null);
    load();
  };

  const removeItem = async (item: LibraryItem) => {
    await supabase.from('library_items').delete().eq('id', item.id);
    setActionItem(null);
    load();
  };

  const removeFromFavorites = async (item: LibraryItem) => {
    await supabase
      .from('library_items')
      .update({ favorite: false, favorite_added_at: null })
      .eq('id', item.id);
    setActionItem(null);
    load();
  };

  const openDetail = useCallback((item: LibraryItem) => {
    setDetailItem(item);
  }, []);

  const closeDetail = useCallback(() => {
    setDetailItem(null);
  }, []);

  const openReorder = useCallback(() => setReorderOpen(true), []);
  const closeReorder = useCallback(() => setReorderOpen(false), []);

  const onReorderDragEnd = useCallback(async ({ data }: { data: LibraryItem[] }) => {
    setItems(data);
    await Promise.all(
      data.map((item, index) =>
        supabase.from('library_items').update({ sort_order: index }).eq('id', item.id),
      ),
    );
  }, []);

  const renderReorderItem = useCallback(
    ({ item, drag, isActive }: RenderItemParams<LibraryItem>) => (
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
            <View style={[styles.reorderThumb, styles.coverFallback]}>
              <Text style={{ fontSize: 14 }}>📖</Text>
            </View>
          )}
          <Text style={styles.reorderTitle} numberOfLines={1}>{item.title}</Text>
          <Text style={styles.dragHandleText}>⠿</Text>
        </Pressable>
      </ScaleDecorator>
    ),
    [],
  );

  const renderItem = ({ item }: { item: LibraryItem }) => (
    <Pressable
      style={[styles.coverWrap, { width: coverWidth }]}
      onPress={() => openDetail(item)}
      onLongPress={() => setActionItem(item)}
      delayLongPress={350}
    >
      {item.cover_url ? (
        <Image
          source={{ uri: coverUri(item.cover_url)! }}
          style={[styles.cover, { width: coverWidth, height: coverHeight }]}
          contentFit="cover"
        />
      ) : (
        <View style={[styles.cover, styles.coverFallback, { width: coverWidth, height: coverHeight }]}>
          <Text style={styles.fallbackEmoji}>📖</Text>
        </View>
      )}
    </Pressable>
  );

  const renderResult = ({ item }: { item: SearchResult }) => {
    const added = existingKeys.has(matchKey(item.title, item.author)) || addedKeys.has(item.key);
    return (
      <Pressable style={[styles.resultWrap, { width: resultWidth }]} onPress={() => addResult(item)}>
        <View>
          {item.cover_url ? (
            <Image
              source={{ uri: coverUri(item.cover_url)! }}
              style={[styles.resultCover, { width: resultWidth, height: resultHeight }]}
              contentFit="cover"
            />
          ) : (
            <View style={[styles.resultCover, styles.coverFallback, { width: resultWidth, height: resultHeight }]}>
              <Text style={styles.fallbackEmoji}>📖</Text>
            </View>
          )}
          {added && (
            <View style={styles.addedBadge}>
              <Text style={styles.addedBadgeText}>✓</Text>
            </View>
          )}
        </View>
        <Text style={styles.resultTitle} numberOfLines={2}>{item.title}</Text>
        {item.author ? <Text style={styles.resultYear} numberOfLines={1}>{item.author}</Text> : null}
        {item.publisher ? (
          <Text
            style={[styles.resultPublisher, isPenguinEdition(item.publisher) && styles.resultPublisherPenguin]}
            numberOfLines={1}
          >
            {item.publisher}
          </Text>
        ) : null}
      </Pressable>
    );
  };

  const renderCoverResult = ({ item }: { item: SearchResult }) => {
    const current = coverItem?.cover_url === item.cover_url;
    return (
      <Pressable style={[styles.resultWrap, { width: resultWidth }]} onPress={() => selectCover(item)}>
        <View>
          <Image
            source={{ uri: coverUri(item.cover_url)! }}
            style={[styles.resultCover, { width: resultWidth, height: resultHeight }]}
            contentFit="cover"
          />
          {current && (
            <View style={styles.addedBadge}>
              <Text style={styles.addedBadgeText}>✓</Text>
            </View>
          )}
        </View>
        {item.publisher ? (
          <Text
            style={[styles.resultPublisher, isPenguinEdition(item.publisher) && styles.resultPublisherPenguin]}
            numberOfLines={1}
          >
            {item.publisher}
          </Text>
        ) : null}
        {item.year ? <Text style={styles.resultYear} numberOfLines={1}>{item.year}</Text> : null}
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

      <FilterRow options={CATEGORIES} active={category} onSelect={setCategory} />

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={C.accent} /></View>
      ) : items.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>Nothing here yet</Text>
          <Pressable
            onPress={openSearch}
            style={({ pressed }) => [styles.emptyBtn, { opacity: pressed ? 0.6 : 1 }]}
          >
            <Text style={styles.emptyBtnText}>Search books</Text>
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
                Add to {title}: {CATEGORIES.find((c) => c.key === category)?.label}
              </Text>
              <Pressable onPress={() => setSearchOpen(false)} hitSlop={8}>
                <Text style={styles.doneText}>Done</Text>
              </Pressable>
            </View>
            <TextInput
              style={styles.modalInput}
              value={query}
              onChangeText={setQuery}
              placeholder="Search books"
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
                keyExtractor={(item) => item.key}
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

      <Modal
        visible={!!coverItem}
        animationType="slide"
        transparent
        presentationStyle="overFullScreen"
        onRequestClose={closeCoverPicker}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={[styles.modalCard, { maxHeight: height * 0.85 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle} numberOfLines={1}>
                Change cover: {coverItem?.title}
              </Text>
              <Pressable onPress={closeCoverPicker} hitSlop={8}>
                <Text style={styles.doneText}>Done</Text>
              </Pressable>
            </View>
            <TextInput
              style={styles.modalInput}
              value={coverQuery}
              onChangeText={setCoverQuery}
              placeholder="Search covers"
              placeholderTextColor={C.muted}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
            />
            {coverError ? <Text style={styles.errorText}>{coverError}</Text> : null}
            {coverSearching ? (
              <ActivityIndicator color={C.accent} style={styles.searchSpinner} />
            ) : (
              <FlatList
                style={styles.resultsList}
                data={coverResults}
                keyExtractor={(item) => item.key}
                renderItem={renderCoverResult}
                numColumns={COLS}
                columnWrapperStyle={{ gap: GAP }}
                contentContainerStyle={styles.resultsGrid}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                ListEmptyComponent={
                  coverQuery.trim() ? <Text style={styles.emptyText}>No covers found</Text> : null
                }
              />
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Book detail modal */}
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
              source={{ uri: coverUri(detailItem.cover_url, 'L')! }}
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
                source={{ uri: coverUri(detailItem.cover_url, 'L')! }}
                style={[styles.detailCover, { width: coverDetailWidth, height: coverDetailWidth * 1.5 }]}
                contentFit="cover"
              />
            ) : (
              <View style={[styles.detailCover, styles.detailCoverFallback, { width: coverDetailWidth, height: coverDetailWidth * 1.5 }]}>
                <Text style={{ fontSize: 48 }}>📖</Text>
              </View>
            )}
            <Text style={styles.detailTitle}>{detailItem?.title}</Text>
            <Text style={styles.detailMetaText}>
              {[detailItem?.author, detailItem?.year].filter(Boolean).join(' · ')}
            </Text>
            <View style={styles.detailFields}>
              <DetailRow label="Category" value={CATEGORIES.find((c) => c.key === detailItem?.category)?.label ?? ''} />
            </View>
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
            <Pressable
              style={({ pressed }) => [styles.actionBtn, pressed && styles.actionBtnPressed]}
              onPress={() => actionItem && openCoverPicker(actionItem)}
            >
              <Text style={styles.actionBtnText}>Change cover</Text>
            </Pressable>
            {mode === 'favorites' ? (
              <Pressable
                style={({ pressed }) => [styles.actionBtn, pressed && styles.actionBtnPressed]}
                onPress={() => actionItem && removeFromFavorites(actionItem)}
              >
                <Text style={styles.actionBtnText}>Remove from 9-Club</Text>
              </Pressable>
            ) : status === 'to_read' ? (
              <Pressable
                style={({ pressed }) => [styles.actionBtn, pressed && styles.actionBtnPressed]}
                onPress={() => actionItem && markRead(actionItem)}
              >
                <Text style={styles.actionBtnText}>Mark as read</Text>
              </Pressable>
            ) : (
              <Pressable
                style={({ pressed }) => [styles.actionBtn, pressed && styles.actionBtnPressed]}
                onPress={() => actionItem && moveToReadList(actionItem)}
              >
                <Text style={styles.actionBtnText}>Move to To Read</Text>
              </Pressable>
            )}
            {mode === 'read' && (
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

      <Modal visible={reorderOpen} animationType="slide" transparent onRequestClose={closeReorder}>
        <GestureHandlerRootView style={styles.reorderBackdrop}>
          <View style={styles.reorderSheet}>
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
  coverWrap: { marginBottom: GAP },
  cover: { borderRadius: 6, backgroundColor: 'rgba(26,22,38,0.08)' },
  coverFallback: { alignItems: 'center', justifyContent: 'center' },
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
  resultCover: { borderRadius: 6, backgroundColor: 'rgba(26,22,38,0.08)' },
  resultTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: C.text,
    marginTop: 6,
    lineHeight: 15,
  },
  resultYear: { fontSize: 11, color: C.muted, marginTop: 2 },
  resultPublisher: { fontSize: 10, color: C.muted, marginTop: 2 },
  resultPublisherPenguin: { color: C.accent, fontWeight: '700' },
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
  detailCover: {
    borderRadius: 10,
    marginBottom: 22,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.7,
    shadowRadius: 24,
    elevation: 14,
  },
  detailCoverFallback: {
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
    paddingBottom: 24,
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
