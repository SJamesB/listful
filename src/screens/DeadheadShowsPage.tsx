import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useSectionEdgeScroll, type EdgesChangeHandler } from '@/hooks/use-section-edge-scroll';
import { supabase } from '@/lib/supabase';

const C = {
  text: '#1A1626',
  muted: 'rgba(26,22,38,0.45)',
  accent: '#D97706',
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
  favourite: boolean;
}

interface DeadShowDetail {
  lineup_era: string | null;
  lineup_members: string | null;
}

interface DeadTrack {
  id: number;
  track_number: number | null;
  title: string;
  length_display: string | null;
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

export default function DeadheadShowsPage({ onEdgesChange }: { onEdgesChange?: EdgesChangeHandler }) {
  const edgeScroll = useSectionEdgeScroll(onEdgesChange);

  const [items, setItems] = useState<DeadShow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [onlyListened, setOnlyListened] = useState(false);
  const [onlyFavourite, setOnlyFavourite] = useState(false);

  const [detailItem, setDetailItem] = useState<DeadShow | null>(null);
  const [detailInfo, setDetailInfo] = useState<DeadShowDetail | null>(null);
  const [tracks, setTracks] = useState<DeadTrack[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    supabase
      .from('dead_shows')
      .select('show_id, date, venue, city, state, country, listened, favourite')
      .order('date', { ascending: true })
      .then(({ data }) => {
        if (data) setItems(data as DeadShow[]);
        setLoading(false);
      });
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((item) => {
      if (onlyListened && !item.listened) return false;
      if (onlyFavourite && !item.favourite) return false;
      if (q && !matchesQuery(item, q)) return false;
      return true;
    });
  }, [items, query, onlyListened, onlyFavourite]);

  const openDetail = useCallback(async (item: DeadShow) => {
    setDetailItem(item);
    setDetailInfo(null);
    setTracks([]);
    setDetailLoading(true);
    try {
      const [{ data: showData }, { data: trackData }] = await Promise.all([
        supabase.from('dead_shows').select('lineup_era, lineup_members').eq('show_id', item.show_id).single(),
        supabase.from('dead_tracks').select('id, track_number, title, length_display').eq('show_id', item.show_id).order('track_number', { ascending: true }),
      ]);
      if (showData) setDetailInfo(showData as DeadShowDetail);
      if (trackData) setTracks(trackData as DeadTrack[]);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const closeDetail = useCallback(() => {
    setDetailItem(null);
    setDetailInfo(null);
    setTracks([]);
  }, []);

  const toggleListened = async (item: DeadShow, listened: boolean) => {
    await supabase.from('dead_shows').update({ listened }).eq('show_id', item.show_id);
    setItems((prev) => prev.map((i) => (i.show_id === item.show_id ? { ...i, listened } : i)));
    setDetailItem((prev) => (prev ? { ...prev, listened } : prev));
  };

  const toggleFavourite = async (item: DeadShow, favourite: boolean) => {
    await supabase.from('dead_shows').update({ favourite }).eq('show_id', item.show_id);
    setItems((prev) => prev.map((i) => (i.show_id === item.show_id ? { ...i, favourite } : i)));
    setDetailItem((prev) => (prev ? { ...prev, favourite } : prev));
  };

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
          style={[styles.filterChip, onlyFavourite && styles.filterChipActive]}
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

      <Modal
        visible={!!detailItem}
        animationType="fade"
        transparent
        presentationStyle="overFullScreen"
        onRequestClose={closeDetail}
      >
        <View style={styles.detailOverlay}>
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
            <Text style={styles.detailTitle}>{detailItem ? formatDate(detailItem.date) : ''}</Text>
            <Text style={styles.detailMetaText}>{detailItem ? formatLocation(detailItem) : ''}</Text>

            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>Listened</Text>
              <Switch
                value={!!detailItem?.listened}
                onValueChange={(v) => { if (detailItem) toggleListened(detailItem, v); }}
                trackColor={{ true: C.accent }}
              />
            </View>
            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>Favourite</Text>
              <Switch
                value={!!detailItem?.favourite}
                onValueChange={(v) => { if (detailItem) toggleFavourite(detailItem, v); }}
                trackColor={{ true: C.accent }}
              />
            </View>

            {detailLoading ? (
              <ActivityIndicator color="rgba(255,255,255,0.35)" style={{ marginTop: 20 }} />
            ) : (
              <>
                {(detailInfo?.lineup_era || detailInfo?.lineup_members) && (
                  <View style={styles.detailFields}>
                    {detailInfo?.lineup_era ? <DetailRow label="Lineup Era" value={detailInfo.lineup_era} /> : null}
                    {detailInfo?.lineup_members ? <DetailRow label="Lineup" value={detailInfo.lineup_members} /> : null}
                  </View>
                )}

                {tracks.length > 0 && (
                  <View style={styles.tracklist}>
                    <Text style={styles.tracklistHeading}>Tracklist</Text>
                    {tracks.map((track, i) => (
                      <View key={track.id} style={styles.trackRow}>
                        <Text style={styles.trackNumber}>{track.track_number ?? i + 1}</Text>
                        <Text style={styles.trackTitle} numberOfLines={2}>{track.title}</Text>
                        <Text style={styles.trackLength}>{track.length_display ?? ''}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </>
            )}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

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
  badgeText: { fontSize: 14, color: '#D97706' },
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
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
    fontWeight: '500',
    textAlign: 'center',
    marginBottom: 24,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 2,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  switchLabel: {
    fontSize: 15,
    fontWeight: '500',
    color: '#fff',
  },
  detailFields: {
    marginTop: 20,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.07)',
  },
  detailRow: {
    flexDirection: 'column',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.07)',
    gap: 4,
  },
  detailLabel: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.3)',
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  detailValue: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.82)',
    fontWeight: '500',
    lineHeight: 20,
  },
  tracklist: {
    marginTop: 24,
  },
  tracklistHeading: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.3)',
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  trackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.06)',
    gap: 10,
  },
  trackNumber: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.35)',
    width: 20,
  },
  trackTitle: {
    flex: 1,
    fontSize: 14,
    color: 'rgba(255,255,255,0.85)',
  },
  trackLength: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
  },
});
