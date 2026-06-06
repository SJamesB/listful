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

import { supabase } from '@/lib/supabase';

const C = {
  text: '#1A1626',
  muted: 'rgba(26,22,38,0.45)',
  border: 'rgba(26,22,38,0.12)',
  accent: '#7C3AED',
} as const;

type Tag = 'Book' | 'TV' | 'Game';
const TAGS: Tag[] = ['Book', 'TV', 'Game'];
const TAG_EMOJI: Record<Tag, string> = { Book: '📖', TV: '📺', Game: '🎮' };
const TAG_BADGE: Record<Tag, string> = {
  Book: 'rgba(167,243,208,0.85)',
  TV:   'rgba(253,224,132,0.85)',
  Game: 'rgba(251,207,232,0.85)',
};

const TWO_DAYS = () => new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();

interface EntertainmentItem { id: string; text: string; tag: Tag; created_at: string; sort_order: number | null; }
interface LogItem { id: string; text: string; tag: Tag; completed_at: string; }

export default function EntertainmentPage() {
  const [items, setItems] = useState<EntertainmentItem[]>([]);
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newText, setNewText] = useState('');
  const [newTag, setNewTag] = useState<Tag>('TV');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [editTag, setEditTag] = useState<Tag>('TV');
  const [recentOpen, setRecentOpen] = useState(false);
  const submitting = useRef(false);

  const load = useCallback(async () => {
    const [{ data: active }, { data: recent }] = await Promise.all([
      supabase.from('entertainment').select('*')
        .order('sort_order', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: true }),
      supabase.from('entertainment_logs').select('*')
        .gte('completed_at', TWO_DAYS())
        .order('completed_at', { ascending: false }),
    ]);
    if (active) setItems(active);
    if (recent) setLogs(recent);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const complete = async (item: EntertainmentItem) => {
    setItems((prev) => prev.filter((i) => i.id !== item.id));
    const { data: log } = await supabase.from('entertainment_logs')
      .insert({ text: item.text, tag: item.tag, completed_at: new Date().toISOString() })
      .select().single();
    await supabase.from('entertainment').delete().eq('id', item.id);
    if (log) setLogs((prev) => [log, ...prev]);
  };

  const uncomplete = async (log: LogItem) => {
    setLogs((prev) => prev.filter((l) => l.id !== log.id));
    await supabase.from('entertainment_logs').delete().eq('id', log.id);
    const { data } = await supabase.from('entertainment')
      .insert({ text: log.text, tag: log.tag, sort_order: items.length }).select().single();
    if (data) setItems((prev) => [...prev, data]);
  };

  const startEdit = (item: EntertainmentItem) => {
    setAdding(false); setEditingId(item.id); setEditText(item.text); setEditTag(item.tag);
  };

  const saveEdit = async () => {
    const id = editingId;
    if (!id) return;
    const text = editText.trim();
    if (!text) { setEditingId(null); return; }
    await supabase.from('entertainment').update({ text, tag: editTag }).eq('id', id);
    setItems((prev) => prev.map((i) => i.id === id ? { ...i, text, tag: editTag } : i));
    setEditingId(null);
  };

  const add = async () => {
    if (submitting.current) return;
    const text = newText.trim();
    if (!text) { setAdding(false); return; }
    submitting.current = true;
    setNewText(''); setAdding(false);
    const { data, error } = await supabase.from('entertainment')
      .insert({ text, tag: newTag, sort_order: items.length }).select().single();
    if (!error && data) setItems((prev) => [...prev, data]);
    else if (error) console.error('add failed:', error.message);
    submitting.current = false;
  };

  const onDragEnd = async ({ data: newOrder }: { data: EntertainmentItem[] }) => {
    setItems(newOrder);
    await Promise.all(
      newOrder.map((item, index) =>
        supabase.from('entertainment').update({ sort_order: index }).eq('id', item.id)
      )
    );
  };

  const renderItem = ({ item, drag, isActive }: RenderItemParams<EntertainmentItem>) => (
    <ScaleDecorator>
      <View style={[styles.row, isActive && { opacity: 0.8 }]}>
        <Pressable onPress={() => complete(item)} hitSlop={8}>
          <View style={styles.circle} />
        </Pressable>
        {editingId === item.id ? (
          <View style={{ flex: 1, gap: 10 }}>
            <TextInput
              style={[styles.input, { borderBottomColor: C.accent }]}
              value={editText}
              onChangeText={setEditText}
              onSubmitEditing={saveEdit}
              autoFocus
              returnKeyType="done"
            />
            <View style={styles.tagRow}>
              {TAGS.map((t) => (
                <Pressable key={t} onPress={() => setEditTag(t)}
                  style={[styles.tagBtn, editTag === t && styles.tagBtnActive]}>
                  <Text style={[styles.tagBtnText, editTag === t && styles.tagBtnTextActive]}>
                    {TAG_EMOJI[t]} {t}
                  </Text>
                </Pressable>
              ))}
            </View>
            <View style={{ flexDirection: 'row', gap: 16 }}>
              <Pressable onPress={() => setEditingId(null)}>
                <Text style={{ fontSize: 14, color: C.muted }}>cancel</Text>
              </Pressable>
              <Pressable onPress={saveEdit}>
                <Text style={{ fontSize: 14, color: C.accent, fontWeight: '600' }}>save</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <Pressable style={{ flex: 1 }} onPress={() => startEdit(item)}
            onLongPress={drag} delayLongPress={300}>
            <Text style={styles.itemText}>{item.text}</Text>
          </Pressable>
        )}
        {editingId !== item.id && (
          <View style={[styles.badge, { backgroundColor: TAG_BADGE[item.tag] }]}>
            <Text style={styles.badgeText}>{TAG_EMOJI[item.tag]} {item.tag}</Text>
          </View>
        )}
      </View>
    </ScaleDecorator>
  );

  const header = (
    <View style={styles.block}>
      <Text style={styles.title}>🦚 La Dolce Vita</Text>
      {items.length === 0 && !adding && (
        <Text style={styles.empty}>nothing on the list</Text>
      )}
      <View style={styles.addRow}>
        {adding ? (
          <View style={styles.addForm}>
            <TextInput
              style={styles.input}
              value={newText}
              onChangeText={setNewText}
              onSubmitEditing={add}
              placeholder="title..."
              placeholderTextColor={C.muted}
              autoFocus
              returnKeyType="done"
            />
            <View style={styles.tagRow}>
              {TAGS.map((t) => (
                <Pressable key={t} onPress={() => setNewTag(t)}
                  style={[styles.tagBtn, newTag === t && styles.tagBtnActive]}>
                  <Text style={[styles.tagBtnText, newTag === t && styles.tagBtnTextActive]}>
                    {TAG_EMOJI[t]} {t}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Pressable onPress={add} style={styles.saveBtn}>
              <Text style={styles.saveBtnText}>add</Text>
            </Pressable>
          </View>
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
          <View style={[styles.badge, { backgroundColor: TAG_BADGE[log.tag] }]}>
            <Text style={styles.badgeText}>{TAG_EMOJI[log.tag]} {log.tag}</Text>
          </View>
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
    paddingVertical: 14, gap: 14,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border,
    alignSelf: 'center', width: '100%', maxWidth: ROW_MAX, paddingHorizontal: 24,
  },
  circle: {
    width: 18, height: 18, borderRadius: 9,
    borderWidth: 1.5, borderColor: 'rgba(26,22,38,0.3)',
  },
  itemText: { flex: 1, fontSize: 14, color: C.text, fontWeight: '400', letterSpacing: -0.1 },
  badge: { borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2 },
  badgeText: { fontSize: 11, color: C.text, fontWeight: '500' },
  addRow: {
    paddingTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border,
  },
  addText: { fontSize: 14, color: C.muted, fontWeight: '500' },
  addForm: { gap: 14 },
  input: {
    fontSize: 16, color: C.text, paddingVertical: 2,
    borderBottomWidth: 1.5, borderBottomColor: C.accent,
    outlineStyle: 'none',
  } as any,
  tagRow: { flexDirection: 'row', gap: 8 },
  tagBtn: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.35)',
    borderWidth: 1, borderColor: 'rgba(26,22,38,0.12)',
  },
  tagBtnActive: { backgroundColor: 'rgba(124,58,237,0.2)', borderColor: C.accent },
  tagBtnText: { fontSize: 13, color: C.muted, fontWeight: '500' },
  tagBtnTextActive: { color: C.accent },
  saveBtn: {
    alignSelf: 'flex-start', paddingHorizontal: 20, paddingVertical: 8,
    borderRadius: 20, backgroundColor: C.accent,
  },
  saveBtnText: { fontSize: 13, color: '#FFFFFF', fontWeight: '600' },
  recentHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 14, marginTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border,
  },
  recentTitle: { fontSize: 13, fontWeight: '600', color: C.muted },
  chevron: { fontSize: 11, color: C.muted },
  recentRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border,
  },
  recentText: { flex: 1, fontSize: 14, color: C.muted, textDecorationLine: 'line-through' },
  undo: { fontSize: 15, color: C.muted },
});
