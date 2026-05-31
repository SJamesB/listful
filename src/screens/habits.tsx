import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { PageBackground } from '@/components/PageBackground';
import { supabase, type Frequency, type RecurringTask } from '@/lib/supabase';

// Aurora Borealis: lilac → periwinkle → aquamarine, with rose-peach overlay
const BG1 = ['#F2B8FF', '#B8CAFF', '#B8FFE8', '#F2B8FF'] as const;
const BG2 = ['#FFD4B8', '#FFFBB8', 'transparent'] as const;

const C = {
  text: '#1E1A2E',
  muted: 'rgba(30,26,46,0.45)',
  surface: 'rgba(255,255,255,0.48)',
  done: '#8B5CF6',
  doneFg: '#FFFFFF',
} as const;

const EMOJI_FALLBACKS: Record<string, string> = {
  meditate: '🧘', meditation: '🧘',
  read: '📖', reading: '📖', book: '📖',
  stretch: '🤸', stretching: '🤸',
  exercise: '💪', workout: '💪', gym: '💪',
  walk: '🚶', run: '🏃', jog: '🏃',
  journal: '✍️', write: '✍️',
  water: '💧', hydrate: '💧',
  sleep: '😴', rest: '😴',
  yoga: '🧘', swim: '🏊',
  cook: '🍳', clean: '🧹',
};

function resolveEmoji(name: string, emoji: string | null): string {
  if (emoji) return emoji;
  const key = name.toLowerCase().split(/\s+/)[0];
  return EMOJI_FALLBACKS[key] ?? '✨';
}

function toDate(d: Date): string {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${da}`;
}

function formatDate(d: Date): string {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const months = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]}`;
}

const NOW = new Date();
const TODAY = toDate(NOW);
const DATE_LABEL = formatDate(NOW);
const MONTH_START = toDate(new Date(NOW.getFullYear(), NOW.getMonth(), 1));

function getPeriodStart(frequency: Frequency): string {
  if (frequency === 'daily') return TODAY;
  if (frequency === 'weekly') {
    const d = new Date(NOW);
    const day = d.getDay();
    d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
    return toDate(d);
  }
  return MONTH_START;
}

type HabitRow = RecurringTask & { done: boolean };

export default function HabitsPage() {
  const [habits, setHabits] = useState<HabitRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    const [{ data: tasks, error: e1 }, { data: logs, error: e2 }] = await Promise.all([
      supabase.from('recurring_tasks').select('*').eq('active', true).order('sort_order'),
      supabase
        .from('task_logs')
        .select('task_id, log_date')
        .gte('log_date', MONTH_START)
        .lte('log_date', TODAY),
    ]);
    if (e1 || e2) { setError(true); setLoading(false); return; }
    setHabits(
      (tasks ?? []).map((task) => {
        const start = getPeriodStart(task.frequency as Frequency);
        const done = (logs ?? []).some(
          (l) => l.task_id === task.id && l.log_date >= start && l.log_date <= TODAY,
        );
        return { ...task, done };
      }),
    );
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggle = async (habit: HabitRow) => {
    setHabits((prev) => prev.map((h) => (h.id === habit.id ? { ...h, done: !h.done } : h)));
    if (habit.done) {
      const start = getPeriodStart(habit.frequency as Frequency);
      const { error } = await supabase
        .from('task_logs').delete()
        .eq('task_id', habit.id).gte('log_date', start).lte('log_date', TODAY);
      if (error) console.error('delete failed:', error.message);
    } else {
      const { error } = await supabase.from('task_logs').insert({
        task_id: habit.id, log_date: TODAY, completed_at: new Date().toISOString(),
      });
      if (error) console.error('insert failed:', error.message);
    }
  };

  return (
    <View style={styles.root}>
      <PageBackground layer1={BG1} layer2={BG2} opacity2={0.5} />
      {loading ? (
        <View style={styles.center}><ActivityIndicator color={C.done} /></View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.stateText}>couldn't load</Text>
          <Pressable onPress={load}><Text style={styles.retryText}>retry</Text></Pressable>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <Text style={styles.date}>{DATE_LABEL}</Text>
          <View style={styles.grid}>
            {habits.map((habit) => (
              <View key={habit.id} style={styles.tile}>
                <Pressable
                  onPress={() => toggle(habit)}
                  style={({ pressed }) => [
                    styles.square,
                    habit.done && styles.squareDone,
                    pressed && { opacity: 0.75 },
                  ]}>
                  <Text style={styles.emoji}>{resolveEmoji(habit.name, habit.emoji)}</Text>
                </Pressable>
                <Text style={styles.label}>{habit.name.toLowerCase()}</Text>
              </View>
            ))}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  scroll: { flexGrow: 1, alignItems: 'center', paddingTop: 64, paddingBottom: 64 },
  date: { fontSize: 13, color: C.muted, letterSpacing: 0.2, marginBottom: 40 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 24 },
  tile: { alignItems: 'center', gap: 8 },
  square: {
    width: 72, height: 72, borderRadius: 18,
    backgroundColor: C.surface,
    alignItems: 'center', justifyContent: 'center',
  },
  squareDone: { backgroundColor: C.done },
  emoji: { fontSize: 32 },
  label: { fontSize: 11, color: C.muted, fontWeight: '500', letterSpacing: 0.3 },
  stateText: { fontSize: 15, color: C.muted },
  retryText: { fontSize: 13, color: C.done, fontWeight: '500', padding: 10 },
});
