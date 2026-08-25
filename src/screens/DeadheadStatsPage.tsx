import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import DeadheadShowDetailModal from '@/components/DeadheadShowDetailModal';
import { useSectionEdgeScroll, type EdgesChangeHandler } from '@/hooks/use-section-edge-scroll';
import { supabase } from '@/lib/supabase';

const C = {
  text: '#1A1626',
  muted: 'rgba(26,22,38,0.45)',
  accent: '#D97706',
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
}

interface TrackRow {
  length_seconds: string | null;
  length_display: string | null;
  show_id: string;
  dead_shows: { date: string; venue: string | null; city: string | null; state: string | null } | null;
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

export default function DeadheadStatsPage({ onEdgesChange }: { onEdgesChange?: EdgesChangeHandler }) {
  const edgeScroll = useSectionEdgeScroll(onEdgesChange);

  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<SongSuggestion[]>([]);
  const [searching, setSearching] = useState(false);

  const [allSongs, setAllSongs] = useState<SongSuggestion[]>([]);
  const [allSongsLoading, setAllSongsLoading] = useState(true);

  const [selected, setSelected] = useState<string | null>(null);
  const [stats, setStats] = useState<SongStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  const [detailShowId, setDetailShowId] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from('dead_songs')
      .select('title, times_played')
      .order('times_played', { ascending: false })
      .limit(2000)
      .then(({ data }) => {
        setAllSongs((data ?? []) as SongSuggestion[]);
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
        .select('title, times_played')
        .ilike('title', `%${trimmed}%`)
        .order('times_played', { ascending: false })
        .limit(20);
      setSuggestions((data ?? []) as SongSuggestion[]);
      setSearching(false);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [query, selected]);

  const selectSong = async (title: string) => {
    setSelected(title);
    setSuggestions([]);
    setStats(null);
    setStatsLoading(true);
    try {
      const { data } = await supabase
        .from('dead_tracks')
        .select('length_seconds, length_display, show_id, dead_shows(date, venue, city, state)')
        .contains('song_titles_lower', [title.toLowerCase()])
        .limit(5000);
      const rows = (data ?? []) as unknown as TrackRow[];
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
      });
    } finally {
      setStatsLoading(false);
    }
  };

  const clearSelection = () => {
    setSelected(null);
    setStats(null);
    setQuery('');
  };

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.title}>📊 Stats</Text>
      </View>

      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          value={selected ?? query}
          onChangeText={(t) => { setSelected(null); setStats(null); setQuery(t); }}
          placeholder="Search a song"
          placeholderTextColor={C.muted}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
        />
        {selected ? (
          <Pressable onPress={clearSelection} style={styles.clearBtn} hitSlop={8}>
            <Text style={styles.clearBtnText}>✕</Text>
          </Pressable>
        ) : null}
      </View>

      {!selected && searching ? (
        <ActivityIndicator color={C.accent} style={{ marginTop: 12 }} />
      ) : !selected && suggestions.length > 0 ? (
        <FlatList
          data={suggestions}
          keyExtractor={(item) => item.title}
          contentContainerStyle={styles.suggestList}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <Pressable style={styles.suggestRow} onPress={() => selectSong(item.title)}>
              <Text style={styles.suggestTitle}>{item.title}</Text>
              <Text style={styles.suggestCount}>{item.times_played}×</Text>
            </Pressable>
          )}
        />
      ) : !selected && query.trim() ? (
        <Text style={styles.emptyText}>No songs match</Text>
      ) : !selected && allSongsLoading ? (
        <ActivityIndicator color={C.accent} style={{ marginTop: 12 }} />
      ) : !selected ? (
        <FlatList
          data={allSongs}
          keyExtractor={(item) => item.title}
          contentContainerStyle={styles.suggestList}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          {...edgeScroll}
          renderItem={({ item }) => (
            <Pressable style={styles.suggestRow} onPress={() => selectSong(item.title)}>
              <Text style={styles.suggestTitle}>{item.title}</Text>
              <Text style={styles.suggestCount}>{item.times_played}×</Text>
            </Pressable>
          )}
        />
      ) : null}

      {selected && (
        <ScrollView
          contentContainerStyle={styles.statsContent}
          showsVerticalScrollIndicator={false}
          {...edgeScroll}
        >
          {statsLoading ? (
            <ActivityIndicator color={C.accent} style={{ marginTop: 24 }} />
          ) : stats ? (
            <>
              <Text style={styles.songTitle}>{stats.title}</Text>
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
            </>
          ) : (
            <Text style={styles.emptyText}>No data for this song</Text>
          )}
        </ScrollView>
      )}

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
  clearBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(26,22,38,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearBtnText: { fontSize: 13, color: C.muted, fontWeight: '600' },
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
  statsContent: {
    paddingHorizontal: PADDING,
    paddingBottom: 64,
  },
  songTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: C.text,
    textAlign: 'center',
    letterSpacing: -0.4,
    marginTop: 8,
    marginBottom: 24,
  },
  statRow: {
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(26,22,38,0.08)',
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
});
