import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
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
  accent: '#1E3A8A',
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

function formatLocation(show: { venue: string | null; city: string | null; state: string | null }): string {
  const place = [show.city, show.state].filter(Boolean).join(', ');
  if (show.venue && place) return `${show.venue} — ${place}`;
  return show.venue || place || '';
}

// Multi-song runs regularly pass the hour mark, so unlike the Songs page this
// needs an h:mm:ss form too.
function formatSeconds(seconds: number): string {
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// 'pair' = any two adjacent songs linked by a segue; 'run' = an unbroken
// chain of 3+ songs taken as a whole. See the dead_transitions migration.
type TransitionKind = 'pair' | 'run';

interface Transition {
  kind: TransitionKind;
  transition_key: string;
  title: string;
  song_count: number;
  times_played: number;
}

interface PerformanceRow {
  show_id: string;
  start_track: number | null;
  length_seconds: string | null;
  date: string | null;
  venue: string | null;
  city: string | null;
  state: string | null;
}

interface TransitionPerformance {
  showId: string;
  date: string;
  location: string;
  seconds: number | null;
}

interface TransitionStats {
  transition: Transition;
  showCount: number;
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
  performances: TransitionPerformance[];
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

export default function DeadheadTransitionsPage({ onEdgesChange }: { onEdgesChange?: EdgesChangeHandler }) {
  const edgeScroll = useSectionEdgeScroll(onEdgesChange);

  const [kind, setKind] = useState<TransitionKind>('pair');
  const [query, setQuery] = useState('');

  const [allTransitions, setAllTransitions] = useState<Transition[]>([]);
  const [loading, setLoading] = useState(true);

  const [selected, setSelected] = useState<Transition | null>(null);
  const [stats, setStats] = useState<TransitionStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  const [detailShowId, setDetailShowId] = useState<string | null>(null);

  useEffect(() => {
    fetchAllRows<Transition>((from, to) =>
      supabase
        .from('dead_transitions')
        .select('kind, transition_key, title, song_count, times_played')
        .order('times_played', { ascending: false })
        .order('title', { ascending: true })
        .range(from, to),
    ).then((data) => {
      setAllTransitions(data);
      setLoading(false);
    });
  }, []);

  // The whole list (a few thousand rows) is already loaded, so search just
  // filters it locally rather than round-tripping per keystroke.
  const displayed = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    return allTransitions.filter(
      (t) => t.kind === kind && (!trimmed || t.transition_key.includes(trimmed)),
    );
  }, [allTransitions, kind, query]);

  const selectTransition = useCallback(async (transition: Transition) => {
    setSelected(transition);
    setStats(null);
    setStatsLoading(true);
    try {
      const rows = await fetchAllRows<PerformanceRow>((from, to) =>
        supabase
          .from('dead_transition_performances')
          .select('show_id, start_track, length_seconds, date, venue, city, state')
          .eq('kind', transition.kind)
          .eq('transition_key', transition.transition_key)
          .order('date', { ascending: true })
          .order('start_track', { ascending: true })
          .range(from, to),
      );
      if (rows.length === 0) {
        setStats(null);
        return;
      }

      const performances: TransitionPerformance[] = rows.map((r) => {
        const parsed = r.length_seconds != null ? parseFloat(r.length_seconds) : NaN;
        return {
          showId: r.show_id,
          date: r.date ? formatDate(r.date) : '—',
          location: formatLocation(r),
          seconds: Number.isNaN(parsed) ? null : parsed,
        };
      });

      const withDate = rows.filter((r) => r.date);
      const first = withDate[0];
      const last = withDate[withDate.length - 1];

      const withLength = performances.filter((p) => p.seconds != null) as (TransitionPerformance & { seconds: number })[];
      const bySeconds = [...withLength].sort((a, b) => a.seconds - b.seconds);
      const longest = bySeconds[bySeconds.length - 1];
      const median = bySeconds.length === 0 ? null :
        bySeconds.length % 2 === 1
          ? bySeconds[(bySeconds.length - 1) / 2].seconds
          : (bySeconds[bySeconds.length / 2 - 1].seconds + bySeconds[bySeconds.length / 2].seconds) / 2;

      setStats({
        transition,
        showCount: new Set(rows.map((r) => r.show_id)).size,
        firstDate: first ? formatDate(first.date!) : '—',
        firstLocation: first ? formatLocation(first) : '',
        firstShowId: first?.show_id ?? null,
        lastDate: last ? formatDate(last.date!) : '—',
        lastLocation: last ? formatLocation(last) : '',
        lastShowId: last?.show_id ?? null,
        longestDisplay: longest ? formatSeconds(longest.seconds) : '—',
        longestDate: longest && longest.date !== '—' ? longest.date : '',
        longestLocation: longest?.location ?? '',
        longestShowId: longest?.showId ?? null,
        medianDisplay: median != null ? formatSeconds(median) : '—',
        performances: [...performances].sort((a, b) => {
          if (a.seconds == null && b.seconds == null) return 0;
          if (a.seconds == null) return 1;
          if (b.seconds == null) return -1;
          return b.seconds - a.seconds;
        }),
      });
    } finally {
      setStatsLoading(false);
    }
  }, []);

  const clearSelection = useCallback(() => {
    setSelected(null);
    setStats(null);
  }, []);

  const selectedIndex = useMemo(
    () => (selected ? displayed.findIndex((t) => t.transition_key === selected.transition_key) : -1),
    [displayed, selected],
  );
  const canSwipePrev = selectedIndex > 0;
  const canSwipeNext = selectedIndex !== -1 && selectedIndex < displayed.length - 1;

  const swipeToOffset = useCallback((offset: number) => {
    if (selectedIndex === -1) return;
    const nextIdx = selectedIndex + offset;
    if (nextIdx < 0 || nextIdx >= displayed.length) return;
    selectTransition(displayed[nextIdx]);
  }, [selectedIndex, displayed, selectTransition]);

  const swipeGesture = Gesture.Pan()
    .runOnJS(true)
    .activeOffsetX([-20, 20])
    .failOffsetY([-15, 15])
    .onEnd((e) => {
      if (e.translationX < -60 || e.velocityX < -800) swipeToOffset(1);
      else if (e.translationX > 60 || e.velocityX > 800) swipeToOffset(-1);
    });

  const lengthLabel = stats?.transition.kind === 'run' ? 'Run' : 'Pair';

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.title}>🔀 Transitions</Text>
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
          onPress={() => setKind('pair')}
          style={[styles.filterChip, kind === 'pair' && styles.filterChipActive]}
        >
          <Text style={[styles.filterChipText, kind === 'pair' && styles.filterChipTextActive]}>Two-song</Text>
        </Pressable>
        <Pressable
          onPress={() => setKind('run')}
          style={[styles.filterChip, kind === 'run' && styles.filterChipActive]}
        >
          <Text style={[styles.filterChipText, kind === 'run' && styles.filterChipTextActive]}>Multi-song</Text>
        </Pressable>
      </View>

      {loading ? (
        <ActivityIndicator color={C.accent} style={{ marginTop: 12 }} />
      ) : (
        <FlatList
          data={displayed}
          keyExtractor={(item) => `${item.kind}:${item.transition_key}`}
          contentContainerStyle={styles.suggestList}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          {...edgeScroll}
          ListEmptyComponent={<Text style={styles.emptyText}>No transitions match</Text>}
          renderItem={({ item }) => (
            <Pressable style={styles.suggestRow} onPress={() => selectTransition(item)}>
              <Text style={styles.suggestTitle}>{item.title}</Text>
              <Text style={styles.suggestCount}>{item.times_played}×</Text>
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
                contentContainerStyle={styles.detailContent}
                showsVerticalScrollIndicator={false}
              >
                {statsLoading ? (
                  <ActivityIndicator color={C.muted} style={{ marginTop: 60 }} />
                ) : stats ? (
                  <>
                    <View style={styles.songChain}>
                      {stats.transition.title.split(' > ').map((song, i, songs) => (
                        <Text key={`${song}-${i}`} style={styles.songChainTitle}>
                          {song}{i < songs.length - 1 ? ' >' : ''}
                        </Text>
                      ))}
                    </View>
                    <Text style={styles.songCount}>
                      {stats.transition.song_count} songs · {stats.transition.kind === 'run' ? 'continuous run' : 'two-song transition'}
                    </Text>
                    <StatRow
                      label="Times Played"
                      value={String(stats.performances.length)}
                      sub={stats.showCount !== stats.performances.length ? `across ${stats.showCount} shows` : undefined}
                    />
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
                      label={`Longest ${lengthLabel}`}
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
                        <Text style={styles.perfLength}>{p.seconds != null ? formatSeconds(p.seconds) : '—'}</Text>
                      </Pressable>
                    ))}
                  </>
                ) : (
                  <Text style={styles.emptyText}>No data for this transition</Text>
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
  suggestCount: { fontSize: 13, color: C.muted },
  // Transition detail modal
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
  detailContent: {
    paddingTop: 56,
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  songChain: {
    alignItems: 'center',
    gap: 2,
  },
  songChainTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: C.text,
    textAlign: 'center',
    letterSpacing: -0.4,
  },
  songCount: {
    fontSize: 13,
    color: C.muted,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 12,
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
