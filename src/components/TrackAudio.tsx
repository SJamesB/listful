import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/Text';
import { TextInput } from '@/components/TextInput';
import {
  camelot,
  formatBpm,
  fromCamelot,
  keyName,
  saveManualAudio,
  type TrackAudio,
} from '@/lib/trackAudio';

const ACCENT = '#EA580C';

export interface AudioTrackRef {
  release_id: number;
  position: string | null;
  title: string;
  subtitle?: string | null;
}

// "122 · 8A". With onPress, a track without values shows "+ BPM" so it can
// be filled in by hand.
export function AudioBadge({
  audio,
  tone = 'dark',
  onPress,
}: {
  audio: TrackAudio | undefined;
  tone?: 'dark' | 'light';
  onPress?: () => void;
}) {
  const code = audio ? camelot(audio.musical_key, audio.mode) : null;
  const bpm = audio?.bpm != null ? formatBpm(audio.bpm) : null;
  const parts = [bpm, code].filter(Boolean);
  if (!parts.length && !onPress) return null;

  const dark = tone === 'dark';
  const content = (
    <View
      style={[
        styles.badge,
        { backgroundColor: dark ? 'rgba(255,255,255,0.08)' : 'rgba(26,22,38,0.06)' },
        !parts.length && styles.badgeEmpty,
      ]}
    >
      <Text style={[styles.badgeText, { color: dark ? 'rgba(255,255,255,0.75)' : 'rgba(26,22,38,0.7)' }]}>
        {parts.length ? parts.join(' · ') : '+ BPM'}
      </Text>
    </View>
  );
  return onPress ? (
    <Pressable onPress={onPress} hitSlop={6}>
      {content}
    </Pressable>
  ) : (
    content
  );
}

const CAMELOT_CODES = [
  ...Array.from({ length: 12 }, (_, i) => `${i + 1}A`),
  ...Array.from({ length: 12 }, (_, i) => `${i + 1}B`),
];

function sourceLabel(audio: TrackAudio | undefined): string {
  if (!audio) return 'Not looked up yet';
  if (audio.source === 'manual') return 'Entered by you';
  const matched = audio.matched_title ? ` (matched “${audio.matched_artist} – ${audio.matched_title}”)` : '';
  if (audio.source === 'reccobeats') return `Looked up via Deezer + ReccoBeats${matched}`;
  if (audio.source === 'deezer') return `Looked up via Deezer${matched}`;
  return 'No match found online';
}

// Sheet for checking and correcting a track's BPM and key.
export function AudioEditor({
  track,
  audio,
  onClose,
}: {
  track: AudioTrackRef | null;
  audio: TrackAudio | undefined;
  onClose: () => void;
}) {
  return (
    <Modal visible={!!track} transparent animationType="slide" onRequestClose={onClose}>
      {track ? <EditorSheet track={track} audio={audio} onClose={onClose} /> : null}
    </Modal>
  );
}

function EditorSheet({ track, audio, onClose }: { track: AudioTrackRef; audio: TrackAudio | undefined; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [bpmText, setBpmText] = useState(audio?.bpm != null ? String(audio.bpm) : '');
  const [code, setCode] = useState<string | null>(audio ? camelot(audio.musical_key, audio.mode) : null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const taps = useRef<number[]>([]);

  useEffect(() => {
    taps.current = [];
  }, [track]);

  const bpm = bpmText.trim() ? Number(bpmText) : null;
  const bpmValid = bpm == null || (Number.isFinite(bpm) && bpm >= 20 && bpm <= 300);

  const scale = (factor: number) => {
    if (bpm == null || !Number.isFinite(bpm)) return;
    setBpmText(String(Math.round(bpm * factor * 10) / 10));
  };

  // Tap along to the beat; averages the last few intervals, and starts over
  // after a pause of more than two seconds.
  const tap = () => {
    const now = Date.now();
    const last = taps.current[taps.current.length - 1];
    if (last && now - last > 2000) taps.current = [];
    taps.current = [...taps.current, now].slice(-9);
    const t = taps.current;
    if (t.length >= 2) {
      const avg = (t[t.length - 1] - t[0]) / (t.length - 1);
      setBpmText(String(Math.round((60000 / avg) * 10) / 10));
    }
  };

  const save = async (values: { bpm: number | null; code: string | null }) => {
    setSaving(true);
    setError(null);
    try {
      const k = values.code ? fromCamelot(values.code) : null;
      await saveManualAudio(track.release_id, track.position, track.title, {
        bpm: values.bpm,
        musical_key: k?.musical_key ?? null,
        mode: k?.mode ?? null,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const selectedKey = code ? fromCamelot(code) : null;

  return (
    <View style={styles.overlay}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      <View style={[styles.sheet, { maxHeight: height * 0.9, paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.header}>
          <Pressable onPress={onClose} hitSlop={8}>
            <Text style={styles.cancel}>Cancel</Text>
          </Pressable>
          <Text style={styles.headerTitle}>BPM & key</Text>
          <Pressable onPress={() => save({ bpm, code })} disabled={!bpmValid || saving} hitSlop={8}>
            <Text style={[styles.save, (!bpmValid || saving) && { opacity: 0.35 }]}>Save</Text>
          </Pressable>
        </View>

        <View style={styles.body}>
          <Text style={styles.trackTitle} numberOfLines={2}>
            {track.position ? `${track.position}  ` : ''}{track.title}
          </Text>
          {track.subtitle ? <Text style={styles.trackSub} numberOfLines={1}>{track.subtitle}</Text> : null}
          <Text style={styles.source}>{sourceLabel(audio)}</Text>

          <Text style={styles.label}>BPM</Text>
          <View style={styles.bpmRow}>
            <TextInput
              style={[styles.bpmInput, !bpmValid && { borderBottomColor: '#DC2626' }]}
              value={bpmText}
              onChangeText={setBpmText}
              keyboardType="decimal-pad"
              placeholder="—"
              placeholderTextColor="rgba(26,22,38,0.3)"
            />
            <Pressable style={styles.smallBtn} onPress={() => scale(0.5)}>
              <Text style={styles.smallBtnText}>÷2</Text>
            </Pressable>
            <Pressable style={styles.smallBtn} onPress={() => scale(2)}>
              <Text style={styles.smallBtnText}>×2</Text>
            </Pressable>
          </View>
          <Pressable
            style={({ pressed }) => [styles.tapBtn, pressed && { backgroundColor: 'rgba(234,88,12,0.25)' }]}
            onPressIn={tap}
          >
            <Text style={styles.tapText}>Tap along to the beat</Text>
          </Pressable>

          <Text style={styles.label}>
            Key{selectedKey ? `  ·  ${keyName(selectedKey.musical_key, selectedKey.mode)}` : ''}
          </Text>
          <View style={styles.keyGrid}>
            {CAMELOT_CODES.map((c) => (
              <Pressable
                key={c}
                onPress={() => setCode(code === c ? null : c)}
                style={[styles.keyChip, code === c && styles.keyChipSelected]}
              >
                <Text style={[styles.keyChipText, code === c && styles.keyChipTextSelected]}>{c}</Text>
              </Pressable>
            ))}
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable onPress={() => save({ bpm: null, code: null })} disabled={saving} style={styles.clearBtn}>
            <Text style={styles.clearText}>Clear BPM and key</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8 },
  badgeEmpty: { opacity: 0.6 },
  badgeText: { fontSize: 11, fontWeight: '700', fontVariant: ['tabular-nums'] },

  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(26,22,38,0.1)',
  },
  headerTitle: { fontSize: 16, fontWeight: '700', color: '#1A1626' },
  cancel: { fontSize: 14, color: 'rgba(26,22,38,0.55)', fontWeight: '500' },
  save: { fontSize: 14, color: ACCENT, fontWeight: '700' },
  body: { paddingHorizontal: 20, paddingTop: 16 },
  trackTitle: { fontSize: 16, fontWeight: '700', color: '#1A1626' },
  trackSub: { fontSize: 13, color: 'rgba(26,22,38,0.55)', marginTop: 2 },
  source: { fontSize: 12, color: 'rgba(26,22,38,0.45)', marginTop: 6 },
  label: {
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(26,22,38,0.5)',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginTop: 20,
    marginBottom: 8,
  },
  bpmRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  bpmInput: {
    flex: 1,
    fontSize: 28,
    fontWeight: '700',
    color: '#1A1626',
    paddingVertical: 2,
    borderBottomWidth: 1.5,
    borderBottomColor: ACCENT,
    outlineStyle: 'none',
  } as any,
  smallBtn: {
    paddingHorizontal: 14,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(26,22,38,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  smallBtnText: { fontSize: 15, fontWeight: '700', color: '#1A1626' },
  tapBtn: {
    marginTop: 12,
    height: 52,
    borderRadius: 12,
    backgroundColor: 'rgba(234,88,12,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tapText: { fontSize: 14, fontWeight: '700', color: ACCENT },
  keyGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  keyChip: {
    width: '14.5%',
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(26,22,38,0.06)',
    alignItems: 'center',
  },
  keyChipSelected: { backgroundColor: ACCENT },
  keyChipText: { fontSize: 13, fontWeight: '600', color: '#1A1626' },
  keyChipTextSelected: { color: '#fff' },
  error: { fontSize: 12, color: '#DC2626', marginTop: 12 },
  clearBtn: { alignSelf: 'center', marginTop: 20, paddingVertical: 8 },
  clearText: { fontSize: 13, color: '#DC2626', fontWeight: '600' },
});
