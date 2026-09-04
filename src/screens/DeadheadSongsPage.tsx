import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  View,
} from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';

import DeadheadShowDetailModal from '@/components/DeadheadShowDetailModal';
import { PageBackground } from '@/components/PageBackground';
import { Text } from '@/components/Text';
import { TextInput } from '@/components/TextInput';
import { DEADHEAD_BG } from '@/constants/sectionBackgrounds';
import { useSectionEdgeScroll, type EdgesChangeHandler } from '@/hooks/use-section-edge-scroll';
import { fetchAllRows, supabase } from '@/lib/supabase';

const C = {
  text: '#1A1626',
  muted: 'rgba(26,22,38,0.45)',
  accent: '#2563EB',
  danger: '#DC2626',
} as const;

const PADDING = 16;
const SEARCH_DEBOUNCE_MS = 300;

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

function formatLocation(show: { venue: string | null; city: string | null; state: string | null }): string {
  const place = [show.city, show.state].filter(Boolean).join(', ');
  if (show.venue && place) return `${show.venue} — ${place}`;
  return show.venue || place || '';
}

function formatSeconds(seconds: number): string {
  const total = Math.round(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

interface SongSuggestion {
  title: string;
  times_played: number;
  favourite: boolean;
}

interface TrackRow {
  length_seconds: string | null;
  length_display: string | null;
  show_id: string;
  dead_shows: { date: string; venue: string | null; city: string | null; state: string | null } | null;
}

interface SongPerformance {
  showId: string;
  date: string;
  location: string;
  seconds: number | null;
  display: string;
}

interface SongStats {
  title: string;
  timesPlayed: number;
  firstDate: string;
  firstLocation: string;
  firstShowId: string | null;
  lastDate: string;
  lastLocation: string;
  lastShowId: string | null;
  longestDisplay: string;
  longestDate: string;
  longestLocation: string;
  longestShowId: string | null;
  medianDisplay: string;
  favourite: boolean;
  performances: SongPerformance[];
}

function StatRow({ label, value, sub, onPress }: { label: string; value: string; sub?: string; onPress?: () => void }) {
  const content = (
    <>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, onPress && styles.statValueLink]}>{value}</Text>
      {sub ? <Text style={styles.statSub}>{sub}</Text> : null}
    </>
  );
  if (onPress) {
    return (
      <Pressable
        style={({ pressed }) => [styles.statRow, pressed && styles.statRowPressed]}
        onPress={onPress}
      >
        {content}
      </Pressable>
    );
  }
  return <View style={styles.statRow}>{content}</View>;
}

export interface DeadheadSongsPageHandle {
  selectSong: (title: string) => void;
}

const DeadheadSongsPage = forwardRef<DeadheadSongsPageHandle, { onEdgesChange?: EdgesChangeHandler }>(
  function DeadheadSongsPage({ onEdgesChange }, ref) {
  const edgeScroll = useSectionEdgeScroll(onEdgesChange);

  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<SongSuggestion[]>([]);
  const [searching, setSearching] = useState(false);

  const [allSongs, setAllSongs] = useState<SongSuggestion[]>([]);
  const [allSongsLoading, setAllSongsLoading] = useState(true);
  const [onlyFavourite, setOnlyFavourite] = useState(false);

  const [selected, setSelected] = useState<string | null>(null);
  const [stats, setStats] = useState<SongStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  const [detailShowId, setDetailShowId] = useState<string | null>(null);

  useEffect(() => {
    fetchAllRows<SongSuggestion>((from, to) =>
      supabase
        .from('dead_songs')
        .select('title, times_played, favourite')
        .order('times_played', { ascending: false })
        .order('title', { ascending: true })
        .range(from, to),
    ).then((data) => {
      setAllSongs(data);
      setAllSongsLoading(false);
    });
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed || selected) {
      setSuggestions([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const timeout = setTimeout(async () => {
      const { data } = await supabase
        .from('dead_songs')
        .select('title, times_played, favourite')
        .ilike('title', `%${trimmed}%`)
        .order('times_played', { ascending: false })
        .limit(20);
      setSuggestions((data ?? []) as SongSuggestion[]);
      setSearching(false);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [query, selected]);

  const selectSong = useCallback(async (title: string) => {
    setSelected(title);
    setSuggestions([]);
    setStats(null);
    setStatsLoading(true);
    try {
      const rows = await fetchAllRows<TrackRow>((from, to) =>
        supabase
          .from('dead_tracks')
          .select('length_seconds, length_display, show_id, dead_shows(date, venue, city, state)')
          .contains('song_titles_lower', [title.toLowerCase()])
          .order('id', { ascending: true })
          .range(from, to) as unknown as PromiseLike<{ data: TrackRow[] | null }>,
      );
      if (rows.length === 0) {
        setStats(null);
        return;
      }
      const withShow = rows.filter((r) => r.dead_shows);
      const byDateAsc = [...withShow].sort((a, b) => a.dead_shows!.date.localeCompare(b.dead_shows!.date));
      const first = byDateAsc[0];
      const last = byDateAsc[byDateAsc.length - 1];

      const withLength = rows
        .filter((r) => r.length_seconds != null)
        .map((r) => ({ ...r, seconds: parseFloat(r.length_seconds!) }))
        .filter((r) => !Number.isNaN(r.seconds));
      const bySeconds = [...withLength].sort((a, b) => a.seconds - b.seconds);
      const longest = bySeconds[bySeconds.length - 1];
      const median = bySeconds.length === 0 ? null :
        bySeconds.length % 2 === 1
          ? bySeconds[(bySeconds.length - 1) / 2].seconds
          : (bySeconds[bySeconds.length / 2 - 1].seconds + bySeconds[bySeconds.length / 2].seconds) / 2;

      const favourite = allSongs.find((s) => s.title.toLowerCase() === title.toLowerCase())?.favourite ?? false;

      const performances: SongPerformance[] = withShow
        .map((r) => {
          const parsed = r.length_seconds != null ? parseFloat(r.length_seconds) : NaN;
          const seconds = Number.isNaN(parsed) ? null : parsed;
          return {
            showId: r.show_id,
            date: formatDate(r.dead_shows!.date),
            location: formatLocation(r.dead_shows!),
            seconds,
            display: r.length_display ?? (seconds != null ? formatSeconds(seconds) : '—'),
          };
        })
        .sort((a, b) => {
          if (a.seconds == null && b.seconds == null) return 0;
          if (a.seconds == null) return 1;
          if (b.seconds == null) return -1;
          return b.seconds - a.seconds;
        });

      setStats({
        title,
        timesPlayed: rows.length,
        firstDate: first ? formatDate(first.dead_shows!.date) : '—',
        firstLocation: first ? formatLocation(first.dead_shows!) : '',
        firstShowId: first?.show_id ?? null,
        lastDate: last ? formatDate(last.dead_shows!.date) : '—',
        lastLocation: last ? formatLocation(last.dead_shows!) : '',
        lastShowId: last?.show_id ?? null,
        longestDisplay: longest ? (longest.length_display ?? formatSeconds(longest.seconds)) : '—',
        longestDate: longest?.dead_shows ? formatDate(longest.dead_shows.date) : '',
        longestLocation: longest?.dead_shows ? formatLocation(longest.dead_shows) : '',
        longestShowId: longest?.show_id ?? null,
        medianDisplay: median != null ? formatSeconds(median) : '—',
        favourite,
        performances,
      });
    } finally {
      setStatsLoading(false);
    }
  }, [allSongs]);

  const toggleSongFavourite = useCallback(async (title: string, favourite: boolean) => {
    const titleLower = title.toLowerCase();
    setStats((prev) => (prev && prev.title === title ? { ...prev, favourite } : prev));
    setAllSongs((prev) => prev.map((s) => (s.title.toLowerCase() === titleLower ? { ...s, favourite } : s)));
    setSuggestions((prev) => prev.map((s) => (s.title.toLowerCase() === titleLower ? { ...s, favourite } : s)));
    if (favourite) {
      await supabase.from('dead_song_favourites').upsert({ title_lower: titleLower });
    } else {
      await supabase.from('dead_song_favourites').delete().eq('title_lower', titleLower);
    }
  }, []);

  const clearSelection = useCallback(() => {
    setSelected(null);
    setStats(null);
    setQuery('');
  }, []);

  useImperativeHandle(ref, () => ({ selectSong }), [selectSong]);

  const swipeToOffset = useCallback((offset: number) => {
    if (!selected) return;
    const idx = allSongs.findIndex((s) => s.title === selected);
    if (idx === -1) return;
    const nextIdx = idx + offset;
    if (nextIdx < 0 || nextIdx >= allSongs.length) return;
    selectSong(allSongs[nextIdx].title);
  }, [selected, allSongs, selectSong]);

  const selectedIndex = useMemo(
    () => allSongs.findIndex((s) => s.title === selected),
    [allSongs, selected],
  );
  const canSwipePrev = selectedIndex > 0;
  const canSwipeNext = selectedIndex !== -1 && selectedIndex < allSongs.length - 1;

  const displayedSuggestions = useMemo(
    () => (onlyFavourite ? suggestions.filter((s) => s.favourite) : suggestions),
    [suggestions, onlyFavourite],
  );
  const displayedAllSongs = useMemo(
    () => (onlyFavourite ? allSongs.filter((s) => s.favourite) : allSongs),
    [allSongs, onlyFavourite],
  );

  const swipeGesture = Gesture.Pan()
    .runOnJS(true)
    .activeOffsetX([-20, 20])
    .failOffsetY([-15, 15])
    .onEnd((e) => {
      if (e.translationX < -60 || e.velocityX < -800) swipeToOffset(1);
      else if (e.translationX > 60 || e.velocityX > 800) swipeToOffset(-1);
    });

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.title}>🎵 Songs</Text>
      </View>

      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="Search a song"
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
      </View>

      {searching ? (
        <ActivityIndicator color={C.accent} style={{ marginTop: 12 }} />
      ) : suggestions.length > 0 ? (
        <FlatList
          data={displayedSuggestions}
          keyExtractor={(item) => item.title}
          contentContainerStyle={styles.suggestList}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={<Text style={styles.emptyText}>No favourites match</Text>}
          renderItem={({ item }) => (
            <Pressable style={styles.suggestRow} onPress={() => selectSong(item.title)}>
              <Text style={styles.suggestTitle}>{item.title}</Text>
              <View style={styles.suggestBadges}>
                {item.favourite ? <Text style={styles.suggestFavourite}>★</Text> : null}
                <Text style={styles.suggestCount}>{item.times_played}×</Text>
              </View>
            </Pressable>
          )}
        />
      ) : query.trim() ? (
        <Text style={styles.emptyText}>No songs match</Text>
      ) : allSongsLoading ? (
        <ActivityIndicator color={C.accent} style={{ marginTop: 12 }} />
      ) : (
        <FlatList
          data={displayedAllSongs}
          keyExtractor={(item) => item.title}
          contentContainerStyle={styles.suggestList}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          {...edgeScroll}
          ListEmptyComponent={<Text style={styles.emptyText}>No favourites yet</Text>}
          renderItem={({ item }) => (
            <Pressable style={styles.suggestRow} onPress={() => selectSong(item.title)}>
              <Text style={styles.suggestTitle}>{item.title}</Text>
              <View style={styles.suggestBadges}>
                {item.favourite ? <Text style={styles.suggestFavourite}>★</Text> : null}
                <Text style={styles.suggestCount}>{item.times_played}×</Text>
              </View>
            </Pressable>
          )}
        />
      )}

      <Modal
        visible={!!selected}
        animationType="fade"
        transparent
        presentationStyle="overFullScreen"
        onRequestClose={clearSelection}
      >
        <GestureHandlerRootView style={{ flex: 1 }}>
          <View style={styles.backdrop}>
            <Pressable style={StyleSheet.absoluteFill} onPress={clearSelection} />
            <GestureDetector gesture={swipeGesture}>
            <View style={styles.card}>
              <PageBackground layer1={DEADHEAD_BG.layer1} layer2={DEADHEAD_BG.layer2} opacity2={0.65} />
              <Pressable style={styles.detailClose} onPress={clearSelection} hitSlop={12}>
                <Text style={styles.detailCloseText}>✕</Text>
              </Pressable>
              <Pressable
                style={[styles.navArrow, styles.navArrowLeft, !canSwipePrev && styles.navArrowDisabled]}
                onPress={() => swipeToOffset(-1)}
                disabled={!canSwipePrev}
                hitSlop={12}
              >
                <Text style={styles.navArrowText}>‹</Text>
              </Pressable>
              <Pressable
                style={[styles.navArrow, styles.navArrowRight, !canSwipeNext && styles.navArrowDisabled]}
                onPress={() => swipeToOffset(1)}
                disabled={!canSwipeNext}
                hitSlop={12}
              >
                <Text style={styles.navArrowText}>›</Text>
              </Pressable>
              <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={styles.songDetailContent}
                showsVerticalScrollIndicator={false}
              >
                {statsLoading ? (
                  <ActivityIndicator color={C.muted} style={{ marginTop: 60 }} />
                ) : stats ? (
                  <>
                    <Text style={styles.songTitle}>{stats.title}</Text>
                    <View style={styles.switchRow}>
                      <Text style={styles.switchLabel}>Favourite</Text>
                      <Switch
                        value={stats.favourite}
                        onValueChange={(v) => toggleSongFavourite(stats.title, v)}
                        trackColor={{ true: C.danger }}
                      />
                    </View>
                    <StatRow label="Times Played" value={String(stats.timesPlayed)} />
                    <StatRow
                      label="First Played"
                      value={stats.firstDate}
                      sub={stats.firstLocation}
                      onPress={stats.firstShowId ? () => setDetailShowId(stats.firstShowId) : undefined}
                    />
                    <StatRow
                      label="Last Played"
                      value={stats.lastDate}
                      sub={stats.lastLocation}
                      onPress={stats.lastShowId ? () => setDetailShowId(stats.lastShowId) : undefined}
                    />
                    <StatRow
                      label="Longest Version"
                      value={stats.longestDisplay}
                      sub={[stats.longestDate, stats.longestLocation].filter(Boolean).join(' — ')}
                      onPress={stats.longestShowId ? () => setDetailShowId(stats.longestShowId) : undefined}
                    />
                    <StatRow label="Median Length" value={stats.medianDisplay} />

                    <Text style={styles.sectionLabel}>All Performances ({stats.performances.length})</Text>
                    {stats.performances.map((p, i) => (
                      <Pressable
                        key={`${p.showId}-${i}`}
                        style={({ pressed }) => [styles.perfRow, pressed && styles.statRowPressed]}
                        onPress={() => setDetailShowId(p.showId)}
                      >
                        <View style={styles.perfInfo}>
                          <Text style={styles.perfDate}>{p.date}</Text>
                          {p.location ? <Text style={styles.perfLocation}>{p.location}</Text> : null}
                        </View>
                        <Text style={styles.perfLength}>{p.display}</Text>
                      </Pressable>
                    ))}
                  </>
                ) : (
                  <Text style={styles.emptyTextDark}>No data for this song</Text>
                )}
              </ScrollView>
            </View>
            </GestureDetector>
          </View>
        </GestureHandlerRootView>
      </Modal>

      <DeadheadShowDetailModal
        showId={detailShowId}
        onClose={() => setDetailShowId(null)}
      />
    </View>
  );
  },
);

export default DeadheadSongsPage;

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
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: PADDING,
    marginBottom: 10,
    gap: 8,
  },
  searchInput: {
    flex: 1,
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
  emptyText: { fontSize: 14, color: C.muted, textAlign: 'center', marginTop: 24, paddingHorizontal: 40 },
  suggestList: { paddingHorizontal: PADDING, paddingBottom: 32 },
  suggestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(26,22,38,0.08)',
  },
  suggestTitle: { fontSize: 15, color: C.text, fontWeight: '500', flex: 1, paddingRight: 8 },
  suggestBadges: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  suggestFavourite: { fontSize: 14, color: C.danger },
  suggestCount: { fontSize: 13, color: C.muted },
  // Song detail modal
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    width: '88%',
    height: '85%',
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: '#FCA5A5',
  },
  detailClose: {
    position: 'absolute',
    top: 14,
    right: 14,
    zIndex: 10,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailCloseText: {
    color: C.text,
    fontSize: 14,
    fontWeight: '600',
  },
  navArrow: {
    position: 'absolute',
    top: 14,
    zIndex: 10,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  navArrowLeft: {
    left: 14,
  },
  navArrowRight: {
    right: 56,
  },
  navArrowDisabled: {
    opacity: 0.25,
  },
  navArrowText: {
    color: C.text,
    fontSize: 17,
    fontWeight: '700',
  },
  songDetailContent: {
    paddingTop: 44,
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  emptyTextDark: { fontSize: 14, color: C.muted, textAlign: 'center', marginTop: 24, paddingHorizontal: 40 },
  songTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: C.text,
    textAlign: 'center',
    letterSpacing: -0.4,
    marginBottom: 8,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 2,
    marginBottom: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(26,22,38,0.12)',
  },
  switchLabel: {
    fontSize: 15,
    fontWeight: '500',
    color: C.text,
  },
  statRow: {
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(26,22,38,0.1)',
    gap: 3,
  },
  statRowPressed: { opacity: 0.6 },
  statLabel: {
    fontSize: 10,
    color: C.muted,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  statValue: {
    fontSize: 17,
    color: C.text,
    fontWeight: '600',
  },
  statValueLink: {
    color: C.accent,
  },
  statSub: {
    fontSize: 13,
    color: C.muted,
  },
  sectionLabel: {
    fontSize: 10,
    color: C.muted,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: 28,
    marginBottom: 4,
  },
  perfRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(26,22,38,0.1)',
    gap: 12,
  },
  perfInfo: { flex: 1 },
  perfDate: {
    fontSize: 14,
    color: C.text,
    fontWeight: '600',
  },
  perfLocation: {
    fontSize: 12,
    color: C.muted,
    marginTop: 2,
  },
  perfLength: {
    fontSize: 14,
    color: C.accent,
    fontWeight: '600',
  },
});
