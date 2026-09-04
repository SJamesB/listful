import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';

import DeadheadShowDetailModal from '@/components/DeadheadShowDetailModal';
import { Text } from '@/components/Text';
import { TextInput } from '@/components/TextInput';
import { useSectionEdgeScroll, type EdgesChangeHandler } from '@/hooks/use-section-edge-scroll';
import { fetchAllRows, supabase } from '@/lib/supabase';

const C = {
  text: '#1A1626',
  muted: 'rgba(26,22,38,0.45)',
  accent: '#2563EB',
  danger: '#DC2626',
} as const;

const PADDING = 16;

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

function formatLocation(show: Pick<DeadShow, 'venue' | 'city' | 'state' | 'country'>): string {
  const place = [show.city, show.state].filter(Boolean).join(', ');
  if (show.venue && place) return `${show.venue} — ${place}`;
  return show.venue || place || show.country || 'Unknown location';
}

function matchesQuery(show: DeadShow, q: string): boolean {
  const [y, m, d] = show.date.split('-');
  const haystack = [
    show.venue, show.city, show.state, show.country,
    formatDate(show.date), show.date, `${m}/${d}/${y}`, `${m}/${d}/${y.slice(2)}`, y,
  ].filter(Boolean).join(' ').toLowerCase();
  return haystack.includes(q);
}

interface DeadShow {
  show_id: string;
  date: string;
  venue: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  listened: boolean;
  listened_at: string | null;
  favourite: boolean;
}

export interface DeadheadShowsPageProps {
  onEdgesChange?: EdgesChangeHandler;
  onSongPress?: (title: string, showId: string) => void;
}

export interface DeadheadShowsPageHandle {
  openShow: (showId: string) => void;
}

const DeadheadShowsPage = forwardRef<DeadheadShowsPageHandle, DeadheadShowsPageProps>(
  function DeadheadShowsPage({ onEdgesChange, onSongPress }, ref) {
  const edgeScroll = useSectionEdgeScroll(onEdgesChange);

  const [items, setItems] = useState<DeadShow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [onlyListened, setOnlyListened] = useState(false);
  const [onlyFavourite, setOnlyFavourite] = useState(false);

  const [detailShowId, setDetailShowId] = useState<string | null>(null);

  useEffect(() => {
    fetchAllRows<DeadShow>((from, to) =>
      supabase
        .from('dead_shows')
        .select('show_id, date, venue, city, state, country, listened, listened_at, favourite')
        .order('date', { ascending: true })
        .range(from, to),
    ).then((data) => {
      setItems(data);
      setLoading(false);
    });
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const result = items.filter((item) => {
      if (onlyListened && !item.listened) return false;
      if (onlyFavourite && !item.favourite) return false;
      if (q && !matchesQuery(item, q)) return false;
      return true;
    });
    if (onlyListened) {
      result.sort((a, b) => {
        if (!a.listened_at && !b.listened_at) return 0;
        if (!a.listened_at) return 1;
        if (!b.listened_at) return -1;
        return b.listened_at.localeCompare(a.listened_at);
      });
    }
    return result;
  }, [items, query, onlyListened, onlyFavourite]);

  const openDetail = useCallback((item: DeadShow) => {
    setDetailShowId(item.show_id);
  }, []);

  const closeDetail = useCallback(() => {
    setDetailShowId(null);
  }, []);

  useImperativeHandle(ref, () => ({
    openShow: (showId: string) => setDetailShowId(showId),
  }), []);

  const handleDetailChange = useCallback((showId: string, patch: Partial<Pick<DeadShow, 'listened' | 'listened_at' | 'favourite'>>) => {
    setItems((prev) => prev.map((i) => (i.show_id === showId ? { ...i, ...patch } : i)));
  }, []);

  const swipeToOffset = useCallback((offset: number) => {
    setDetailShowId((current) => {
      if (!current) return current;
      const idx = filtered.findIndex((i) => i.show_id === current);
      const nextIdx = idx + offset;
      if (idx === -1 || nextIdx < 0 || nextIdx >= filtered.length) return current;
      return filtered[nextIdx].show_id;
    });
  }, [filtered]);

  const swipeToNext = useCallback(() => swipeToOffset(1), [swipeToOffset]);
  const swipeToPrev = useCallback(() => swipeToOffset(-1), [swipeToOffset]);

  const detailIndex = useMemo(
    () => filtered.findIndex((i) => i.show_id === detailShowId),
    [filtered, detailShowId],
  );
  const canSwipePrev = detailIndex > 0;
  const canSwipeNext = detailIndex !== -1 && detailIndex < filtered.length - 1;

  const renderItem = ({ item }: { item: DeadShow }) => (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      onPress={() => openDetail(item)}
    >
      <View style={styles.rowText}>
        <Text style={styles.rowDate}>{formatDate(item.date)}</Text>
        <Text style={styles.rowLocation} numberOfLines={1}>{formatLocation(item)}</Text>
      </View>
      <View style={styles.rowBadges}>
        {item.favourite ? <Text style={styles.badgeText}>★</Text> : null}
        {item.listened ? <Text style={[styles.badgeText, { color: C.accent }]}>✓</Text> : null}
      </View>
    </Pressable>
  );

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.title}>🌹 Shows</Text>
      </View>

      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="Search by date or location"
          placeholderTextColor={C.muted}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
        />
      </View>

      <View style={styles.filterRow}>
        <Pressable
          onPress={() => setOnlyFavourite((v) => !v)}
          style={[styles.filterChip, onlyFavourite && styles.filterChipActiveDanger]}
        >
          <Text style={[styles.filterChipText, onlyFavourite && styles.filterChipTextActive]}>★ Favourites</Text>
        </Pressable>
        <Pressable
          onPress={() => setOnlyListened((v) => !v)}
          style={[styles.filterChip, onlyListened && styles.filterChipActive]}
        >
          <Text style={[styles.filterChipText, onlyListened && styles.filterChipTextActive]}>✓ Listened</Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={C.accent} /></View>
      ) : filtered.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>No shows match</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.show_id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          {...edgeScroll}
        />
      )}

      <DeadheadShowDetailModal
        showId={detailShowId}
        onClose={closeDetail}
        onChange={handleDetailChange}
        onSongPress={onSongPress}
        onSwipeNext={swipeToNext}
        onSwipePrev={swipeToPrev}
        canSwipeNext={canSwipeNext}
        canSwipePrev={canSwipePrev}
      />
    </View>
  );
  },
);

export default DeadheadShowsPage;

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
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
  searchRow: {
    paddingHorizontal: PADDING,
    marginBottom: 10,
  },
  searchInput: {
    fontSize: 15,
    color: C.text,
    backgroundColor: 'rgba(26,22,38,0.06)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    outlineStyle: 'none',
  } as any,
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
  filterChipActiveDanger: {
    backgroundColor: C.danger,
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: C.muted,
  },
  filterChipTextActive: {
    color: '#fff',
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, paddingHorizontal: 40 },
  emptyText: { fontSize: 14, color: C.muted, textAlign: 'center', lineHeight: 20 },
  list: { paddingHorizontal: PADDING, paddingBottom: 64 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(26,22,38,0.08)',
  },
  rowPressed: { opacity: 0.6 },
  rowText: { flex: 1, gap: 2, paddingRight: 8 },
  rowDate: { fontSize: 15, fontWeight: '600', color: C.text },
  rowLocation: { fontSize: 13, color: C.muted },
  rowBadges: { flexDirection: 'row', gap: 8 },
  badgeText: { fontSize: 14, color: C.danger },
});
