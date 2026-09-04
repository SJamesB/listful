import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import { Text } from '@/components/Text';
import { TextInput } from '@/components/TextInput';
import { useSectionEdgeScroll, type EdgesChangeHandler } from '@/hooks/use-section-edge-scroll';
import { type CategoryConfig } from '@/lib/logCategories';
import { supabase } from '@/lib/supabase';

const TEXT = '#1A1626';
const MUTED = 'rgba(26,22,38,0.45)';
const BORDER = 'rgba(26,22,38,0.12)';
const RATINGS = Array.from({ length: 20 }, (_, i) => (i + 1) * 0.5);
const THIS_YEAR = new Date().getFullYear();

const fmtRating = (r: number | null) => r == null ? null : `${r}/10`;

interface LogEntry {
  id: string;
  title: string;
  subtitle: string | null;
  rating: number | null;
  year: number | null;
  tags: string[] | null;
}

interface Props {
  config: CategoryConfig;
  onEdgesChange?: EdgesChangeHandler;
}

function EntryForm({
  title, onTitle, subtitle, onSubtitle, year, onYear,
  rating, onRating, tags, onToggleTag,
  availableTags, accent,
  onSave, onCancel, onDelete,
}: {
  title: string; onTitle: (v: string) => void;
  subtitle: string; onSubtitle: (v: string) => void;
  year: string; onYear: (v: string) => void;
  rating: number | null; onRating: (v: number | null) => void;
  tags: string[]; onToggleTag: (t: string) => void;
  availableTags: string[]; accent: string;
  onSave: () => void; onCancel: () => void; onDelete?: () => void;
}) {
  return (
    <View style={styles.form}>
      <TextInput
        style={[styles.input, { borderBottomColor: accent }]}
        value={title}
        onChangeText={onTitle}
        autoFocus
        returnKeyType="next"
      />
      <TextInput
        style={styles.input}
        value={subtitle}
        onChangeText={onSubtitle}
        placeholderTextColor={MUTED}
        returnKeyType="next"
      />
      <TextInput
        style={[styles.input, styles.inputNarrow]}
        value={year}
        onChangeText={onYear}
        placeholder="Year"
        placeholderTextColor={MUTED}
        keyboardType="numeric"
        maxLength={4}
        returnKeyType="next"
      />
      {availableTags.length > 0 && (
        <View style={styles.tagRow}>
          {availableTags.map((tag) => {
            const active = tags.includes(tag);
            return (
              <Pressable
                key={tag}
                onPress={() => onToggleTag(tag)}
                style={[styles.tagBtn, active && { backgroundColor: accent, borderColor: accent }]}>
                <Text style={[styles.tagText, { color: active ? '#FFF' : MUTED }]}>{tag}</Text>
              </Pressable>
            );
          })}
        </View>
      )}
      <View style={styles.ratingRow}>
        {RATINGS.map((n) => (
          <Pressable
            key={n}
            onPress={() => onRating(rating === n ? null : n)}
            style={[styles.ratingBtn, rating === n && { backgroundColor: accent, borderColor: accent }]}>
            <Text style={[styles.ratingText, { color: rating === n ? '#FFF' : MUTED }]}>{String(n)}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.formActions}>
        <View style={{ flexDirection: 'row', gap: 16 }}>
          {onDelete && (
            <Pressable onPress={onDelete}>
              <Text style={styles.deleteText}>delete</Text>
            </Pressable>
          )}
          <Pressable onPress={onCancel}>
            <Text style={styles.cancelText}>cancel</Text>
          </Pressable>
        </View>
        <Pressable onPress={onSave} style={[styles.saveBtn, { backgroundColor: accent }]}>
          <Text style={styles.saveBtnText}>save</Text>
        </Pressable>
      </View>
    </View>
  );
}

export function LogPage({ config, onEdgesChange }: Props) {
  const edgeScroll = useSectionEdgeScroll(onEdgesChange);
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  // Add form
  const [adding, setAdding] = useState(false);
  const [fTitle, setFTitle] = useState('');
  const [fSub, setFSub] = useState('');
  const [fYear, setFYear] = useState(String(THIS_YEAR));
  const [fRating, setFRating] = useState<number | null>(null);
  const [fTags, setFTags] = useState<string[]>([]);

  // Edit form
  const [editingId, setEditingId] = useState<string | null>(null);
  const [eTitle, setETitle] = useState('');
  const [eSub, setESub] = useState('');
  const [eYear, setEYear] = useState('');
  const [eRating, setERating] = useState<number | null>(null);
  const [eTags, setETags] = useState<string[]>([]);

  const submitting = useRef(false);
  const availableTags = config.tags ?? [];

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('logs')
      .select('id, title, subtitle, rating, year, tags')
      .eq('category', config.key)
      .order('year', { ascending: false, nullsFirst: false })
      .order('sort_order', { ascending: false, nullsFirst: false });
    if (!error) setEntries(data ?? []);
    setLoading(false);
  }, [config.key]);

  useEffect(() => { load(); }, [load]);

  // ── Add ────────────────────────────────────────────────────────────────────
  const openAdd = () => { setEditingId(null); setAdding(true); };

  const saveAdd = async () => {
    if (submitting.current) return;
    const title = fTitle.trim();
    if (!title) return;
    submitting.current = true;
    const { data: maxData } = await supabase
      .from('logs').select('sort_order').eq('category', config.key)
      .order('sort_order', { ascending: false }).limit(1).single();
    const nextOrder = ((maxData?.sort_order ?? 0) as number) + 1;
    const { data, error } = await supabase.from('logs')
      .insert({ category: config.key, title, subtitle: fSub.trim() || null,
        year: fYear ? parseInt(fYear, 10) : THIS_YEAR, rating: fRating,
        tags: fTags.length > 0 ? fTags : null, sort_order: nextOrder })
      .select('id, title, subtitle, rating, year, tags').single();
    if (!error && data) {
      setEntries((prev) => [data, ...prev]);
      setFTitle(''); setFSub(''); setFYear(String(THIS_YEAR)); setFRating(null); setFTags([]);
      setAdding(false);
    } else if (error) console.error('save failed:', error.message);
    submitting.current = false;
  };

  const cancelAdd = () => {
    setFTitle(''); setFSub(''); setFYear(String(THIS_YEAR)); setFRating(null); setFTags([]);
    setAdding(false);
  };

  // ── Edit ───────────────────────────────────────────────────────────────────
  const startEdit = (entry: LogEntry) => {
    setAdding(false);
    setEditingId(entry.id);
    setETitle(entry.title);
    setESub(entry.subtitle ?? '');
    setEYear(entry.year != null ? String(entry.year) : '');
    setERating(entry.rating ?? null);
    setETags(entry.tags ?? []);
  };

  const cancelEdit = () => setEditingId(null);

  const saveEdit = async () => {
    const id = editingId;
    if (!id) return;
    const title = eTitle.trim();
    if (!title) return;
    const patch = {
      title,
      subtitle: eSub.trim() || null,
      year: eYear ? parseInt(eYear, 10) : null,
      rating: eRating,
      tags: eTags.length > 0 ? eTags : null,
    };
    const { error } = await supabase.from('logs').update(patch).eq('id', id);
    if (!error) {
      setEntries((prev) => prev.map((e) => e.id === id ? { ...e, ...patch } : e));
      setEditingId(null);
    } else console.error('update failed:', error.message);
  };

  const deleteEntry = async (id: string) => {
    const { error } = await supabase.from('logs').delete().eq('id', id);
    if (!error) { setEntries((prev) => prev.filter((e) => e.id !== id)); setEditingId(null); }
    else console.error('delete failed:', error.message);
  };

  return (
    <View style={styles.root}>
      {loading ? (
        <View style={styles.center}><ActivityIndicator color={config.accent} /></View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled" {...edgeScroll}>
          <View style={styles.content}>

            <View style={styles.header}>
              <Text style={styles.pageTitle}>{config.title}</Text>
              {entries.length > 0 && <Text style={styles.count}>{entries.length}</Text>}
            </View>

            {/* Add row */}
            <View style={styles.addRow}>
              {adding ? (
                <EntryForm
                  title={fTitle} onTitle={setFTitle}
                  subtitle={fSub} onSubtitle={setFSub}
                  year={fYear} onYear={setFYear}
                  rating={fRating} onRating={setFRating}
                  tags={fTags} onToggleTag={(t) => setFTags((p) => p.includes(t) ? p.filter((x) => x !== t) : [...p, t])}
                  availableTags={availableTags} accent={config.accent}
                  onSave={saveAdd} onCancel={cancelAdd}
                />
              ) : editingId === null ? (
                <Pressable onPress={openAdd} style={({ pressed }) => [{ opacity: pressed ? 0.5 : 1 }]}>
                  <Text style={styles.addText}>+ add entry</Text>
                </Pressable>
              ) : null}
            </View>

            {entries.length === 0 && !adding && (
              <Text style={styles.empty}>no entries yet</Text>
            )}

            {entries.map((entry) =>
              editingId === entry.id ? (
                <View key={entry.id} style={styles.editContainer}>
                  <EntryForm
                    title={eTitle} onTitle={setETitle}
                    subtitle={eSub} onSubtitle={setESub}
                    year={eYear} onYear={setEYear}
                    rating={eRating} onRating={setERating}
                    tags={eTags} onToggleTag={(t) => setETags((p) => p.includes(t) ? p.filter((x) => x !== t) : [...p, t])}
                    availableTags={availableTags} accent={config.accent}
                    onSave={saveEdit} onCancel={cancelEdit}
                    onDelete={() => deleteEntry(entry.id)}
                  />
                </View>
              ) : (
                <Pressable key={entry.id} onPress={() => startEdit(entry)}
                  style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}>
                  <View style={styles.rowMain}>
                    <Text style={styles.entryTitle} numberOfLines={1}>{entry.title}</Text>
                    {entry.subtitle ? <Text style={styles.entrySub} numberOfLines={1}>{entry.subtitle}</Text> : null}
                    {entry.tags && entry.tags.length > 0
                      ? <Text style={styles.entryTags}>{entry.tags.join(' · ')}</Text> : null}
                  </View>
                  <View style={styles.rowMeta}>
                    {entry.year ? <Text style={styles.metaYear}>{entry.year}</Text> : null}
                    {entry.rating != null
                      ? <Text style={[styles.metaRating, { color: config.accent }]}>{fmtRating(entry.rating)}</Text> : null}
                  </View>
                </Pressable>
              )
            )}

          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scroll: { flexGrow: 1, alignItems: 'center', paddingHorizontal: 24, paddingTop: 60, paddingBottom: 64 },
  content: { width: '100%', maxWidth: 400 },
  header: { flexDirection: 'row', alignItems: 'baseline', gap: 10, marginBottom: 24 },
  pageTitle: { fontSize: 17, fontWeight: '600', color: TEXT, letterSpacing: -0.3 },
  count: { fontSize: 11, fontWeight: '500', color: MUTED },
  empty: { fontSize: 11, color: MUTED, marginBottom: 16 },
  row: {
    flexDirection: 'row', alignItems: 'flex-start',
    paddingVertical: 12, gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BORDER,
  },
  editContainer: {
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BORDER,
  },
  rowMain: { flex: 1 },
  entryTitle: { fontSize: 11, fontWeight: '500', color: TEXT, letterSpacing: -0.1 },
  entrySub: { fontSize: 10, color: MUTED, marginTop: 1 },
  entryTags: { fontSize: 9, color: MUTED, marginTop: 2, letterSpacing: 0.2 },
  rowMeta: { alignItems: 'flex-end', gap: 2 },
  metaYear: { fontSize: 10, color: MUTED, fontWeight: '500' },
  metaRating: { fontSize: 10, fontWeight: '600' },
  addRow: { paddingBottom: 16, marginBottom: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BORDER },
  addText: { fontSize: 11, color: MUTED, fontWeight: '500' },
  form: { gap: 16 },
  input: {
    fontSize: 16, color: TEXT, paddingVertical: 4,
    borderBottomWidth: 1.5, borderBottomColor: BORDER, outlineStyle: 'none',
  } as any,
  inputNarrow: { width: 90 },
  tagRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  tagBtn: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1, borderColor: BORDER },
  tagText: { fontSize: 12, fontWeight: '500' },
  ratingRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  ratingBtn: {
    minWidth: 34, height: 28, paddingHorizontal: 4, borderRadius: 5,
    borderWidth: 1, borderColor: BORDER, alignItems: 'center', justifyContent: 'center',
  },
  ratingText: { fontSize: 11, fontWeight: '600' },
  formActions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  deleteText: { fontSize: 13, color: '#DC2626', fontWeight: '500' },
  cancelText: { fontSize: 13, color: MUTED, fontWeight: '500' },
  saveBtn: { paddingHorizontal: 20, paddingVertical: 8, borderRadius: 20 },
  saveBtnText: { fontSize: 13, color: '#FFF', fontWeight: '600' },
});
