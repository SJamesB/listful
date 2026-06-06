import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';

import { supabase } from '@/lib/supabase';

const C = {
  text: '#2C1A0E',
  muted: 'rgba(44,26,14,0.45)',
  surface: 'rgba(255,255,255,0.85)',
  accent: '#D97706',
  danger: '#DC2626',
  subdued: '#78716C',
} as const;

const PASTELS = [
  '#FEF9C3', // soft yellow
  '#FCE7F3', // soft pink
  '#DBEAFE', // soft blue
  '#D1FAE5', // soft green
  '#EDE9FE', // soft purple
  '#FEF3C7', // soft amber
  '#CCFBF1', // soft teal
  '#FFE4E6', // soft rose
];

function noteColor(id: string): string {
  const hash = id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return PASTELS[hash % PASTELS.length];
}

interface Note {
  id: string;
  title: string;
  content: string;
  created_at: string;
}

interface ArchivedNote extends Note {
  archived_at: string;
}

const CREATE_ID = '__create__' as const;
type ListItem = Note | { id: typeof CREATE_ID };

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

// ─── Note card ───────────────────────────────────────────────────────────────

function NoteCard({
  note, width, onUpdate, onArchive, onDelete,
}: {
  note: Note;
  width: number;
  onUpdate: (id: string, patch: Partial<Note>) => void;
  onArchive: (note: Note) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <View style={[styles.page, { width }]}>
      <View style={[styles.card, { backgroundColor: noteColor(note.id) }]}>
        <TextInput
          style={styles.titleInput}
          value={note.title}
          onChangeText={(v) => onUpdate(note.id, { title: v })}
          placeholder="Title"
          placeholderTextColor={C.muted}
          returnKeyType="next"
        />
        <View style={styles.cardDivider} />
        <TextInput
          style={styles.contentInput}
          value={note.content}
          onChangeText={(v) => onUpdate(note.id, { content: v })}
          placeholder="Start writing…"
          placeholderTextColor={C.muted}
          multiline
          textAlignVertical="top"
          scrollEnabled
        />
        <Text style={styles.dateText}>{formatDate(note.created_at)}</Text>
        <View style={styles.noteActions}>
          <Pressable hitSlop={8} onPress={() => onArchive(note)}>
            <Text style={[styles.actionText, { color: C.subdued }]}>Archive</Text>
          </Pressable>
          <Pressable hitSlop={8} onPress={() => onDelete(note.id)}>
            <Text style={[styles.actionText, { color: C.danger }]}>Delete</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

// ─── Create slot ─────────────────────────────────────────────────────────────

function CreateSlot({ width, onPress }: { width: number; onPress: () => void }) {
  return (
    <View style={[styles.page, styles.createPage, { width }]}>
      <Pressable style={styles.createInner} onPress={onPress}>
        <Text style={styles.createPlus}>+</Text>
        <Text style={styles.createLabel}>New note</Text>
      </Pressable>
    </View>
  );
}

// ─── Archive view ─────────────────────────────────────────────────────────────

function ArchiveView({
  notes: archivedNotes,
  onBack,
  onRestore,
  onDelete,
}: {
  notes: ArchivedNote[];
  onBack: () => void;
  onRestore: (note: ArchivedNote) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Pressable onPress={onBack} hitSlop={12} style={styles.headerSide}>
          <Text style={styles.backBtn}>‹ Notes</Text>
        </Pressable>
        <Text style={styles.heading}>Archive</Text>
        <View style={styles.headerSide} />
      </View>
      <FlatList
        data={archivedNotes}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.archiveList}
        ListEmptyComponent={<Text style={styles.emptyText}>Archive is empty</Text>}
        renderItem={({ item }) => (
          <View style={[styles.archiveCard, { backgroundColor: noteColor(item.id) }]}>
            <Text style={styles.archiveTitle} numberOfLines={1}>
              {item.title || 'Untitled'}
            </Text>
            {!!item.content && (
              <Text style={styles.archiveContent} numberOfLines={2}>
                {item.content}
              </Text>
            )}
            <Text style={styles.archiveMeta}>
              Created {formatDate(item.created_at)} · Archived {formatDate(item.archived_at)}
            </Text>
            <View style={styles.archiveActions}>
              <Pressable hitSlop={8} onPress={() => onRestore(item)}>
                <Text style={[styles.actionText, { color: C.accent }]}>Restore</Text>
              </Pressable>
              <Pressable hitSlop={8} onPress={() => onDelete(item.id)}>
                <Text style={[styles.actionText, { color: C.danger }]}>Delete</Text>
              </Pressable>
            </View>
          </View>
        )}
      />
    </View>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function NotesPage() {
  const { width } = useWindowDimensions();
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewArchive, setViewArchive] = useState(false);
  const [archived, setArchived] = useState<ArchivedNote[]>([]);

  const flatRef = useRef<FlatList<ListItem>>(null);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const creating = useRef(false);
  const currentIdxRef = useRef(0);

  useEffect(() => {
    supabase
      .from('notes')
      .select('*')
      .order('created_at')
      .then(({ data }) => {
        setNotes(data ?? []);
        setLoading(false);
      });
  }, []);

  const scheduleUpdate = useCallback((id: string, patch: Partial<Note>) => {
    if (timers.current.has(id)) clearTimeout(timers.current.get(id)!);
    timers.current.set(
      id,
      setTimeout(async () => {
        timers.current.delete(id);
        await supabase.from('notes').update(patch).eq('id', id);
      }, 600),
    );
  }, []);

  const updateNote = useCallback(
    (id: string, patch: Partial<Note>) => {
      setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, ...patch } : n)));
      scheduleUpdate(id, patch);
    },
    [scheduleUpdate],
  );

  const handleCreate = useCallback(async () => {
    if (creating.current) return;
    const blankIdx = notes.findIndex((n) => !n.title.trim() && !n.content.trim());
    if (blankIdx !== -1) {
      flatRef.current?.scrollToIndex({ index: blankIdx, animated: true });
      return;
    }
    creating.current = true;
    const { data } = await supabase
      .from('notes')
      .insert({ title: '', content: '' })
      .select()
      .single();
    creating.current = false;
    if (data) setNotes((prev) => [...prev, data]);
  }, [notes]);

  const handleArchive = useCallback(async (note: Note) => {
    if (timers.current.has(note.id)) {
      clearTimeout(timers.current.get(note.id)!);
      timers.current.delete(note.id);
    }
    await supabase.from('notes_archive').insert({
      id: note.id,
      title: note.title,
      content: note.content,
      created_at: note.created_at,
    });
    await supabase.from('notes').delete().eq('id', note.id);
    setNotes((prev) => {
      const next = prev.filter((n) => n.id !== note.id);
      const scrollTo = Math.max(0, currentIdxRef.current - 1);
      setTimeout(() => flatRef.current?.scrollToIndex({ index: scrollTo, animated: true }), 50);
      return next;
    });
  }, []);

  const handleDelete = useCallback(async (id: string) => {
    if (timers.current.has(id)) {
      clearTimeout(timers.current.get(id)!);
      timers.current.delete(id);
    }
    await supabase.from('notes').delete().eq('id', id);
    setNotes((prev) => {
      const next = prev.filter((n) => n.id !== id);
      const scrollTo = Math.max(0, currentIdxRef.current - 1);
      setTimeout(() => flatRef.current?.scrollToIndex({ index: scrollTo, animated: true }), 50);
      return next;
    });
  }, []);

  const openArchive = useCallback(async () => {
    const { data } = await supabase
      .from('notes_archive')
      .select('*')
      .order('archived_at', { ascending: false });
    setArchived(data ?? []);
    setViewArchive(true);
  }, []);

  const handleRestore = useCallback(async (note: ArchivedNote) => {
    const { data } = await supabase
      .from('notes')
      .insert({
        id: note.id,
        title: note.title,
        content: note.content,
        created_at: note.created_at,
      })
      .select()
      .single();
    await supabase.from('notes_archive').delete().eq('id', note.id);
    setArchived((prev) => prev.filter((n) => n.id !== note.id));
    if (data) setNotes((prev) => [...prev, data]);
  }, []);

  const handleDeleteArchived = useCallback(async (id: string) => {
    await supabase.from('notes_archive').delete().eq('id', id);
    setArchived((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const listData = useMemo<ListItem[]>(
    () => [...notes, { id: CREATE_ID }],
    [notes],
  );

  const getItemLayout = useCallback(
    (_: unknown, index: number) => ({ length: width, offset: width * index, index }),
    [width],
  );

  const renderItem = useCallback(
    ({ item }: { item: ListItem }) => {
      if (item.id === CREATE_ID) {
        return <CreateSlot width={width} onPress={handleCreate} />;
      }
      return (
        <NoteCard
          note={item as Note}
          width={width}
          onUpdate={updateNote}
          onArchive={handleArchive}
          onDelete={handleDelete}
        />
      );
    },
    [width, handleCreate, updateNote, handleArchive, handleDelete],
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={C.accent} />
      </View>
    );
  }

  if (viewArchive) {
    return (
      <ArchiveView
        notes={archived}
        onBack={() => setViewArchive(false)}
        onRestore={handleRestore}
        onDelete={handleDeleteArchived}
      />
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.root}
    >
      <View style={styles.header}>
        <View style={styles.headerSide} />
        <Text style={styles.heading}>Notes</Text>
        <Pressable onPress={openArchive} hitSlop={12} style={styles.headerSide}>
          <Text style={styles.archiveLink}>Archive</Text>
        </Pressable>
      </View>
      <FlatList
        ref={flatRef}
        data={listData}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        getItemLayout={getItemLayout}
        keyboardShouldPersistTaps="handled"
        onMomentumScrollEnd={(e) => {
          const idx = Math.round(e.nativeEvent.contentOffset.x / width);
          currentIdxRef.current = idx;
          if (idx === notes.length) handleCreate();
        }}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 60,
    paddingTop: 16,
    paddingBottom: 8,
  },
  headerSide: { width: 70 },
  heading: {
    fontSize: 20,
    fontWeight: '700',
    color: C.text,
    textAlign: 'center',
  },
  archiveLink: {
    fontSize: 14,
    color: C.subdued,
    fontWeight: '500',
    textAlign: 'right',
  },
  backBtn: {
    fontSize: 16,
    color: C.text,
    fontWeight: '500',
  },

  // Note pager
  page: {
    flex: 1,
    paddingHorizontal: 28,
    paddingBottom: 28,
    paddingTop: 8,
  },
  card: {
    flex: 1,
    borderRadius: 20,
    padding: 20,
  },
  titleInput: {
    fontSize: 22,
    fontWeight: '700',
    color: C.text,
    padding: 0,
    marginBottom: 10,
  },
  cardDivider: {
    height: 1,
    backgroundColor: 'rgba(44,26,14,0.1)',
    marginBottom: 12,
  },
  contentInput: {
    flex: 1,
    fontSize: 16,
    color: C.text,
    lineHeight: 24,
    padding: 0,
    textAlignVertical: 'top',
  },
  dateText: {
    fontSize: 12,
    color: C.muted,
    marginTop: 12,
    marginBottom: 10,
  },
  noteActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  actionText: {
    fontSize: 14,
    fontWeight: '600',
  },

  // Create slot
  createPage: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  createInner: {
    alignItems: 'center',
    padding: 32,
  },
  createPlus: {
    fontSize: 56,
    color: C.muted,
    lineHeight: 64,
  },
  createLabel: {
    fontSize: 16,
    color: C.muted,
    marginTop: 8,
  },

  // Archive list
  archiveList: {
    padding: 16,
    gap: 12,
  },
  archiveCard: {
    backgroundColor: C.surface,
    borderRadius: 16,
    padding: 16,
  },
  archiveTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: C.text,
    marginBottom: 4,
  },
  archiveContent: {
    fontSize: 14,
    color: C.muted,
    lineHeight: 20,
    marginBottom: 8,
  },
  archiveMeta: {
    fontSize: 12,
    color: C.muted,
    marginBottom: 10,
  },
  archiveActions: {
    flexDirection: 'row',
    gap: 16,
  },
  emptyText: {
    textAlign: 'center',
    color: C.muted,
    marginTop: 60,
    fontSize: 16,
  },
});
