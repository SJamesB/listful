import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import DraggableFlatList, { RenderItemParams, ScaleDecorator } from 'react-native-draggable-flatlist';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import { supabase } from '@/lib/supabase';

const C = {
  accent: '#D97706',
} as const;

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const TRACK_FIELD_DEBOUNCE_MS = 600;

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

function formatLocation(show: { venue: string | null; city: string | null; state: string | null; country: string | null }): string {
  const place = [show.city, show.state].filter(Boolean).join(', ');
  if (show.venue && place) return `${show.venue} — ${place}`;
  return show.venue || place || show.country || 'Unknown location';
}

// Accepts "ss", "m:ss" or "h:mm:ss" and returns the total seconds, or null if
// the text doesn't parse as a length yet (e.g. still mid-edit).
function parseLengthSeconds(text: string): number | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(':');
  if (parts.length > 3 || parts.some((p) => !/^\d+$/.test(p))) return null;
  return parts.reduce((total, part) => total * 60 + Number(part), 0);
}

interface DeadShowInfo {
  show_id: string;
  date: string;
  venue: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  listened: boolean;
  favourite: boolean;
  lineup_era: string | null;
  lineup_members: string | null;
}

interface DeadTrack {
  id: number;
  track_number: number | null;
  title: string;
  length_display: string | null;
}

type TrackFieldPatch = Partial<Pick<DeadTrack, 'title' | 'length_display'>> & { length_seconds?: number | null };

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

// RN's Modal renders into its own native root on Android, outside the app-level
// SafeAreaProvider's measured view, so useSafeAreaInsets() there reports zero
// unless a SafeAreaProvider is mounted inside the modal itself.
function EditTrackSheet({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.editSheet, { paddingBottom: insets.bottom + 24 }]}>
      {children}
    </View>
  );
}

export interface DeadheadShowDetailModalProps {
  showId: string | null;
  onClose: () => void;
  onChange?: (showId: string, patch: Partial<Pick<DeadShowInfo, 'listened' | 'favourite'>>) => void;
}

export default function DeadheadShowDetailModal({ showId, onClose, onChange }: DeadheadShowDetailModalProps) {
  const [show, setShow] = useState<DeadShowInfo | null>(null);
  const [tracks, setTracks] = useState<DeadTrack[]>([]);
  const [loading, setLoading] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const fieldTimers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    if (!showId) {
      setShow(null);
      setTracks([]);
      setEditOpen(false);
      return;
    }
    setLoading(true);
    setShow(null);
    setTracks([]);
    (async () => {
      const [{ data: showData }, { data: trackData }] = await Promise.all([
        supabase
          .from('dead_shows')
          .select('show_id, date, venue, city, state, country, listened, favourite, lineup_era, lineup_members')
          .eq('show_id', showId)
          .single(),
        supabase
          .from('dead_tracks')
          .select('id, track_number, title, length_display')
          .eq('show_id', showId)
          .order('track_number', { ascending: true }),
      ]);
      if (showData) setShow(showData as DeadShowInfo);
      if (trackData) setTracks(trackData as DeadTrack[]);
      setLoading(false);
    })();
  }, [showId]);

  const toggleListened = async (listened: boolean) => {
    if (!show) return;
    await supabase.from('dead_shows').update({ listened }).eq('show_id', show.show_id);
    setShow((prev) => (prev ? { ...prev, listened } : prev));
    onChange?.(show.show_id, { listened });
  };

  const toggleFavourite = async (favourite: boolean) => {
    if (!show) return;
    await supabase.from('dead_shows').update({ favourite }).eq('show_id', show.show_id);
    setShow((prev) => (prev ? { ...prev, favourite } : prev));
    onChange?.(show.show_id, { favourite });
  };

  const scheduleTrackFieldUpdate = useCallback((id: number, patch: TrackFieldPatch) => {
    const existing = fieldTimers.current.get(id);
    if (existing) clearTimeout(existing);
    fieldTimers.current.set(id, setTimeout(async () => {
      fieldTimers.current.delete(id);
      await supabase.from('dead_tracks').update(patch).eq('id', id);
    }, TRACK_FIELD_DEBOUNCE_MS));
  }, []);

  const updateTrackTitle = useCallback((id: number, title: string) => {
    setTracks((prev) => prev.map((t) => (t.id === id ? { ...t, title } : t)));
    scheduleTrackFieldUpdate(id, { title });
  }, [scheduleTrackFieldUpdate]);

  const updateTrackLength = useCallback((id: number, length_display: string) => {
    setTracks((prev) => prev.map((t) => (t.id === id ? { ...t, length_display } : t)));
    scheduleTrackFieldUpdate(id, { length_display, length_seconds: parseLengthSeconds(length_display) });
  }, [scheduleTrackFieldUpdate]);

  const addTrack = useCallback(async () => {
    if (!show) return;
    const nextNumber = tracks.reduce((max, t) => Math.max(max, t.track_number ?? 0), 0) + 1;
    const { data } = await supabase
      .from('dead_tracks')
      .insert({ show_id: show.show_id, track_number: nextNumber, title: '' })
      .select('id, track_number, title, length_display')
      .single();
    if (data) setTracks((prev) => [...prev, data as DeadTrack]);
  }, [show, tracks]);

  const removeTrack = useCallback(async (id: number) => {
    setTracks((prev) => prev.filter((t) => t.id !== id));
    await supabase.from('dead_tracks').delete().eq('id', id);
  }, []);

  const onTracksDragEnd = useCallback(async ({ data }: { data: DeadTrack[] }) => {
    const renumbered = data.map((t, i) => ({ ...t, track_number: i + 1 }));
    setTracks(renumbered);
    await Promise.all(
      renumbered.map((t) => supabase.from('dead_tracks').update({ track_number: t.track_number }).eq('id', t.id)),
    );
  }, []);

  const closeEdit = useCallback(() => setEditOpen(false), []);

  const renderEditTrackItem = useCallback(
    ({ item, drag, isActive }: RenderItemParams<DeadTrack>) => (
      <ScaleDecorator>
        <View style={[styles.editTrackRow, isActive && styles.editTrackRowActive]}>
          <Pressable onLongPress={drag} delayLongPress={200} disabled={isActive} hitSlop={8}>
            <Text style={styles.dragHandleText}>⠿</Text>
          </Pressable>
          <TextInput
            style={styles.editTitleInput}
            value={item.title}
            onChangeText={(t) => updateTrackTitle(item.id, t)}
            placeholder="Track title"
            placeholderTextColor="rgba(255,255,255,0.3)"
          />
          <TextInput
            style={styles.editLengthInput}
            value={item.length_display ?? ''}
            onChangeText={(t) => updateTrackLength(item.id, t)}
            placeholder="m:ss"
            placeholderTextColor="rgba(255,255,255,0.3)"
          />
          <Pressable onPress={() => removeTrack(item.id)} hitSlop={8}>
            <Text style={styles.removeTrackText}>✕</Text>
          </Pressable>
        </View>
      </ScaleDecorator>
    ),
    [updateTrackTitle, updateTrackLength, removeTrack],
  );

  return (
    <>
      <Modal
        visible={!!showId}
        animationType="fade"
        transparent
        presentationStyle="overFullScreen"
        onRequestClose={onClose}
      >
        <View style={styles.detailOverlay}>
          <LinearGradient
            colors={['rgba(8,8,8,0.1)', '#080808']}
            locations={[0, 0.5]}
            style={StyleSheet.absoluteFill}
          />
          <Pressable style={styles.detailClose} onPress={onClose} hitSlop={12}>
            <Text style={styles.detailCloseText}>✕</Text>
          </Pressable>
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={styles.detailContent}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.detailTitle}>{show ? formatDate(show.date) : ''}</Text>
            <Text style={styles.detailMetaText}>{show ? formatLocation(show) : ''}</Text>

            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>Listened</Text>
              <Switch
                value={!!show?.listened}
                onValueChange={toggleListened}
                trackColor={{ true: C.accent }}
              />
            </View>
            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>Favourite</Text>
              <Switch
                value={!!show?.favourite}
                onValueChange={toggleFavourite}
                trackColor={{ true: C.accent }}
              />
            </View>

            {loading ? (
              <ActivityIndicator color="rgba(255,255,255,0.35)" style={{ marginTop: 20 }} />
            ) : (
              <>
                {(show?.lineup_era || show?.lineup_members) && (
                  <View style={styles.detailFields}>
                    {show?.lineup_era ? <DetailRow label="Lineup Era" value={show.lineup_era} /> : null}
                    {show?.lineup_members ? <DetailRow label="Lineup" value={show.lineup_members} /> : null}
                  </View>
                )}

                {show && (
                  <View style={styles.tracklist}>
                    <View style={styles.tracklistHeaderRow}>
                      <Text style={styles.tracklistHeading}>Tracklist</Text>
                      <Pressable onPress={() => setEditOpen(true)} hitSlop={8}>
                        <Text style={styles.editTracklistBtnText}>Edit</Text>
                      </Pressable>
                    </View>
                    {tracks.length === 0 ? (
                      <Text style={styles.tracklistEmptyText}>No tracks yet</Text>
                    ) : (
                      tracks.map((track, i) => (
                        <View key={track.id} style={styles.trackRow}>
                          <Text style={styles.trackNumber}>{track.track_number ?? i + 1}</Text>
                          <Text style={styles.trackTitle} numberOfLines={2}>{track.title}</Text>
                          <Text style={styles.trackLength}>{track.length_display ?? ''}</Text>
                        </View>
                      ))
                    )}
                  </View>
                )}
              </>
            )}
          </ScrollView>
        </View>
      </Modal>

      <Modal visible={editOpen} animationType="slide" transparent onRequestClose={closeEdit}>
        <SafeAreaProvider>
          <GestureHandlerRootView style={styles.editBackdrop}>
            <EditTrackSheet>
              <View style={styles.editHeader}>
                <Text style={styles.editHeading}>Edit Tracklist</Text>
                <Pressable onPress={closeEdit} hitSlop={12}>
                  <Text style={styles.editDone}>Done</Text>
                </Pressable>
              </View>
              <DraggableFlatList
                data={tracks}
                keyExtractor={(item) => String(item.id)}
                renderItem={renderEditTrackItem}
                onDragEnd={onTracksDragEnd}
                activationDistance={5}
                contentContainerStyle={styles.editList}
                ListFooterComponent={
                  <Pressable style={styles.addTrackBtn} onPress={addTrack}>
                    <Text style={styles.addTrackText}>+ Add Track</Text>
                  </Pressable>
                }
              />
            </EditTrackSheet>
          </GestureHandlerRootView>
        </SafeAreaProvider>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  detailOverlay: {
    flex: 1,
    backgroundColor: '#080808',
  },
  detailClose: {
    position: 'absolute',
    top: 56,
    right: 20,
    zIndex: 10,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailCloseText: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 14,
    fontWeight: '600',
  },
  detailContent: {
    paddingTop: 72,
    paddingHorizontal: 28,
    paddingBottom: 64,
  },
  detailTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
    letterSpacing: -0.4,
    marginBottom: 8,
  },
  detailMetaText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
    fontWeight: '500',
    textAlign: 'center',
    marginBottom: 24,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 2,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  switchLabel: {
    fontSize: 15,
    fontWeight: '500',
    color: '#fff',
  },
  detailFields: {
    marginTop: 20,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.07)',
  },
  detailRow: {
    flexDirection: 'column',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.07)',
    gap: 4,
  },
  detailLabel: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.3)',
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  detailValue: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.82)',
    fontWeight: '500',
    lineHeight: 20,
  },
  tracklist: {
    marginTop: 24,
  },
  tracklistHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  tracklistHeading: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.3)',
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  editTracklistBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: C.accent,
  },
  tracklistEmptyText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.35)',
  },
  trackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.06)',
    gap: 10,
  },
  trackNumber: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.35)',
    width: 20,
  },
  trackTitle: {
    flex: 1,
    fontSize: 14,
    color: 'rgba(255,255,255,0.85)',
  },
  trackLength: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
  },
  // Edit tracklist sheet
  editBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  editSheet: {
    backgroundColor: '#141414',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
  },
  editHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  editHeading: {
    fontSize: 17,
    fontWeight: '700',
    color: '#fff',
  },
  editDone: {
    fontSize: 15,
    fontWeight: '600',
    color: C.accent,
  },
  editList: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  editTrackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  editTrackRowActive: {
    opacity: 0.85,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  dragHandleText: {
    fontSize: 18,
    color: 'rgba(255,255,255,0.35)',
  },
  editTitleInput: {
    flex: 1,
    fontSize: 14,
    color: '#fff',
    paddingVertical: 4,
    outlineStyle: 'none',
  } as any,
  editLengthInput: {
    width: 52,
    fontSize: 14,
    color: '#fff',
    textAlign: 'right',
    paddingVertical: 4,
    outlineStyle: 'none',
  } as any,
  removeTrackText: {
    fontSize: 15,
    color: 'rgba(220,38,38,0.8)',
    paddingHorizontal: 2,
  },
  addTrackBtn: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  addTrackText: {
    fontSize: 14,
    fontWeight: '600',
    color: C.accent,
  },
});
