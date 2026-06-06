import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const DRAWER_WIDTH = 280;

interface MenuItem {
  index: number;
  label: string;
}

const ORGANISE: MenuItem[] = [
  { index: 0, label: '🦆 Today' },
  { index: 1, label: '🐝 To Do' },
  { index: 2, label: '🦚 La Dolce Vita' },
];

interface Props {
  visible: boolean;
  currentPage: number;
  onSelectPage: (index: number) => void;
  onClose: () => void;
  vaultPages: MenuItem[];
  notesPageIndex: number;
}

type SectionKey = 'organise' | 'vault' | 'notes';

function activeSection(currentPage: number, notesPageIndex: number): SectionKey {
  if (currentPage < 3) return 'organise';
  if (currentPage < notesPageIndex) return 'vault';
  return 'notes';
}

export function SideDrawer({ visible, currentPage, onSelectPage, onClose, vaultPages, notesPageIndex }: Props) {
  const insets = useSafeAreaInsets();
  const translateX = useRef(new Animated.Value(-DRAWER_WIDTH)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const [expanded, setExpanded] = useState<Set<SectionKey>>(
    () => new Set([activeSection(currentPage, notesPageIndex)])
  );

  // Slide animation
  useEffect(() => {
    Animated.parallel([
      Animated.spring(translateX, {
        toValue: visible ? 0 : -DRAWER_WIDTH,
        useNativeDriver: true,
        damping: 22,
        stiffness: 220,
      }),
      Animated.timing(backdropOpacity, {
        toValue: visible ? 1 : 0,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start();
  }, [visible, translateX, backdropOpacity]);

  // Auto-expand only the active section each time the drawer opens
  useEffect(() => {
    if (visible) {
      setExpanded(new Set([activeSection(currentPage, notesPageIndex)]));
    }
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (key: SectionKey) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <View
      style={[StyleSheet.absoluteFill, styles.root]}
      pointerEvents={visible ? 'auto' : 'none'}
    >
      <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: backdropOpacity }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      <Animated.View
        style={[styles.drawer, { paddingTop: insets.top + 24 }, { transform: [{ translateX }] }]}
      >
        <Text style={styles.appName}>Listful</Text>

        <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
          {/* Organise */}
          <Pressable style={styles.sectionHeader} onPress={() => toggle('organise')} hitSlop={8}>
            <Text style={styles.sectionLabel}>Organise</Text>
            <Text style={styles.chevron}>{expanded.has('organise') ? '▾' : '▸'}</Text>
          </Pressable>
          {expanded.has('organise') && ORGANISE.map((item) => (
            <Pressable
              key={item.index}
              style={[styles.item, currentPage === item.index && styles.itemActive]}
              onPress={() => onSelectPage(item.index)}
            >
              <Text style={[styles.itemText, currentPage === item.index && styles.itemTextActive]}>
                {item.label}
              </Text>
            </Pressable>
          ))}

          <View style={styles.divider} />

          {/* Vault */}
          <Pressable style={styles.sectionHeader} onPress={() => toggle('vault')} hitSlop={8}>
            <Text style={styles.sectionLabel}>Vault</Text>
            <Text style={styles.chevron}>{expanded.has('vault') ? '▾' : '▸'}</Text>
          </Pressable>
          {expanded.has('vault') && vaultPages.map((item) => (
            <Pressable
              key={item.index}
              style={[styles.item, currentPage === item.index && styles.itemActive]}
              onPress={() => onSelectPage(item.index)}
            >
              <Text style={[styles.itemText, currentPage === item.index && styles.itemTextActive]}>
                {item.label}
              </Text>
            </Pressable>
          ))}

          <View style={styles.divider} />

          {/* Notes */}
          <Pressable style={styles.sectionHeader} onPress={() => toggle('notes')} hitSlop={8}>
            <Text style={styles.sectionLabel}>Notes</Text>
            <Text style={styles.chevron}>{expanded.has('notes') ? '▾' : '▸'}</Text>
          </Pressable>
          {expanded.has('notes') && (
            <Pressable
              style={[styles.item, currentPage === notesPageIndex && styles.itemActive]}
              onPress={() => onSelectPage(notesPageIndex)}
            >
              <Text style={[styles.itemText, currentPage === notesPageIndex && styles.itemTextActive]}>
                Notes 📝
              </Text>
            </Pressable>
          )}
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
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  drawer: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: DRAWER_WIDTH,
    backgroundColor: '#0E0E1A',
    paddingHorizontal: 20,
    paddingBottom: 32,
  },
  appName: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 32,
    letterSpacing: 0.5,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
    marginTop: 4,
    paddingRight: 2,
  },
  sectionLabel: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  chevron: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 13,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginVertical: 16,
  },
  item: {
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 2,
  },
  itemActive: {
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  itemText: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 16,
    fontWeight: '500',
  },
  itemTextActive: {
    color: '#ffffff',
    fontWeight: '600',
  },
});
