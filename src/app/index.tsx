import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { PageBackground } from '@/components/PageBackground';
import { SideDrawer } from '@/components/SideDrawer';
import { makeConfig, type CategoryConfig } from '@/lib/logCategories';
import { supabase } from '@/lib/supabase';
import { LogPage } from '@/screens/LogPage';
import NotesPage from '@/screens/NotesPage';
import EntertainmentPage from '@/screens/entertainment';
import HabitsPage from '@/screens/habits';
import TodoPage from '@/screens/todo';

const ORGANISE_COUNT = 3;

const ORGANISE_BG = {
  layer1: ['#FBBFE8', '#C3B8FF', '#B8EEE4', '#FBBFE8'] as const,
  layer2: ['#FFE8C3', 'transparent', '#C3DCFF'] as const,
};
const VAULT_BG = {
  layer1: ['#FDE68A', '#6EE7B7', '#93C5FD', '#FDE68A'] as const,
  layer2: ['#FCA5A5', 'transparent', '#C4B5FD'] as const,
};
const NOTES_BG = {
  layer1: ['#FEF9C3', '#FFFBEB', '#FEF3C7', '#FEF9C3'] as const,
  layer2: ['#FDE68A', 'transparent', '#D9F99D'] as const,
};

type Section = 'organise' | 'vault' | 'notes';

interface SectionItem {
  id: string;
  Component: React.ComponentType;
}

function HamburgerIcon() {
  return (
    <View style={hamburger.root}>
      <View style={hamburger.line} />
      <View style={hamburger.line} />
      <View style={hamburger.line} />
    </View>
  );
}
const hamburger = StyleSheet.create({
  root: { width: 20, height: 14, justifyContent: 'space-between' },
  line: { width: 20, height: 2, borderRadius: 1, backgroundColor: 'white' },
});

export default function App() {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [vaultConfigs, setVaultConfigs] = useState<CategoryConfig[]>([]);
  const [currentSection, setCurrentSection] = useState<Section>('organise');
  // Track the active page index within each section independently
  const [sectionPage, setSectionPage] = useState({ organise: 0, vault: 0, notes: 0 });
  const [pagerHeight, setPagerHeight] = useState(0);

  const flatRef = useRef<FlatList<SectionItem>>(null);

  useEffect(() => {
    supabase
      .from('logs')
      .select('category')
      .then(({ data }) => {
        if (!data) return;
        const keys = [...new Set(data.map((r) => r.category as string))].sort();
        setVaultConfigs(keys.map(makeConfig));
      });
  }, []);

  // Cache vault page components by category key to prevent remounts
  const compCache = useRef(new Map<string, React.ComponentType>());
  const getVaultComponent = useCallback((config: CategoryConfig) => {
    if (!compCache.current.has(config.key)) {
      const Comp = () => <LogPage config={config} />;
      compCache.current.set(config.key, Comp);
    }
    return compCache.current.get(config.key)!;
  }, []);

  const vaultPageComponents = useMemo(
    () => vaultConfigs.map(getVaultComponent),
    [vaultConfigs, getVaultComponent],
  );

  const notesPageIndex = ORGANISE_COUNT + vaultConfigs.length;

  // Pages shown in the horizontal pager for the active section
  const sectionData = useMemo<SectionItem[]>(() => {
    if (currentSection === 'organise') return [
      { id: 'habits',        Component: HabitsPage },
      { id: 'todo',          Component: TodoPage },
      { id: 'entertainment', Component: EntertainmentPage },
    ];
    if (currentSection === 'vault') return vaultConfigs.map((config, i) => ({
      id: config.key,
      Component: vaultPageComponents[i],
    }));
    return [{ id: 'notes', Component: NotesPage }];
  }, [currentSection, vaultConfigs, vaultPageComponents]);

  // Global page index (used by drawer for active-item highlighting)
  const currentPage =
    currentSection === 'organise' ? sectionPage.organise :
    currentSection === 'vault'    ? ORGANISE_COUNT + sectionPage.vault :
    notesPageIndex;

  const bg =
    currentSection === 'organise' ? ORGANISE_BG :
    currentSection === 'vault'    ? VAULT_BG :
    NOTES_BG;

  const vaultMenuItems = useMemo(
    () => vaultConfigs.map((config, i) => ({ index: ORGANISE_COUNT + i, label: config.title })),
    [vaultConfigs],
  );

  const navigateTo = useCallback((globalIndex: number) => {
    let newSection: Section;
    let localIndex: number;
    if (globalIndex < ORGANISE_COUNT) {
      newSection = 'organise';
      localIndex = globalIndex;
    } else if (globalIndex < notesPageIndex) {
      newSection = 'vault';
      localIndex = globalIndex - ORGANISE_COUNT;
    } else {
      newSection = 'notes';
      localIndex = 0;
    }

    if (newSection === currentSection) {
      // Same section — scroll imperatively so the FlatList doesn't remount
      flatRef.current?.scrollToIndex({ index: localIndex, animated: false });
      setSectionPage((prev) => ({ ...prev, [newSection]: localIndex }));
    } else {
      // Different section — update page first so initialScrollIndex is correct on remount
      setSectionPage((prev) => ({ ...prev, [newSection]: localIndex }));
      setCurrentSection(newSection);
    }
    setDrawerOpen(false);
  }, [currentSection, notesPageIndex]);

  const getItemLayout = useCallback(
    (_: unknown, index: number) => ({ length: width, offset: width * index, index }),
    [width],
  );

  const renderItem = useCallback(
    ({ item }: { item: SectionItem }) => (
      <View style={{ width, height: pagerHeight }}>
        <item.Component />
      </View>
    ),
    [width, pagerHeight],
  );

  return (
    <View style={styles.root}>
      <PageBackground layer1={bg.layer1} layer2={bg.layer2} />
      <SafeAreaView style={styles.fill}>
        <View
          style={styles.fill}
          onLayout={(e) => setPagerHeight(e.nativeEvent.layout.height)}
        >
          {currentSection === 'notes' ? (
            // Render Notes directly — bypasses the outer FlatList entirely so
            // Android gesture handling never competes with Notes' inner pager
            <NotesPage />
          ) : (
            pagerHeight > 0 && (
              <>
                <FlatList
                  key={currentSection}
                  ref={flatRef}
                  data={sectionData}
                  horizontal
                  pagingEnabled
                  showsHorizontalScrollIndicator={false}
                  scrollEventThrottle={32}
                  keyExtractor={(item) => item.id}
                  renderItem={renderItem}
                  getItemLayout={getItemLayout}
                  initialScrollIndex={sectionPage[currentSection]}
                  onMomentumScrollEnd={(e) => {
                    const idx = Math.round(e.nativeEvent.contentOffset.x / width);
                    setSectionPage((prev) => ({ ...prev, [currentSection]: idx }));
                  }}
                />
                {sectionData.length > 1 && (
                  <View style={styles.dots}>
                    {sectionData.map((_, i) => (
                      <View
                        key={i}
                        style={[styles.dot, i === sectionPage[currentSection] && styles.dotActive]}
                      />
                    ))}
                  </View>
                )}
              </>
            )
          )}
        </View>

        <Pressable
          style={[styles.menuButton, { top: insets.top + 14 }]}
          onPress={() => setDrawerOpen(true)}
          hitSlop={12}
        >
          <View style={styles.menuBg}>
            <HamburgerIcon />
          </View>
        </Pressable>
      </SafeAreaView>

      <SideDrawer
        visible={drawerOpen}
        currentPage={currentPage}
        onSelectPage={navigateTo}
        onClose={() => setDrawerOpen(false)}
        vaultPages={vaultMenuItems}
        notesPageIndex={notesPageIndex}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  fill: { flex: 1 },
  menuButton: {
    position: 'absolute',
    left: 16,
    zIndex: 50,
  },
  menuBg: {
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 8,
    padding: 10,
  },
  dots: {
    position: 'absolute',
    bottom: 14,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.45)',
  },
  dotActive: {
    backgroundColor: 'rgba(255,255,255,0.9)',
  },
});
