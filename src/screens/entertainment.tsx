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

// Electric Dreams: indigo → violet → cyan, with magenta-rose overlay
const BG1 = ['#A5B4FC', '#C084FC', '#67E8F9', '#A78BFA'] as const;
const BG2 = ['#F0ABFC', '#FDE68A', 'transparent'] as const;

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

interface EntertainmentItem {
  id: string;
  text: string;
  tag: Tag;
  created_at: string;
}

export default function EntertainmentPage() {
  const [items, setItems] = useState<EntertainmentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newText, setNewText] = useState('');
  const [newTag, setNewTag] = useState<Tag>('TV');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [editTag, setEditTag] = useState<Tag>('TV');
  const submitting = useRef(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('entertainment')
      .select('*')
      .order('created_at', { ascending: true });
    if (!error) setItems(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const complete = async (item: EntertainmentItem) => {
    setItems((prev) => prev.filter((i) => i.id !== item.id));
    await supabase.from('entertainment_logs').insert({
      text: item.text,
      tag: item.tag,
      completed_at: new Date().toISOString(),
    });
    const { error } = await supabase.from('entertainment').delete().eq('id', item.id);
    if (error) console.error('complete failed:', error.message);
  };

  const startEdit = (item: EntertainmentItem) => {
    setAdding(false);
    setEditingId(item.id);
    setEditText(item.text);
    setEditTag(item.tag);
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
    setNewText('');
    setAdding(false);
    const { data, error } = await supabase
      .from('entertainment')
      .insert({ text, tag: newTag })
      .select()
      .single();
    if (!error && data) setItems((prev) => [...prev, data]);
    else if (error) console.error('add failed:', error.message);
    submitting.current = false;
  };

  return (
    <View style={styles.root}>
      <PageBackground layer1={BG1} layer2={BG2} opacity2={0.5} />
      {loading ? (
        <View style={styles.center}><ActivityIndicator color={C.accent} /></View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled">
          <View style={styles.content}>
            <Text style={styles.title}>Entertainment</Text>

            {items.length === 0 && (
              <Text style={styles.empty}>nothing on the list</Text>
            )}

            {items.map((item) => (
              <View key={item.id} style={styles.row}>
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
                        <Pressable
                          key={t}
                          onPress={() => setEditTag(t)}
                          style={[styles.tagBtn, editTag === t && styles.tagBtnActive]}>
                          <Text style={[styles.tagBtnText, editTag === t && styles.tagBtnTextActive]}>
                            {TAG_EMOJI[t]} {t}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                    <View style={{ flexDirection: 'row', gap: 16 }}>
                      <Pressable onPress={() => setEditingId(null)}>
                        <Text style={{ fontSize: 12, color: C.muted }}>cancel</Text>
                      </Pressable>
                      <Pressable onPress={saveEdit}>
                        <Text style={{ fontSize: 12, color: C.accent, fontWeight: '600' }}>save</Text>
                      </Pressable>
                    </View>
                  </View>
                ) : (
                  <Pressable style={{ flex: 1 }} onPress={() => startEdit(item)}>
                    <Text style={styles.itemText}>{item.text}</Text>
                  </Pressable>
                )}
                {editingId !== item.id && (
                  <View style={[styles.badge, { backgroundColor: TAG_BADGE[item.tag] }]}>
                    <Text style={styles.badgeText}>{TAG_EMOJI[item.tag]} {item.tag}</Text>
                  </View>
                )}
              </View>
            ))}

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
                      <Pressable
                        key={t}
                        onPress={() => setNewTag(t)}
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
    paddingVertical: 14,
    gap: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
  },
  circle: {
    width: 18, height: 18, borderRadius: 9,
    borderWidth: 1.5, borderColor: 'rgba(26,22,38,0.3)',
  },
  itemText: { flex: 1, fontSize: 11, color: C.text, fontWeight: '400', letterSpacing: -0.1 },
  badge: {
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeText: { fontSize: 9, color: C.text, fontWeight: '500' },
  addRow: {
    paddingTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.border,
  },
  addText: { fontSize: 11, color: C.muted, fontWeight: '500' },
  addForm: { gap: 14 },
  input: {
    fontSize: 16, color: C.text, paddingVertical: 2,
    borderBottomWidth: 1.5, borderBottomColor: C.accent,
    outlineStyle: 'none',
  } as any,
  tagRow: { flexDirection: 'row', gap: 8 },
  tagBtn: {
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.35)',
    borderWidth: 1, borderColor: 'rgba(26,22,38,0.12)',
  },
  tagBtnActive: {
    backgroundColor: 'rgba(124,58,237,0.2)',
    borderColor: C.accent,
  },
  tagBtnText: { fontSize: 13, color: C.muted, fontWeight: '500' },
  tagBtnTextActive: { color: C.accent },
  saveBtn: {
    alignSelf: 'flex-start',
    paddingHorizontal: 20, paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: C.accent,
  },
  saveBtnText: { fontSize: 13, color: '#FFFFFF', fontWeight: '600' },
});
