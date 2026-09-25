import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Section } from '@/app';
import { Text } from '@/components/Text';

const DRAWER_WIDTH = 300;

export interface MenuItem {
  localIndex: number;
  label: string;
}

const ORGANISE: MenuItem[] = [
  { localIndex: 0, label: '🦆 Today' },
  { localIndex: 1, label: '🐝 To Do' },
  { localIndex: 2, label: '🦚 La Dolce Vita' },
];

// Per-section look in the drawer: an emoji tile and an accent used for the
// tile tint, the active page pill and its dot.
const SECTION_STYLE: Record<Section, { label: string; icon: string; accent: string }> = {
  organise:   { label: 'Organise', icon: '🗂️', accent: '#F472B6' },
  notes:      { label: 'Notes',    icon: '📝', accent: '#FACC15' },
  vault:      { label: 'Vault',    icon: '🔐', accent: '#34D399' },
  cinema:     { label: 'Cinema',   icon: '🎬', accent: '#A78BFA' },
  library:    { label: 'Library',  icon: '📚', accent: '#F59E0B' },
  videogames: { label: 'Games',    icon: '🎮', accent: '#818CF8' },
  deadhead:   { label: 'Deadhead', icon: '💀', accent: '#F87171' },
};

// Hex accent + alpha (0–1) -> rgba(), for the translucent tints.
function tint(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

function formatToday(): string {
  return new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
}

interface Props {
  visible: boolean;
  currentSection: Section;
  currentLocalIndex: number;
  onSelectPage: (section: Section, localIndex: number) => void;
  onClose: () => void;
  notesPages: MenuItem[];
  vaultPages: MenuItem[];
  cinemaPages: MenuItem[];
  libraryPages: MenuItem[];
  videogamePages: MenuItem[];
  deadheadPages: MenuItem[];
}

function Chevron({ open }: { open: boolean }) {
  const rotation = useRef(new Animated.Value(open ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(rotation, { toValue: open ? 1 : 0, duration: 180, useNativeDriver: true }).start();
  }, [open, rotation]);
  const rotate = rotation.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '90deg'] });
  return <Animated.Text style={[styles.chevron, { transform: [{ rotate }] }]}>›</Animated.Text>;
}

export function SideDrawer({
  visible,
  currentSection,
  currentLocalIndex,
  onSelectPage,
  onClose,
  notesPages,
  vaultPages,
  cinemaPages,
  libraryPages,
  videogamePages,
  deadheadPages,
}: Props) {
  const insets = useSafeAreaInsets();
  const translateX = useRef(new Animated.Value(-DRAWER_WIDTH)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const [expanded, setExpanded] = useState<Set<Section>>(() => new Set([currentSection]));

  useEffect(() => {
    Animated.parallel([
      Animated.spring(translateX, {
        toValue: visible ? 0 : -DRAWER_WIDTH,
        useNativeDriver: true,
        damping: 24,
        stiffness: 240,
      }),
      Animated.timing(backdropOpacity, {
        toValue: visible ? 1 : 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();
  }, [visible, translateX, backdropOpacity]);

  // Auto-expand only the active section each time the drawer opens
  useEffect(() => {
    if (visible) {
      setExpanded(new Set([currentSection]));
    }
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (key: Section) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Drawer order matches the vertical section order in the app.
  const groups = useMemo<{ section: Section; pages: MenuItem[] }[]>(() => [
    { section: 'organise',   pages: ORGANISE },
    { section: 'notes',      pages: notesPages },
    { section: 'vault',      pages: vaultPages },
    { section: 'cinema',     pages: cinemaPages },
    { section: 'library',    pages: libraryPages },
    { section: 'videogames', pages: videogamePages },
    { section: 'deadhead',   pages: deadheadPages },
  ], [notesPages, vaultPages, cinemaPages, libraryPages, videogamePages, deadheadPages]);

  return (
    <View
      style={[StyleSheet.absoluteFill, styles.root]}
      pointerEvents={visible ? 'auto' : 'none'}
    >
      <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: backdropOpacity }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      <Animated.View style={[styles.drawer, { transform: [{ translateX }] }]}>
        <LinearGradient
          colors={['#1C1733', '#12101F', '#0B0A14']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0.4, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />
        {/* Soft colour glow behind the header */}
        <LinearGradient
          colors={['rgba(167,139,250,0.28)', 'rgba(244,114,182,0.10)', 'transparent']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0.8, y: 0.35 }}
          style={StyleSheet.absoluteFillObject}
        />

        <View style={[styles.header, { paddingTop: insets.top + 28 }]}>
          <LinearGradient
            colors={['#A78BFA', '#F472B6']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.logo}
          >
            <Text style={styles.logoText}>L</Text>
          </LinearGradient>
          <View style={styles.headerText}>
            <Text style={styles.appName}>Listful</Text>
            <Text style={styles.today}>{formatToday()}</Text>
          </View>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 32 }]}
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          {groups.map(({ section, pages }) => {
            const { label, icon, accent } = SECTION_STYLE[section];
            const open = expanded.has(section);
            const isCurrent = currentSection === section;
            return (
              <View key={section} style={styles.group}>
                <Pressable
                  style={({ pressed }) => [
                    styles.sectionHeader,
                    open && styles.sectionHeaderOpen,
                    pressed && styles.pressed,
                  ]}
                  onPress={() => toggle(section)}
                >
                  <View style={[styles.iconTile, { backgroundColor: tint(accent, 0.16), borderColor: tint(accent, 0.28) }]}>
                    <Text style={styles.iconText}>{icon}</Text>
                  </View>
                  <Text style={[styles.sectionLabel, isCurrent && styles.sectionLabelCurrent]}>{label}</Text>
                  {pages.length > 0 ? (
                    <View style={styles.countPill}>
                      <Text style={styles.countText}>{pages.length}</Text>
                    </View>
                  ) : null}
                  <Chevron open={open} />
                </Pressable>

                {open && pages.length > 0 ? (
                  <View style={styles.items}>
                    <View style={[styles.guide, { backgroundColor: tint(accent, 0.22) }]} />
                    {pages.map((item) => {
                      const active = isCurrent && currentLocalIndex === item.localIndex;
                      return (
                        <Pressable
                          key={item.localIndex}
                          style={({ pressed }) => [
                            styles.item,
                            active && { backgroundColor: tint(accent, 0.16) },
                            pressed && styles.pressed,
                          ]}
                          onPress={() => onSelectPage(section, item.localIndex)}
                        >
                          <Text
                            style={[styles.itemText, active && styles.itemTextActive]}
                            numberOfLines={1}
                          >
                            {item.label}
                          </Text>
                          {active ? (
                            <View style={[styles.activeDot, { backgroundColor: accent, shadowColor: accent }]} />
                          ) : null}
                        </Pressable>
                      );
                    })}
                  </View>
                ) : null}
              </View>
            );
          })}
        </ScrollView>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    zIndex: 100,
  },
  backdrop: {
    backgroundColor: 'rgba(8,6,20,0.55)',
  },
  drawer: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: DRAWER_WIDTH,
    overflow: 'hidden',
    borderTopRightRadius: 28,
    borderBottomRightRadius: 28,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: 'rgba(255,255,255,0.08)',
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 24,
    shadowOffset: { width: 8, height: 0 },
    elevation: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 22,
    paddingBottom: 22,
  },
  logo: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '800',
  },
  headerText: { flex: 1 },
  appName: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  today: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 12,
    fontWeight: '500',
    marginTop: 1,
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 14,
    gap: 4,
  },
  group: {},
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 14,
  },
  sectionHeaderOpen: {
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  pressed: { opacity: 0.6 },
  iconTile: {
    width: 34,
    height: 34,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconText: { fontSize: 16 },
  sectionLabel: {
    flex: 1,
    color: 'rgba(255,255,255,0.78)',
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: -0.1,
  },
  sectionLabelCurrent: {
    color: '#ffffff',
  },
  countPill: {
    minWidth: 22,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 11,
    backgroundColor: 'rgba(255,255,255,0.07)',
    alignItems: 'center',
  },
  countText: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 11,
    fontWeight: '600',
  },
  chevron: {
    width: 14,
    textAlign: 'center',
    color: 'rgba(255,255,255,0.4)',
    fontSize: 18,
    fontWeight: '600',
  },
  items: {
    marginLeft: 25,
    paddingLeft: 14,
    paddingTop: 4,
    paddingBottom: 8,
    gap: 2,
  },
  guide: {
    position: 'absolute',
    left: 0,
    top: 6,
    bottom: 10,
    width: 1.5,
    borderRadius: 1,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 11,
  },
  itemText: {
    flex: 1,
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14.5,
    fontWeight: '500',
  },
  itemTextActive: {
    color: '#ffffff',
    fontWeight: '600',
  },
  activeDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    marginLeft: 8,
    shadowOpacity: 0.9,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
  },
});
