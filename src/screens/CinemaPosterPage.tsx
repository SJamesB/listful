import { Image } from 'expo-image';
import * as SecureStore from 'expo-secure-store';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';

import { supabase } from '@/lib/supabase';

const store = {
  getItemAsync: (key: string): Promise<string | null> =>
    Platform.OS === 'web'
      ? Promise.resolve(localStorage.getItem(key))
      : SecureStore.getItemAsync(key),
  setItemAsync: (key: string, value: string): Promise<void> =>
    Platform.OS === 'web'
      ? Promise.resolve(void localStorage.setItem(key, value))
      : SecureStore.setItemAsync(key, value),
};

const C = {
  text: '#1A1626',
  muted: 'rgba(26,22,38,0.45)',
  accent: '#7C3AED',
} as const;

const IMDB_USER_ID_KEY = 'imdb_user_id';
const COLS = 3;
const PADDING = 16;
const GAP = 6;

interface IMDBItem {
  id: string;
  imdb_id: string;
  title: string;
  poster_url: string | null;
  media_type: 'Movie' | 'TV';
}

interface Props {
  title: string;
  source: 'watchlist' | 'ratings' | 'list';
  mediaType?: 'Movie' | 'TV';
  listId?: string;
}

export default function CinemaPosterPage({ title, source, mediaType, listId }: Props) {
  const { width } = useWindowDimensions();
  const posterWidth = (width - PADDING * 2 - GAP * (COLS - 1)) / COLS;
  const posterHeight = posterWidth * 1.5;

  const [items, setItems] = useState<IMDBItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [userId, setUserId] = useState('');
  const [setupOpen, setSetupOpen] = useState(false);
  const [userIdDraft, setUserIdDraft] = useState('');

  const load = useCallback(async () => {
    let q = supabase
      .from('imdb_items')
      .select('id, imdb_id, title, poster_url, media_type')
      .eq('source', source);
    if (mediaType) q = (q as any).eq('media_type', mediaType);
    if (listId) q = (q as any).eq('list_id', listId);
    const { data } = await (q as any).order('synced_at', { ascending: false });
    if (data) setItems(data as IMDBItem[]);
    setLoading(false);
  }, [source, mediaType, listId]);

  useEffect(() => {
    const init = async () => {
      const saved = await store.getItemAsync(IMDB_USER_ID_KEY);
      if (saved) setUserId(saved);
      await load();
    };
    init();
  }, [load]);

  const openSetup = async () => {
    const saved = await store.getItemAsync(IMDB_USER_ID_KEY);
    setUserIdDraft(saved ?? '');
    setSetupOpen(true);
  };

  const saveSetup = async () => {
    const trimmed = userIdDraft.trim();
    if (!trimmed) return;
    await store.setItemAsync(IMDB_USER_ID_KEY, trimmed);
    setUserId(trimmed);
    setSetupOpen(false);
  };

  const sync = async () => {
    if (!userId) { openSetup(); return; }
    setSyncing(true);
    setSyncError(null);
    try {
      const body = source === 'list' && listId
        ? { userId, source: 'list', listId }
        : { userId, source };

      const { data, error } = await supabase.functions.invoke('imdb-fetch', { body });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);

      const rows = (data?.items ?? []).map((item: any) => ({
        ...item,
        source,
        list_id: listId ?? null,
        list_name: data.listName ?? null,
        synced_at: new Date().toISOString(),
      }));

      if (rows.length > 0) {
        await supabase.from('imdb_items').upsert(rows, { onConflict: 'imdb_id,source' });
      }
      await load();
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : String(err));
    } finally {
      setSyncing(false);
    }
  };

  const renderItem = ({ item }: { item: IMDBItem }) => (
    <View style={[styles.posterWrap, { width: posterWidth }]}>
      {item.poster_url ? (
        <Image
          source={{ uri: item.poster_url }}
          style={[styles.poster, { width: posterWidth, height: posterHeight }]}
          contentFit="cover"
        />
      ) : (
        <View style={[styles.poster, styles.posterFallback, { width: posterWidth, height: posterHeight }]}>
          <Text style={styles.fallbackEmoji}>{mediaType === 'TV' ? '📺' : '🎬'}</Text>
        </View>
      )}
    </View>
  );

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        <View style={styles.headerActions}>
          <Pressable onPress={openSetup} hitSlop={10}>
            <Text style={styles.iconBtn}>⚙️</Text>
          </Pressable>
          <Pressable
            onPress={sync}
            disabled={syncing}
            style={({ pressed }) => [styles.syncBtn, { opacity: pressed || syncing ? 0.6 : 1 }]}
          >
            {syncing
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={styles.syncBtnText}>Sync</Text>
            }
          </Pressable>
        </View>
      </View>

      {syncError ? (
        <Text style={styles.errorText} numberOfLines={3}>{syncError}</Text>
      ) : null}

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={C.accent} /></View>
      ) : items.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>
            {userId ? 'No items — tap Sync to fetch' : 'Connect your IMDB account to get started'}
          </Text>
          <Pressable
            onPress={userId ? sync : openSetup}
            style={({ pressed }) => [styles.emptyBtn, { opacity: pressed ? 0.6 : 1 }]}
          >
            <Text style={styles.emptyBtnText}>{userId ? 'Sync' : 'Connect IMDB'}</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          numColumns={COLS}
          contentContainerStyle={[styles.grid, { padding: PADDING }]}
          columnWrapperStyle={{ gap: GAP }}
          showsVerticalScrollIndicator={false}
        />
      )}

      <Modal
        visible={setupOpen}
        animationType="slide"
        transparent
        presentationStyle="overFullScreen"
        onRequestClose={() => setSetupOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>IMDB Account</Text>
            <Text style={styles.modalHint}>
              Find your user ID in your IMDB profile URL:{'\n'}
              imdb.com/user/<Text style={{ fontWeight: '700' }}>ur12345678</Text>/
            </Text>
            <Text style={styles.modalHint}>
              Your lists must be set to <Text style={{ fontWeight: '700' }}>Public</Text> in IMDB Privacy Settings.
            </Text>
            <TextInput
              style={styles.modalInput}
              value={userIdDraft}
              onChangeText={setUserIdDraft}
              placeholder="ur12345678"
              placeholderTextColor={C.muted}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="done"
              onSubmitEditing={saveSetup}
            />
            <View style={styles.modalActions}>
              <Pressable onPress={() => setSetupOpen(false)}>
                <Text style={styles.cancelText}>cancel</Text>
              </Pressable>
              <Pressable
                onPress={saveSetup}
                style={({ pressed }) => [styles.saveBtn, { opacity: pressed ? 0.6 : 1 }]}
              >
                <Text style={styles.saveBtnText}>Save</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconBtn: { fontSize: 18 },
  syncBtn: {
    backgroundColor: C.accent,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    minWidth: 60,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  syncBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  errorText: {
    fontSize: 12,
    color: '#DC2626',
    paddingHorizontal: PADDING,
    marginBottom: 8,
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, paddingHorizontal: 40 },
  emptyText: { fontSize: 14, color: C.muted, textAlign: 'center', lineHeight: 20 },
  emptyBtn: {
    backgroundColor: C.accent,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  emptyBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  grid: { paddingBottom: 64 },
  posterWrap: { marginBottom: GAP },
  poster: { borderRadius: 6, backgroundColor: 'rgba(26,22,38,0.08)' },
  posterFallback: { alignItems: 'center', justifyContent: 'center' },
  fallbackEmoji: { fontSize: 24 },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 28,
    gap: 14,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: C.text, marginBottom: 2 },
  modalHint: { fontSize: 13, color: C.muted, lineHeight: 19 },
  modalInput: {
    fontSize: 16,
    color: C.text,
    borderBottomWidth: 1.5,
    borderBottomColor: C.accent,
    paddingVertical: 6,
    marginTop: 4,
    outlineStyle: 'none',
  } as any,
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 20,
    marginTop: 8,
  },
  cancelText: { fontSize: 14, color: C.muted },
  saveBtn: {
    backgroundColor: C.accent,
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
  },
  saveBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
});
