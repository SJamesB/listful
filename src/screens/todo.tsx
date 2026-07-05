import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import DraggableFlatList, {
  RenderItemParams,
  ScaleDecorator,
} from 'react-native-draggable-flatlist';

import { useSectionEdgeScroll, type EdgesChangeHandler } from '@/hooks/use-section-edge-scroll';
import { supabase } from '@/lib/supabase';

const C = {
  text: '#1E1826',
  muted: 'rgba(30,24,38,0.45)',
  border: 'rgba(30,24,38,0.12)',
  accent: '#F97316',
} as const;

const TWO_DAYS = () => new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();

interface TodoItem { id: string; text: string; created_at: string; sort_order: number | null; }
interface LogItem  { id: string; text: string; completed_at: string; }

export default function TodoPage({ onEdgesChange }: { onEdgesChange?: EdgesChangeHandler }) {
  const edgeScroll = useSectionEdgeScroll(onEdgesChange);
  const [items, setItems] = useState<TodoItem[]>([]);
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newText, setNewText] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [recentOpen, setRecentOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const submitting = useRef(false);
  const newTextRef = useRef('');
  const inputRef = useRef<TextInput>(null);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    const [{ data: active }, { data: recent }] = await Promise.all([
      supabase.from('todo').select('*')
        .order('sort_order', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: true }),
      supabase.from('todo_logs').select('*')
        .gte('completed_at', TWO_DAYS())
        .order('completed_at', { ascending: false }),
    ]);
    if (active) setItems(active);
    if (recent) setLogs(recent);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => { if (!adding) setSuggestions([]); }, [adding]);

  useEffect(() => {
    const trimmed = newText.trim();
    if (!trimmed) { setSuggestions([]); return; }
    const timer = setTimeout(async () => {
      const { data } = await supabase
        .from('todo_logs')
        .select('text')
        .ilike('text', `%${trimmed}%`);
      if (!data) return;
      const counts: Record<string, number> = {};
      data.forEach(({ text }) => { counts[text] = (counts[text] ?? 0) + 1; });
      setSuggestions(
        Object.entries(counts)
          .sort(([, a], [, b]) => b - a)
          .map(([t]) => t)
          .slice(0, 5)
      );
    }, 300);
    return () => clearTimeout(timer);
  }, [newText]);

  const complete = async (item: TodoItem) => {
    setItems((prev) => prev.filter((i) => i.id !== item.id));
    const { data: log } = await supabase.from('todo_logs')
      .insert({ text: item.text, completed_at: new Date().toISOString() })
      .select().single();
    await supabase.from('todo').delete().eq('id', item.id);
    if (log) setLogs((prev) => [log, ...prev]);
  };

  const uncomplete = async (log: LogItem) => {
    setLogs((prev) => prev.filter((l) => l.id !== log.id));
    await supabase.from('todo_logs').delete().eq('id', log.id);
    const { data } = await supabase.from('todo')
      .insert({ text: log.text, sort_order: items.length }).select().single();
    if (data) setItems((prev) => [...prev, data]);
  };

  const startEdit = (item: TodoItem) => {
    setAdding(false); setEditingId(item.id); setEditText(item.text);
  };

  const saveEdit = async () => {
    const id = editingId;
    if (!id) return;
    const text = editText.trim();
    if (!text) { setEditingId(null); return; }
    await supabase.from('todo').update({ text }).eq('id', id);
    setItems((prev) => prev.map((i) => i.id === id ? { ...i, text } : i));
    setEditingId(null);
  };

  const add = async () => {
    if (submitting.current) return;
    const text = newTextRef.current.trim();
    if (!text) { setAdding(false); setSuggestions([]); return; }
    submitting.current = true;
    newTextRef.current = '';
    setNewText(''); setAdding(false); setSuggestions([]);
    const { data, error } = await supabase.from('todo')
      .insert({ text, sort_order: items.length }).select().single();
    if (!error && data) setItems((prev) => [...prev, data]);
    else if (error) console.error('add failed:', error.message);
    submitting.current = false;
  };

  const selectSuggestion = (text: string) => {
    if (blurTimer.current !== null) {
      clearTimeout(blurTimer.current);
      blurTimer.current = null;
    }
    newTextRef.current = text;
    setNewText(text);
    setSuggestions([]);
    inputRef.current?.focus();
  };

  const onDragEnd = async ({ data: newOrder }: { data: TodoItem[] }) => {
    setItems(newOrder);
    await Promise.all(
      newOrder.map((item, index) =>
        supabase.from('todo').update({ sort_order: index }).eq('id', item.id)
      )
    );
  };

  const renderItem = ({ item, drag, isActive }: RenderItemParams<TodoItem>) => (
    <ScaleDecorator>
      <View style={[styles.row, isActive && { opacity: 0.8 }]}>
        <Pressable onPress={() => complete(item)} hitSlop={8}>
          <View style={styles.circle} />
        </Pressable>
        {editingId === item.id ? (
          <TextInput
            style={[styles.editInput]}
            value={editText}
            onChangeText={setEditText}
            onSubmitEditing={saveEdit}
            onBlur={saveEdit}
            autoFocus
            returnKeyType="done"
          />
        ) : (
          <Pressable style={{ flex: 1 }} onPress={() => startEdit(item)}
            onLongPress={drag} delayLongPress={300}>
            <Text style={styles.itemText}>{item.text}</Text>
          </Pressable>
        )}
      </View>
    </ScaleDecorator>
  );

  const header = (
    <View style={styles.block}>
      <Text style={styles.title}>🐝 To Do</Text>
      {items.length === 0 && !adding && (
        <Text style={styles.empty}>nothing to do</Text>
      )}
      <View style={styles.addRow}>
        {adding ? (
          <>
            <TextInput
              ref={inputRef}
              style={styles.input}
              value={newText}
              onChangeText={(v) => { newTextRef.current = v; setNewText(v); }}
              onSubmitEditing={add}
              onBlur={() => { if (suggestions.length === 0) blurTimer.current = setTimeout(add, 150); }}
              placeholder="new entry..."
              placeholderTextColor={C.muted}
              autoFocus
              returnKeyType="done"
            />
            {suggestions.length > 0 && (
              <View style={styles.suggestions}>
                {suggestions.map((s) => (
                  <Pressable
                    key={s}
                    onPress={() => selectSuggestion(s)}
                    style={({ pressed }) => [styles.suggestionItem, pressed && { opacity: 0.6 }]}
                  >
                    <Text style={styles.suggestionText}>{s}</Text>
                  </Pressable>
                ))}
              </View>
            )}
          </>
        ) : (
          <Pressable onPress={() => setAdding(true)}
            style={({ pressed }) => [{ opacity: pressed ? 0.5 : 1 }]}>
            <Text style={styles.addText}>+ add new entry</Text>
          </Pressable>
        )}
      </View>
    </View>
  );

  const footer = logs.length > 0 ? (
    <View style={styles.block}>
      <Pressable onPress={() => setRecentOpen((o) => !o)} style={styles.recentHeader}>
        <Text style={styles.recentTitle}>Recent ({logs.length})</Text>
        <Text style={styles.chevron}>{recentOpen ? '▲' : '▼'}</Text>
      </Pressable>
      {recentOpen && logs.map((log) => (
        <View key={log.id} style={styles.recentRow}>
          <Text style={styles.recentText} numberOfLines={1}>{log.text}</Text>
          <Pressable onPress={() => uncomplete(log)} hitSlop={8}>
            <Text style={styles.undo}>↩</Text>
          </Pressable>
        </View>
      ))}
    </View>
  ) : null;

  return (
    <View style={styles.root}>
      {loading ? (
        <View style={styles.center}><ActivityIndicator color={C.accent} /></View>
      ) : (
        <DraggableFlatList
          data={items}
          keyExtractor={(item) => item.id}
          onDragEnd={onDragEnd}
          renderItem={renderItem}
          ListHeaderComponent={header}
          ListFooterComponent={footer}
          contentContainerStyle={styles.list}
          containerStyle={styles.fill}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          activationDistance={5}
          {...edgeScroll}
        />
      )}
    </View>
  );
}

const ROW_MAX = 400;

const styles = StyleSheet.create({
  root: { flex: 1 },
  fill: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { paddingBottom: 64 },
  block: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: ROW_MAX,
    paddingHorizontal: 24,
  },
  title: {
    fontSize: 17, fontWeight: '600', color: C.text,
    letterSpacing: -0.3, marginBottom: 20, marginTop: 60,
  },
  empty: { fontSize: 13, color: C.muted, marginBottom: 16 },
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 14, gap: 16,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border,
    alignSelf: 'center', width: '100%', maxWidth: ROW_MAX, paddingHorizontal: 24,
  },
  circle: {
    width: 18, height: 18, borderRadius: 9,
    borderWidth: 1.5, borderColor: 'rgba(30,24,38,0.3)',
  },
  itemText: { flex: 1, fontSize: 14, color: C.text, fontWeight: '400', letterSpacing: -0.1 },
  addRow: {
    paddingTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border,
  },
  addText: { fontSize: 14, color: C.muted, fontWeight: '500' },
  input: {
    fontSize: 16, color: C.text, paddingVertical: 2,
    borderBottomWidth: 1.5, borderBottomColor: C.accent,
    outlineStyle: 'none',
  } as any,
  editInput: {
    flex: 1, fontSize: 14, color: C.text,
    borderBottomWidth: 1, borderBottomColor: C.accent,
    outlineStyle: 'none',
  } as any,
  suggestions: {
    marginTop: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
    borderRadius: 8,
    overflow: 'hidden',
  },
  suggestionItem: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
  },
  suggestionText: {
    fontSize: 14,
    color: C.text,
  },
  recentHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 14, marginTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border,
  },
  recentTitle: { fontSize: 13, fontWeight: '600', color: C.muted },
  chevron: { fontSize: 11, color: C.muted },
  recentRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border,
  },
  recentText: { flex: 1, fontSize: 14, color: C.muted, textDecorationLine: 'line-through' },
  undo: { fontSize: 15, color: C.muted },
});
