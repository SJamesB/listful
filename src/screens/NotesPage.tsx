import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import DraggableFlatList, { RenderItemParams, ScaleDecorator } from 'react-native-draggable-flatlist';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

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

interface ChecklistItem { id: string; text: string; done: boolean; }

export interface Note {
  id: string;
  title: string;
  content: string;
  created_at: string;
  sort_order: number | null;
}

interface ArchivedNote extends Note {
  archived_at: string;
}

const genId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;

function parseContent(content: string): { type: 'text' | 'checklist'; items: ChecklistItem[] } {
  if (!content?.trim()) return { type: 'text', items: [] };
  try {
    const p = JSON.parse(content);
    if (p?.type === 'checklist' && Array.isArray(p.items)) {
      return { type: 'checklist', items: p.items };
    }
  } catch {}
  return { type: 'text', items: [] };
}

function serializeChecklist(items: ChecklistItem[]): string {
  return JSON.stringify({ type: 'checklist', items });
}

function contentPreview(content: string): string {
  const { type, items } = parseContent(content);
  if (type === 'checklist') return items.map(i => (i.done ? '✓ ' : '• ') + i.text).join('\n');
  return content;
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
  note, width, onUpdate, onArchive, onDelete, onReorder,
}: {
  note: Note;
  width: number;
  onUpdate: (id: string, patch: Partial<Note>) => void;
  onArchive: (note: Note) => void;
  onDelete: (id: string) => void;
  onReorder: () => void;
}) {
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [addingItem, setAddingItem] = useState(false);
  const [newItemText, setNewItemText] = useState('');
  const [showCompleted, setShowCompleted] = useState(false);

  const { type: noteType, items } = useMemo(() => parseContent(note.content), [note.content]);
  const isChecklist = noteType === 'checklist';
  const unchecked = isChecklist ? items.filter(i => !i.done) : [];
  const checked = isChecklist ? items.filter(i => i.done) : [];

  const updateItems = (newItems: ChecklistItem[]) =>
    onUpdate(note.id, { content: serializeChecklist(newItems) });

  const toggleItem = (id: string) => {
    const next = items.map(item => item.id === id ? { ...item, done: !item.done } : item);
    updateItems([...next.filter(i => !i.done), ...next.filter(i => i.done)]);
  };

  const saveEdit = () => {
    if (!editingItemId) return;
    const text = editText.trim();
    if (!text) updateItems(items.filter(i => i.id !== editingItemId));
    else updateItems(items.map(i => i.id === editingItemId ? { ...i, text } : i));
    setEditingItemId(null);
  };

  const addItem = () => {
    const text = newItemText.trim();
    setNewItemText('');
    setAddingItem(false);
    if (!text) return;
    updateItems([...unchecked, { id: genId(), text, done: false }, ...checked]);
  };

  const switchToChecklist = () => {
    const lines = note.content.split('\n').filter(l => l.trim());
    updateItems(lines.map(text => ({ id: genId(), text, done: false })));
  };

  const switchToText = () => {
    onUpdate(note.id, { content: items.map(i => i.text).filter(Boolean).join('\n') });
  };

  return (
    <View style={[styles.page, { width }]}>
      <View style={[styles.card, { backgroundColor: noteColor(note.id) }]}>
        <View style={styles.cardHeader}>
          <TextInput
            style={[styles.titleInput, styles.titleInputFlex]}
            value={note.title}
            onChangeText={(v) => onUpdate(note.id, { title: v })}
            placeholder="Title"
            placeholderTextColor={C.muted}
            returnKeyType="next"
          />
          <Pressable onLongPress={onReorder} delayLongPress={300} hitSlop={10} style={styles.dragHandle}>
            <Text style={styles.dragHandleText}>⠿</Text>
          </Pressable>
        </View>
        <View style={styles.cardDivider} />

        {isChecklist ? (
          <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {unchecked.map(item => (
              <View key={item.id} style={styles.checkRow}>
                <Pressable onPress={() => toggleItem(item.id)} hitSlop={8}>
                  <View style={styles.checkCircle} />
                </Pressable>
                {editingItemId === item.id ? (
                  <TextInput
                    style={styles.checkItemInput}
                    value={editText}
                    onChangeText={setEditText}
                    onSubmitEditing={saveEdit}
                    onBlur={saveEdit}
                    autoFocus
                    returnKeyType="done"
                  />
                ) : (
                  <Pressable style={{ flex: 1 }} onPress={() => { setEditingItemId(item.id); setEditText(item.text); }}>
                    <Text style={styles.checkItemText}>{item.text}</Text>
                  </Pressable>
                )}
              </View>
            ))}

            {addingItem ? (
              <View style={styles.checkRow}>
                <View style={styles.checkCircle} />
                <TextInput
                  style={styles.checkItemInput}
                  value={newItemText}
                  onChangeText={setNewItemText}
                  onSubmitEditing={addItem}
                  onBlur={addItem}
                  placeholder="New item..."
                  placeholderTextColor={C.muted}
                  autoFocus
                  returnKeyType="done"
                />
              </View>
            ) : (
              <Pressable onPress={() => setAddingItem(true)} style={styles.addItemRow}>
                <Text style={styles.addItemText}>+ Add item</Text>
              </Pressable>
            )}

            {checked.length > 0 && (
              <>
                <Pressable
                  style={styles.completedHeader}
                  onPress={() => setShowCompleted((v) => !v)}
                  hitSlop={8}
                >
                  <Text style={styles.completedHeaderText}>
                    {showCompleted ? '▾' : '▸'} Completed ({checked.length})
                  </Text>
                </Pressable>
                {showCompleted && checked.map(item => (
                  <View key={item.id} style={styles.checkRow}>
                    <Pressable onPress={() => toggleItem(item.id)} hitSlop={8}>
                      <View style={styles.checkCircleDone}>
                        <Text style={styles.checkmark}>✓</Text>
                      </View>
                    </Pressable>
                    <Text style={styles.checkItemDone}>{item.text}</Text>
                  </View>
                ))}
              </>
            )}
          </ScrollView>
        ) : (
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
        )}

        <Text style={styles.dateText}>{formatDate(note.created_at)}</Text>
        <View style={styles.noteActions}>
          <Pressable hitSlop={8} onPress={isChecklist ? switchToText : switchToChecklist}>
            <Text style={[styles.actionText, { color: C.subdued }]}>
              {isChecklist ? 'Text' : 'Checklist'}
            </Text>
          </Pressable>
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
                {contentPreview(item.content)}
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

export interface NotesPageHandle {
  scrollToIndex: (index: number) => void;
}

interface NotesPageProps {
  onNotesChange?: (notes: Note[]) => void;
  onPageChange?: (index: number) => void;
  initialIndex?: number;
}

const NotesPage = forwardRef<NotesPageHandle, NotesPageProps>(function NotesPage({ onNotesChange, onPageChange, initialIndex = 0 }, ref) {
  const { width } = useWindowDimensions();
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewArchive, setViewArchive] = useState(false);
  const [archived, setArchived] = useState<ArchivedNote[]>([]);
  const [reorderOpen, setReorderOpen] = useState(false);

  const flatRef = useRef<FlatList<ListItem>>(null);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const creating = useRef(false);
  const currentIdxRef = useRef(initialIndex);
  const reorderAnchorRef = useRef<string | null>(null);

  useImperativeHandle(ref, () => ({
    scrollToIndex: (index: number) => {
      flatRef.current?.scrollToIndex({ index, animated: false });
      currentIdxRef.current = index;
    },
  }), []);

  useEffect(() => {
    onNotesChange?.(notes);
  }, [notes, onNotesChange]);

  useEffect(() => {
    supabase
      .from('notes')
      .select('*')
      .order('sort_order', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true })
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
      .insert({ title: '', content: '', sort_order: notes.length })
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
        sort_order: notes.length,
      })
      .select()
      .single();
    await supabase.from('notes_archive').delete().eq('id', note.id);
    setArchived((prev) => prev.filter((n) => n.id !== note.id));
    if (data) setNotes((prev) => [...prev, data]);
  }, [notes.length]);

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

  const openReorder = useCallback((noteId: string) => {
    reorderAnchorRef.current = noteId;
    setReorderOpen(true);
  }, []);

  const closeReorder = useCallback(() => {
    setReorderOpen(false);
    const anchor = reorderAnchorRef.current;
    const idx = notes.findIndex((n) => n.id === anchor);
    if (idx !== -1) {
      setTimeout(() => flatRef.current?.scrollToIndex({ index: idx, animated: false }), 50);
    }
  }, [notes]);

  const renderItem = useCallback(
    ({ item }: { item: ListItem }) => {
      if (item.id === CREATE_ID) {
        return <CreateSlot width={width} onPress={handleCreate} />;
      }
      const note = item as Note;
      return (
        <NoteCard
          note={note}
          width={width}
          onUpdate={updateNote}
          onArchive={handleArchive}
          onDelete={handleDelete}
          onReorder={() => openReorder(note.id)}
        />
      );
    },
    [width, handleCreate, updateNote, handleArchive, handleDelete, openReorder],
  );

  const renderReorderItem = useCallback(
    ({ item, drag, isActive }: RenderItemParams<Note>) => (
      <ScaleDecorator>
        <Pressable
          onLongPress={drag}
          delayLongPress={300}
          disabled={isActive}
          style={[styles.reorderRow, isActive && styles.reorderRowActive]}
        >
          <View style={[styles.reorderDot, { backgroundColor: noteColor(item.id) }]} />
          <Text style={styles.reorderTitle} numberOfLines={1}>
            {item.title.trim() || 'Untitled'}
          </Text>
          <Text style={styles.dragHandleText}>⠿</Text>
        </Pressable>
      </ScaleDecorator>
    ),
    [],
  );

  const onReorderDragEnd = useCallback(async ({ data }: { data: Note[] }) => {
    setNotes(data);
    await Promise.all(
      data.map((note, index) =>
        supabase.from('notes').update({ sort_order: index }).eq('id', note.id),
      ),
    );
  }, []);

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
        initialScrollIndex={Math.min(initialIndex, listData.length - 1)}
        onMomentumScrollEnd={(e) => {
          const idx = Math.round(e.nativeEvent.contentOffset.x / width);
          currentIdxRef.current = idx;
          onPageChange?.(idx);
          if (idx === notes.length) handleCreate();
        }}
      />

      <Modal visible={reorderOpen} animationType="slide" transparent onRequestClose={closeReorder}>
        <GestureHandlerRootView style={styles.reorderBackdrop}>
          <View style={styles.reorderSheet}>
            <View style={styles.reorderHeader}>
              <Text style={styles.reorderHeading}>Reorder Notes</Text>
              <Pressable onPress={closeReorder} hitSlop={12}>
                <Text style={styles.reorderDone}>Done</Text>
              </Pressable>
            </View>
            <DraggableFlatList
              data={notes}
              keyExtractor={(item) => item.id}
              renderItem={renderReorderItem}
              onDragEnd={onReorderDragEnd}
              activationDistance={5}
              contentContainerStyle={styles.reorderList}
            />
          </View>
        </GestureHandlerRootView>
      </Modal>
    </KeyboardAvoidingView>
  );
});

export default NotesPage;

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
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  titleInput: {
    fontSize: 22,
    fontWeight: '700',
    color: C.text,
    padding: 0,
  },
  titleInputFlex: {
    flex: 1,
    marginBottom: 0,
  },
  dragHandle: {
    paddingHorizontal: 6,
    marginLeft: 8,
  },
  dragHandleText: {
    fontSize: 22,
    color: C.muted,
    fontWeight: '700',
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

  // Checklist
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    gap: 10,
  },
  checkCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: 'rgba(44,26,14,0.3)',
  },
  checkCircleDone: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: C.accent,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  checkmark: {
    fontSize: 11,
    color: 'white',
    fontWeight: '700' as const,
  },
  checkItemText: {
    flex: 1,
    fontSize: 15,
    color: C.text,
  },
  checkItemDone: {
    flex: 1,
    fontSize: 15,
    color: C.muted,
    textDecorationLine: 'line-through' as const,
  },
  checkItemInput: {
    flex: 1,
    fontSize: 15,
    color: C.text,
    padding: 0,
    outlineStyle: 'none',
  } as any,
  addItemRow: {
    paddingVertical: 8,
    paddingLeft: 28,
  },
  addItemText: {
    fontSize: 14,
    color: C.muted,
  },
  completedHeader: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(44,26,14,0.1)',
    marginTop: 8,
    paddingTop: 10,
    paddingBottom: 4,
  },
  completedHeaderText: {
    fontSize: 13,
    fontWeight: '600',
    color: C.subdued,
  },

  // Reorder modal
  reorderBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  reorderSheet: {
    backgroundColor: '#FFFDF5',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '70%',
    paddingBottom: 24,
  },
  reorderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(44,26,14,0.08)',
  },
  reorderHeading: {
    fontSize: 17,
    fontWeight: '700',
    color: C.text,
  },
  reorderDone: {
    fontSize: 15,
    fontWeight: '600',
    color: C.accent,
  },
  reorderList: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  reorderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(44,26,14,0.08)',
  },
  reorderRowActive: {
    opacity: 0.85,
  },
  reorderDot: {
    width: 14,
    height: 14,
    borderRadius: 4,
  },
  reorderTitle: {
    flex: 1,
    fontSize: 15,
    color: C.text,
    fontWeight: '500',
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
