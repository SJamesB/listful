import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/Text';
import { useSectionEdgeScroll, type EdgesChangeHandler } from '@/hooks/use-section-edge-scroll';
import { GOOGLE_REFRESH_TOKEN } from '@/lib/googleConfig';
import {
  type CalEvent,
  eventTime,
  fetchEventsForDate,
  getAccessToken,
} from '@/lib/googleCalendar';
import { supabase, type Frequency, type RecurringTask } from '@/lib/supabase';


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

const NOW          = new Date();
const TODAY        = toDate(NOW);
const DATE_LABEL   = formatDate(NOW);
const TOMORROW_D   = new Date(NOW); TOMORROW_D.setDate(NOW.getDate() + 1);
const TOMORROW_LABEL = formatDate(TOMORROW_D);
const MONTH_START  = toDate(new Date(NOW.getFullYear(), NOW.getMonth(), 1));

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

// ─── Calendar sub-components ─────────────────────────────────────────────────

function EventRow({ event }: { event: CalEvent }) {
  return (
    <View style={cal.row}>
      <Text style={cal.time}>{eventTime(event)}</Text>
      <Text style={cal.title} numberOfLines={1}>{event.summary}</Text>
    </View>
  );
}

function CalDay({ label, events, loading }: { label: string; events: CalEvent[]; loading: boolean }) {
  return (
    <View style={cal.day}>
      <Text style={cal.dayLabel}>{label}</Text>
      {loading ? (
        <ActivityIndicator color={C.done} size="small" style={{ marginTop: 6 }} />
      ) : events.length === 0 ? (
        <Text style={cal.empty}>Nothing scheduled</Text>
      ) : (
        events.map((e) => <EventRow key={e.id} event={e} />)
      )}
    </View>
  );
}

function CalendarSection() {
  const [loading, setLoading]         = useState(true);
  const [todayEvents, setToday]       = useState<CalEvent[]>([]);
  const [tomorrowEvents, setTomorrow] = useState<CalEvent[]>([]);
  const [error, setError]             = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getAccessToken()
      .then(async (tok) => {
        const [td, tm] = await Promise.all([
          fetchEventsForDate(tok, NOW),
          fetchEventsForDate(tok, TOMORROW_D),
        ]);
        if (!cancelled) { setToday(td); setTomorrow(tm); }
      })
      .catch((err: Error) => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <View style={cal.section}>
        <View style={cal.divider} />
        <ActivityIndicator color={C.done} size="small" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={cal.section}>
        <View style={cal.divider} />
        <Text style={cal.errorText}>Calendar error: {error}</Text>
      </View>
    );
  }

  return (
    <View style={cal.section}>
      <View style={cal.divider} />
      <CalDay label={`Today  ·  ${DATE_LABEL}`}        events={todayEvents}    loading={false} />
      <CalDay label={`Tomorrow  ·  ${TOMORROW_LABEL}`} events={tomorrowEvents} loading={false} />
    </View>
  );
}

// ─── History modal ───────────────────────────────────────────────────────────

const WEEKDAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function logKey(taskId: string, date: string): string {
  return `${taskId}_${date}`;
}

interface HistoryModalProps {
  visible: boolean;
  onClose: () => void;
  habits: RecurringTask[];
}

function HistoryModal({ visible, onClose, habits }: HistoryModalProps) {
  const insets = useSafeAreaInsets();
  const [logs, setLogs] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const days = useMemo(() => {
    const out: { date: string; dow: string; dom: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(NOW);
      d.setDate(NOW.getDate() - i);
      out.push({ date: toDate(d), dow: WEEKDAY_LETTERS[d.getDay()], dom: d.getDate() });
    }
    return out;
  }, []);

  const rangeStart = days[0].date;

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    const { data, error } = await supabase
      .from('task_logs')
      .select('task_id, log_date')
      .gte('log_date', rangeStart)
      .lte('log_date', TODAY);
    if (error) { setError(true); setLoading(false); return; }
    setLogs(new Set((data ?? []).map((l) => logKey(l.task_id, l.log_date))));
    setLoading(false);
  }, [rangeStart]);

  useEffect(() => {
    if (visible) load();
  }, [visible, load]);

  const toggle = async (taskId: string, date: string) => {
    const key = logKey(taskId, date);
    const has = logs.has(key);
    setLogs((prev) => {
      const next = new Set(prev);
      if (has) next.delete(key); else next.add(key);
      return next;
    });
    if (has) {
      const { error } = await supabase
        .from('task_logs').delete()
        .eq('task_id', taskId).eq('log_date', date);
      if (error) console.error('delete failed:', error.message);
    } else {
      const { error } = await supabase.from('task_logs').insert({
        task_id: taskId, log_date: date, completed_at: new Date().toISOString(),
      });
      if (error) console.error('insert failed:', error.message);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={hist.backdrop}>
        <View style={[hist.sheet, { paddingBottom: insets.bottom + 24 }]}>
          <View style={hist.header}>
            <Text style={hist.heading}>History</Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <Text style={hist.doneText}>Done</Text>
            </Pressable>
          </View>

          <View style={hist.row}>
            <View style={hist.labelCol} />
            {days.map((d) => (
              <View key={d.date} style={hist.dayCol}>
                <Text style={[hist.dayDow, d.date === TODAY && hist.todayText]}>{d.dow}</Text>
                <Text style={[hist.dayDom, d.date === TODAY && hist.todayText]}>{d.dom}</Text>
              </View>
            ))}
          </View>

          {loading ? (
            <View style={hist.center}><ActivityIndicator color={C.done} /></View>
          ) : error ? (
            <View style={hist.center}>
              <Text style={styles.stateText}>couldn't load</Text>
              <Pressable onPress={load}><Text style={styles.retryText}>retry</Text></Pressable>
            </View>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={hist.list}>
              {habits.map((habit) => (
                <View key={habit.id} style={hist.row}>
                  <View style={hist.labelCol}>
                    <Text style={hist.rowEmoji}>{resolveEmoji(habit.name, habit.emoji)}</Text>
                    <Text style={hist.rowLabel} numberOfLines={1}>{habit.name.toLowerCase()}</Text>
                  </View>
                  {days.map((d) => {
                    const done = logs.has(logKey(habit.id, d.date));
                    return (
                      <View key={d.date} style={hist.dayCol}>
                        <Pressable
                          onPress={() => toggle(habit.id, d.date)}
                          hitSlop={4}
                          style={({ pressed }) => [
                            hist.cell,
                            done && hist.cellDone,
                            pressed && { opacity: 0.6 },
                          ]}
                        />
                      </View>
                    );
                  })}
                </View>
              ))}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function HabitsPage({ onEdgesChange }: { onEdgesChange?: EdgesChangeHandler }) {
  const edgeScroll = useSectionEdgeScroll(onEdgesChange);
  const [habits, setHabits] = useState<HabitRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

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
      {loading ? (
        <View style={styles.center}><ActivityIndicator color={C.done} /></View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.stateText}>couldn't load</Text>
          <Pressable onPress={load}><Text style={styles.retryText}>retry</Text></Pressable>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} {...edgeScroll}>
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

          <Pressable
            onPress={() => setHistoryOpen(true)}
            style={({ pressed }) => [styles.historyBtn, pressed && { opacity: 0.7 }]}
          >
            <Text style={styles.historyBtnText}>History</Text>
          </Pressable>

          {GOOGLE_REFRESH_TOKEN ? <CalendarSection /> : null}
        </ScrollView>
      )}

      <HistoryModal
        visible={historyOpen}
        onClose={() => { setHistoryOpen(false); load(); }}
        habits={habits}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  scroll: { flexGrow: 1, alignItems: 'center', paddingTop: 64, paddingBottom: 64 },
  date: { fontSize: 20, color: C.muted, letterSpacing: 0.2, marginBottom: 40 },
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
  historyBtn: {
    marginTop: 28,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 14,
    backgroundColor: C.surface,
  },
  historyBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: C.muted,
    letterSpacing: 0.4,
  },
});

const hist = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  heading: { fontSize: 17, fontWeight: '700', color: C.text },
  doneText: { fontSize: 15, fontWeight: '600', color: C.done },
  center: { paddingVertical: 40, alignItems: 'center', justifyContent: 'center', gap: 12 },
  list: { paddingTop: 4, paddingBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingHorizontal: 20 },
  labelCol: { width: 92, flexDirection: 'row', alignItems: 'center', gap: 6 },
  rowEmoji: { fontSize: 16 },
  rowLabel: { flex: 1, fontSize: 12, fontWeight: '500', color: C.text },
  dayCol: { flex: 1, alignItems: 'center' },
  dayDow: { fontSize: 11, fontWeight: '600', color: C.muted, letterSpacing: 0.4 },
  dayDom: { fontSize: 11, fontWeight: '600', color: C.muted, marginTop: 1 },
  todayText: { color: C.done },
  cell: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: 'rgba(30,26,46,0.06)',
  },
  cellDone: { backgroundColor: C.done },
});

const cal = StyleSheet.create({
  section: {
    width: '100%',
    maxWidth: 320,
    alignSelf: 'center',
    paddingTop: 64,
    paddingBottom: 16,
    gap: 20,
    alignItems: 'stretch',
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(30,26,46,0.12)',
    marginBottom: 4,
  },
  day: { gap: 6 },
  dayLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: C.muted,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.surface,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
    gap: 10,
  },
  time: {
    fontSize: 12,
    fontWeight: '600',
    color: C.done,
    width: 52,
  },
  title: {
    flex: 1,
    fontSize: 14,
    color: C.text,
    fontWeight: '500',
  },
  empty: {
    fontSize: 13,
    color: C.muted,
    paddingLeft: 2,
  },
  errorText: {
    fontSize: 12,
    color: '#DC2626',
    textAlign: 'center',
  },
});
