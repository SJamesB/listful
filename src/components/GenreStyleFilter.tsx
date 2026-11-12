import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/Text';
import { TextInput } from '@/components/TextInput';

// Genre / style filter for Discogs records. A record matches when it has any
// of the selected genres AND any of the selected styles (an empty group
// matches everything).

export interface GenreStyleSelection {
  genres: string[];
  styles: string[];
}

export const EMPTY_SELECTION: GenreStyleSelection = { genres: [], styles: [] };

interface Tagged {
  genres: string[];
  styles: string[];
}

const anyOf = (values: string[], selected: string[]) =>
  selected.length === 0 || selected.some((s) => values.includes(s));

export function matchesSelection(item: Tagged, sel: GenreStyleSelection): boolean {
  return anyOf(item.genres, sel.genres) && anyOf(item.styles, sel.styles);
}

export const selectionCount = (sel: GenreStyleSelection) => sel.genres.length + sel.styles.length;

// Values of `key` across `items`, most common first, with counts.
function tally(items: Tagged[], key: keyof Tagged): { value: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const item of items) for (const v of item[key]) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

const ACCENT = '#EA580C';
const TONES = {
  light: {
    text: '#1A1626',
    muted: 'rgba(26,22,38,0.5)',
    chip: 'rgba(255,255,255,0.5)',
    border: 'rgba(26,22,38,0.12)',
  },
  dark: {
    text: 'rgba(255,255,255,0.88)',
    muted: 'rgba(255,255,255,0.5)',
    chip: 'rgba(255,255,255,0.08)',
    border: 'rgba(255,255,255,0.12)',
  },
} as const;

const STYLE_LIMIT = 60;

export function GenreStyleFilter({
  items,
  value,
  onChange,
  tone = 'light',
}: {
  items: Tagged[];
  value: GenreStyleSelection;
  onChange: (next: GenreStyleSelection) => void;
  tone?: 'light' | 'dark';
}) {
  const t = TONES[tone];
  const [open, setOpen] = useState(false);
  const count = selectionCount(value);

  const remove = (kind: keyof GenreStyleSelection, v: string) =>
    onChange({ ...value, [kind]: value[kind].filter((x) => x !== v) });

  return (
    <>
      <ScrollView
        horizontal
        style={styles.barScroll}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.bar}
        keyboardShouldPersistTaps="handled"
      >
        <Pressable
          onPress={() => setOpen(true)}
          style={({ pressed }) => [
            styles.trigger,
            { backgroundColor: count ? ACCENT : t.chip, borderColor: count ? ACCENT : t.border },
            pressed && { opacity: 0.6 },
          ]}
        >
          <Text style={[styles.triggerText, { color: count ? '#fff' : t.text }]}>
            {count ? `Genre & style · ${count}` : 'Genre & style'}
          </Text>
        </Pressable>
        {(['genres', 'styles'] as const).flatMap((kind) =>
          value[kind].map((v) => (
            <Pressable
              key={`${kind}:${v}`}
              onPress={() => remove(kind, v)}
              style={[styles.activeChip, { borderColor: ACCENT }]}
            >
              <Text style={[styles.activeChipText, { color: t.text }]}>{v}</Text>
              <Text style={[styles.activeChipX, { color: t.muted }]}>✕</Text>
            </Pressable>
          )),
        )}
        {count > 1 ? (
          <Pressable onPress={() => onChange(EMPTY_SELECTION)} hitSlop={6} style={styles.clearInline}>
            <Text style={[styles.clearInlineText, { color: t.muted }]}>Clear</Text>
          </Pressable>
        ) : null}
      </ScrollView>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <FilterSheet items={items} value={value} onChange={onChange} onClose={() => setOpen(false)} />
      </Modal>
    </>
  );
}

function FilterSheet({
  items,
  value,
  onChange,
  onClose,
}: {
  items: Tagged[];
  value: GenreStyleSelection;
  onChange: (next: GenreStyleSelection) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [styleQuery, setStyleQuery] = useState('');
  const [showAllStyles, setShowAllStyles] = useState(false);

  // Each group's counts reflect the other group's selection, so picking
  // genres narrows the styles to those that actually occur on those records.
  const genreOptions = useMemo(
    () => tally(items.filter((i) => anyOf(i.styles, value.styles)), 'genres'),
    [items, value.styles],
  );
  const styleOptions = useMemo(
    () => tally(items.filter((i) => anyOf(i.genres, value.genres)), 'styles'),
    [items, value.genres],
  );

  const withSelected = (options: { value: string; count: number }[], selected: string[]) => {
    const present = new Set(options.map((o) => o.value));
    return [...selected.filter((s) => !present.has(s)).map((s) => ({ value: s, count: 0 })), ...options];
  };

  const genres = withSelected(genreOptions, value.genres);
  const q = styleQuery.trim().toLowerCase();
  const allStyles = withSelected(styleOptions, value.styles).filter((o) => !q || o.value.toLowerCase().includes(q));
  const visibleStyles = q || showAllStyles ? allStyles : allStyles.slice(0, STYLE_LIMIT);

  const toggle = (kind: keyof GenreStyleSelection, v: string) => {
    const current = value[kind];
    onChange({ ...value, [kind]: current.includes(v) ? current.filter((x) => x !== v) : [...current, v] });
  };

  const chip = (kind: keyof GenreStyleSelection, o: { value: string; count: number }) => {
    const selected = value[kind].includes(o.value);
    return (
      <Pressable
        key={o.value}
        onPress={() => toggle(kind, o.value)}
        style={({ pressed }) => [styles.sheetChip, selected && styles.sheetChipSelected, pressed && { opacity: 0.6 }]}
      >
        <Text style={[styles.sheetChipText, selected && styles.sheetChipTextSelected]}>{o.value}</Text>
        <Text style={[styles.sheetChipCount, selected && styles.sheetChipTextSelected]}>{o.count}</Text>
      </Pressable>
    );
  };

  return (
    <View style={styles.overlay}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      <View style={[styles.sheet, { maxHeight: height * 0.85, paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.sheetHeader}>
          <Pressable onPress={() => onChange(EMPTY_SELECTION)} hitSlop={8} disabled={!selectionCount(value)}>
            <Text style={[styles.sheetClear, !selectionCount(value) && { opacity: 0.3 }]}>Clear</Text>
          </Pressable>
          <Text style={styles.sheetTitle}>Genre & style</Text>
          <Pressable onPress={onClose} hitSlop={8}>
            <Text style={styles.sheetDone}>Done</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.sheetBody} keyboardShouldPersistTaps="handled">
          <Text style={styles.sectionLabel}>Genres</Text>
          <View style={styles.chipWrap}>{genres.map((o) => chip('genres', o))}</View>

          <Text style={styles.sectionLabel}>
            Styles{value.genres.length ? ` in ${value.genres.join(', ')}` : ''}
          </Text>
          <TextInput
            style={styles.styleSearch}
            value={styleQuery}
            onChangeText={setStyleQuery}
            placeholder={`Search ${allStyles.length} styles`}
            placeholderTextColor="rgba(26,22,38,0.4)"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <View style={styles.chipWrap}>{visibleStyles.map((o) => chip('styles', o))}</View>
          {!q && !showAllStyles && allStyles.length > STYLE_LIMIT ? (
            <Pressable onPress={() => setShowAllStyles(true)} style={styles.showAll}>
              <Text style={styles.showAllText}>Show all {allStyles.length} styles</Text>
            </Pressable>
          ) : null}
          {visibleStyles.length === 0 ? <Text style={styles.noStyles}>No matching styles</Text> : null}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  barScroll: { flexGrow: 0, flexShrink: 0 },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingBottom: 12 },
  trigger: {
    height: 30,
    paddingHorizontal: 12,
    borderRadius: 15,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  triggerText: { fontSize: 13, fontWeight: '600' },
  activeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 30,
    paddingHorizontal: 10,
    borderRadius: 15,
    borderWidth: 1,
  },
  activeChipText: { fontSize: 13, fontWeight: '500' },
  activeChipX: { fontSize: 11 },
  clearInline: { paddingHorizontal: 4 },
  clearInlineText: { fontSize: 13, fontWeight: '500' },

  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(26,22,38,0.1)',
  },
  sheetTitle: { fontSize: 16, fontWeight: '700', color: '#1A1626' },
  sheetClear: { fontSize: 14, color: 'rgba(26,22,38,0.55)', fontWeight: '500' },
  sheetDone: { fontSize: 14, color: ACCENT, fontWeight: '700' },
  sheetBody: { paddingHorizontal: 20, paddingBottom: 12 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(26,22,38,0.5)',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginTop: 18,
    marginBottom: 10,
  },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  sheetChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: 'rgba(26,22,38,0.06)',
  },
  sheetChipSelected: { backgroundColor: ACCENT },
  sheetChipText: { fontSize: 13, color: '#1A1626', fontWeight: '500' },
  sheetChipCount: { fontSize: 11, color: 'rgba(26,22,38,0.45)', fontWeight: '600' },
  sheetChipTextSelected: { color: '#fff' },
  styleSearch: {
    fontSize: 14,
    color: '#1A1626',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(26,22,38,0.06)',
    marginBottom: 12,
    outlineStyle: 'none',
  } as any,
  showAll: { alignSelf: 'flex-start', marginTop: 12, paddingVertical: 6 },
  showAllText: { fontSize: 13, color: ACCENT, fontWeight: '600' },
  noStyles: { fontSize: 13, color: 'rgba(26,22,38,0.45)', paddingVertical: 8 },
});
