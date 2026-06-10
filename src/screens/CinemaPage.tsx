import { Image } from 'expo-image';
import * as SecureStore from 'expo-secure-store';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { supabase } from '@/lib/supabase';

const C = {
  text: '#1A1626',
  muted: 'rgba(26,22,38,0.45)',
  border: 'rgba(26,22,38,0.12)',
  accent: '#7C3AED',
  accentLight: 'rgba(124,58,237,0.12)',
} as const;

type MediaType = 'Movie' | 'TV';
type Source = 'watchlist' | 'ratings';

interface IMDBItem {
  id: string;
  imdb_id: string;
  title: string;
  year: string | null;
  media_type: MediaType;
  poster_url: string | null;
  user_rating: number | null;
  source: Source;
  synced_at: string;
}

const MEDIA_EMOJI: Record<MediaType, string> = { Movie: '🎬', TV: '📺' };
const MEDIA_BADGE: Record<MediaType, string> = {
  Movie: 'rgba(186,230,253,0.85)',
  TV: 'rgba(253,224,132,0.85)',
};

const SOURCE_LABEL: Record<Source, string> = { watchlist: 'Watchlist', ratings: 'Rated' };
const SOURCE_BADGE: Record<Source, string> = {
  watchlist: 'rgba(167,243,208,0.7)',
  ratings: 'rgba(251,207,232,0.7)',
};

type FilterTab = 'all' | Source;
const TABS: { key: FilterTab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'watchlist', label: 'Watchlist' },
  { key: 'ratings', label: 'Rated' },
];

const IMDB_USER_ID_KEY = 'imdb_user_id';

export default function CinemaPage() {
  const [items, setItems] = useState<IMDBItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [userId, setUserId] = useState('');
  const [setupOpen, setSetupOpen] = useState(false);
  const [userIdDraft, setUserIdDraft] = useState('');

  const loadItems = useCallback(async () => {
    const { data } = await supabase
      .from('imdb_items')
      .select('*')
      .order('synced_at', { ascending: false });
    if (data) setItems(data as IMDBItem[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    const init = async () => {
      const saved = await SecureStore.getItemAsync(IMDB_USER_ID_KEY);
      if (saved) setUserId(saved);
      await loadItems();
    };
    init();
  }, [loadItems]);

  const openSetup = async () => {
    const saved = await SecureStore.getItemAsync(IMDB_USER_ID_KEY);
    setUserIdDraft(saved ?? '');
    setSetupOpen(true);
  };

  const saveSetup = async () => {
    const trimmed = userIdDraft.trim();
    if (!trimmed) return;
    await SecureStore.setItemAsync(IMDB_USER_ID_KEY, trimmed);
    setUserId(trimmed);
    setSetupOpen(false);
  };

  const syncSource = async (source: Source) => {
    const { data, error } = await supabase.functions.invoke('imdb-fetch', {
      body: { userId, source },
    });
    if (error) throw new Error(error.message);
    if (data?.error) throw new Error(data.error);

    const fetched = (data?.items ?? []) as Array<{
      imdb_id: string;
      title: string;
      year: string | null;
      media_type: 'Movie' | 'TV';
      poster_url: string | null;
      user_rating: number | null;
    }>;

    if (fetched.length === 0) return;

    const rows = fetched.map((item) => ({
      ...item,
      source,
      synced_at: new Date().toISOString(),
    }));

    const { error: upsertErr } = await supabase
      .from('imdb_items')
      .upsert(rows, { onConflict: 'imdb_id,source' });

    if (upsertErr) throw new Error(upsertErr.message);
  };

  const sync = async () => {
    if (!userId) {
      openSetup();
      return;
    }
    setSyncing(true);
    setSyncError(null);
    try {
      await syncSource('watchlist');
      await syncSource('ratings');
      await loadItems();
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : String(err));
    } finally {
      setSyncing(false);
    }
  };

  const filteredItems =
    activeTab === 'all' ? items : items.filter((i) => i.source === activeTab);

  const renderItem = ({ item }: { item: IMDBItem }) => (
    <View style={styles.card}>
      {item.poster_url ? (
        <Image source={{ uri: item.poster_url }} style={styles.poster} contentFit="cover" />
      ) : (
        <View style={[styles.poster, styles.posterFallback]}>
          <Text style={styles.posterEmoji}>{MEDIA_EMOJI[item.media_type]}</Text>
        </View>
      )}
      <View style={styles.cardBody}>
        <Text style={styles.cardTitle} numberOfLines={2}>
          {item.title}
        </Text>
        <View style={styles.cardMeta}>
          {item.year ? <Text style={styles.year}>{item.year}</Text> : null}
          <View style={[styles.badge, { backgroundColor: MEDIA_BADGE[item.media_type] }]}>
            <Text style={styles.badgeText}>
              {MEDIA_EMOJI[item.media_type]} {item.media_type}
            </Text>
          </View>
          {activeTab === 'all' && (
            <View style={[styles.badge, { backgroundColor: SOURCE_BADGE[item.source] }]}>
              <Text style={styles.badgeText}>{SOURCE_LABEL[item.source]}</Text>
            </View>
          )}
        </View>
        {item.user_rating != null ? (
          <Text style={styles.rating}>★ {item.user_rating}/10</Text>
        ) : null}
      </View>
    </View>
  );

  return (
    <View style={styles.root}>
      <View style={styles.headerWrap}>
        <Text style={styles.title}>🎬 Cinema</Text>
        <View style={styles.headerActions}>
          <Pressable onPress={openSetup} hitSlop={10} style={styles.iconBtn}>
            <Text style={styles.iconBtnText}>⚙️</Text>
          </Pressable>
          <Pressable
            onPress={sync}
            disabled={syncing}
            style={({ pressed }) => [styles.syncBtn, { opacity: pressed || syncing ? 0.6 : 1 }]}
          >
            {syncing ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.syncBtnText}>Sync</Text>
            )}
          </Pressable>
        </View>
      </View>

      <View style={styles.tabs}>
        {TABS.map((tab) => (
          <Pressable
            key={tab.key}
            onPress={() => setActiveTab(tab.key)}
            style={[styles.tab, activeTab === tab.key && styles.tabActive]}
          >
            <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
              {tab.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {syncError ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{syncError}</Text>
        </View>
      ) : null}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={C.accent} />
        </View>
      ) : filteredItems.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>
            {userId ? 'No items — tap Sync to fetch your lists' : 'Enter your IMDB user ID to get started'}
          </Text>
          <Pressable
            onPress={userId ? sync : openSetup}
            style={({ pressed }) => [styles.emptyBtn, { opacity: pressed ? 0.6 : 1 }]}
          >
            <Text style={styles.emptyBtnText}>
              {userId ? 'Sync from IMDB' : 'Connect IMDB'}
            </Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={filteredItems}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
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
              Your Watchlist and Ratings must be set to <Text style={{ fontWeight: '700' }}>Public</Text> in IMDB Privacy Settings.
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

const POSTER_W = 56;
const POSTER_H = 80;
const ROW_MAX = 400;

const styles = StyleSheet.create({
  root: { flex: 1 },
  headerWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    alignSelf: 'center',
    width: '100%',
    maxWidth: ROW_MAX,
    paddingHorizontal: 24,
    paddingTop: 60,
    marginBottom: 20,
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
  iconBtn: {
    padding: 4,
  },
  iconBtnText: {
    fontSize: 18,
  },
  syncBtn: {
    backgroundColor: C.accent,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    minWidth: 60,
    alignItems: 'center',
    justifyContent: 'center',
    height: 30,
  },
  syncBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  tabs: {
    flexDirection: 'row',
    alignSelf: 'center',
    width: '100%',
    maxWidth: ROW_MAX,
    paddingHorizontal: 24,
    gap: 8,
    marginBottom: 16,
  },
  tab: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: 'rgba(26,22,38,0.06)',
  },
  tabActive: {
    backgroundColor: C.accentLight,
  },
  tabText: {
    fontSize: 13,
    color: C.muted,
    fontWeight: '500',
  },
  tabTextActive: {
    color: C.accent,
    fontWeight: '600',
  },
  errorBox: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: ROW_MAX,
    paddingHorizontal: 24,
    marginBottom: 12,
  },
  errorText: {
    fontSize: 13,
    color: '#DC2626',
    backgroundColor: 'rgba(220,38,38,0.08)',
    borderRadius: 8,
    padding: 12,
    lineHeight: 18,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    gap: 16,
  },
  emptyText: {
    fontSize: 14,
    color: C.muted,
    textAlign: 'center',
    lineHeight: 20,
  },
  emptyBtn: {
    backgroundColor: C.accent,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  emptyBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  list: {
    paddingBottom: 64,
  },
  card: {
    flexDirection: 'row',
    alignSelf: 'center',
    width: '100%',
    maxWidth: ROW_MAX,
    paddingHorizontal: 24,
    paddingVertical: 12,
    gap: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
  },
  poster: {
    width: POSTER_W,
    height: POSTER_H,
    borderRadius: 6,
    backgroundColor: 'rgba(26,22,38,0.06)',
    flexShrink: 0,
  },
  posterFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  posterEmoji: {
    fontSize: 22,
  },
  cardBody: {
    flex: 1,
    justifyContent: 'center',
    gap: 6,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: C.text,
    letterSpacing: -0.1,
    lineHeight: 19,
  },
  cardMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    alignItems: 'center',
  },
  year: {
    fontSize: 12,
    color: C.muted,
    fontWeight: '500',
  },
  badge: {
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  badgeText: {
    fontSize: 11,
    color: C.text,
    fontWeight: '500',
  },
  rating: {
    fontSize: 12,
    color: '#92400E',
    fontWeight: '600',
  },
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
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: C.text,
    marginBottom: 2,
  },
  modalHint: {
    fontSize: 13,
    color: C.muted,
    lineHeight: 19,
  },
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
  cancelText: {
    fontSize: 14,
    color: C.muted,
  },
  saveBtn: {
    backgroundColor: C.accent,
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
  },
  saveBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});
