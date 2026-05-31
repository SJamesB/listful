import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { PageBackground } from '@/components/PageBackground';
import { supabase } from '@/lib/supabase';

// Tropical Sunset: mango → flamingo → sky, with mint-lemon overlay
const BG1 = ['#FFD4A5', '#FFAABF', '#AAC8FF', '#AAFFD8'] as const;
const BG2 = ['#FFFF99', 'transparent', '#FFAAEE'] as const;

const C = {
  text: '#1E1826',
  muted: 'rgba(30,24,38,0.45)',
  border: 'rgba(30,24,38,0.12)',
  accent: '#F97316',
} as const;

interface TodoItem {
  id: string;
  text: string;
  created_at: string;
}

export default function TodoPage() {
  const [items, setItems] = useState<TodoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newText, setNewText] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const submitting = useRef(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('todo').select('*').order('created_at', { ascending: true });
    if (!error) setItems(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const complete = async (item: TodoItem) => {
    setItems((prev) => prev.filter((i) => i.id !== item.id));
    await supabase.from('todo_logs').insert({ text: item.text, completed_at: new Date().toISOString() });
    const { error } = await supabase.from('todo').delete().eq('id', item.id);
    if (error) console.error('complete failed:', error.message);
  };

  const startEdit = (item: TodoItem) => {
    setAdding(false);
    setEditingId(item.id);
    setEditText(item.text);
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
    const text = newText.trim();
    if (!text) { setAdding(false); return; }
    submitting.current = true;
    setNewText('');
    setAdding(false);
    const { data, error } = await supabase.from('todo').insert({ text }).select().single();
    if (!error && data) setItems((prev) => [...prev, data]);
    else if (error) console.error('add failed:', error.message);
    submitting.current = false;
  };

  return (
    <View style={styles.root}>
      <PageBackground layer1={BG1} layer2={BG2} opacity2={0.45} />
      {loading ? (
        <View style={styles.center}><ActivityIndicator color={C.accent} /></View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled">
          <View style={styles.content}>
            <Text style={styles.title}>To Do</Text>
            {items.length === 0 && (
              <Text style={styles.empty}>nothing to do</Text>
            )}
            {items.map((item) => (
              <View key={item.id} style={styles.row}>
                <Pressable onPress={() => complete(item)} hitSlop={8}>
                  <View style={styles.circle} />
                </Pressable>
                {editingId === item.id ? (
                  <TextInput
                    style={[styles.input, styles.editInput]}
                    value={editText}
                    onChangeText={setEditText}
                    onSubmitEditing={saveEdit}
                    onBlur={saveEdit}
                    autoFocus
                    returnKeyType="done"
                  />
                ) : (
                  <Pressable style={{ flex: 1 }} onPress={() => startEdit(item)}>
                    <Text style={styles.itemText}>{item.text}</Text>
                  </Pressable>
                )}
              </View>
            ))}
            <View style={styles.addRow}>
              {adding ? (
                <TextInput
                  style={styles.input}
                  value={newText}
                  onChangeText={setNewText}
                  onSubmitEditing={add}
                  onBlur={add}
                  placeholder="new entry..."
                  placeholderTextColor={C.muted}
                  autoFocus
                  returnKeyType="done"
                />
              ) : (
                <Pressable
                  onPress={() => setAdding(true)}
                  style={({ pressed }) => [{ opacity: pressed ? 0.5 : 1 }]}>
                  <Text style={styles.addText}>+ add new entry</Text>
                </Pressable>
              )}
            </View>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: {
    flexGrow: 1,
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 60,
    paddingBottom: 64,
  },
  content: { width: '100%', maxWidth: 400 },
  title: {
    fontSize: 17,
    fontWeight: '600',
    color: C.text,
    letterSpacing: -0.3,
    marginBottom: 20,
  },
  empty: { fontSize: 11, color: C.muted, marginTop: 8, marginBottom: 16 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 15,
    gap: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
  },
  circle: {
    width: 18, height: 18, borderRadius: 9,
    borderWidth: 1.5,
    borderColor: 'rgba(30,24,38,0.3)',
  },
  itemText: {
    flex: 1, fontSize: 11, color: C.text, fontWeight: '400', letterSpacing: -0.1,
  },
  addRow: {
    paddingTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.border,
  },
  addText: { fontSize: 11, color: C.muted, fontWeight: '500' },
  input: {
    fontSize: 16, color: C.text, paddingVertical: 2,
    borderBottomWidth: 1.5, borderBottomColor: C.accent,
    outlineStyle: 'none',
  } as any,
  editInput: { flex: 1, fontSize: 11 },
});
