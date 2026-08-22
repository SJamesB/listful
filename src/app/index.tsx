import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { PageBackground } from '@/components/PageBackground';
import { SectionPager, type SectionItem, type SectionPagerHandle } from '@/components/SectionPager';
import { SideDrawer } from '@/components/SideDrawer';
import {
  VerticalSectionPager,
  type SectionDef,
  type VerticalSectionPagerHandle,
} from '@/components/VerticalSectionPager';
import type { EdgesChangeHandler } from '@/hooks/use-section-edge-scroll';
import { makeConfig, sortCategoryKeys, type CategoryConfig } from '@/lib/logCategories';
import { supabase } from '@/lib/supabase';
import { LogPage } from '@/screens/LogPage';
import NotesPage, { type Note, type NotesPageHandle } from '@/screens/NotesPage';
import CinemaPosterPage, { type CinemaPosterPageProps } from '@/screens/CinemaPosterPage';
import DeadheadShowsPage from '@/screens/DeadheadShowsPage';
import DeadheadStatsPage from '@/screens/DeadheadStatsPage';
import LibraryBookPage, { type LibraryBookPageProps } from '@/screens/LibraryBookPage';
import VideogamePosterPage, { type VideogamePosterPageProps } from '@/screens/VideogamePosterPage';
import EntertainmentPage from '@/screens/entertainment';
import HabitsPage from '@/screens/habits';
import TodoPage from '@/screens/todo';

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
const CINEMA_BG = {
  layer1: ['#EDE9FE', '#DDD6FE', '#C4B5FD', '#EDE9FE'] as const,
  layer2: ['#A78BFA', 'transparent', '#7C3AED'] as const,
};
const LIBRARY_BG = {
  layer1: ['#FDE9D0', '#F5D6A8', '#E8C08A', '#FDE9D0'] as const,
  layer2: ['#C08552', 'transparent', '#8B5A2B'] as const,
};
const VIDEOGAMES_BG = {
  layer1: ['#C7D2FE', '#A5B4FC', '#818CF8', '#C7D2FE'] as const,
  layer2: ['#818CF8', 'transparent', '#4F46E5'] as const,
};
const DEADHEAD_BG = {
  layer1: ['#FEE2C7', '#FCA5A5', '#FDBA74', '#FEE2C7'] as const,
  layer2: ['#F97316', 'transparent', '#DC2626'] as const,
};

export type Section = 'organise' | 'vault' | 'notes' | 'cinema' | 'library' | 'videogames' | 'deadhead';

interface EdgeState {
  atTop: boolean;
  atBottom: boolean;
}

// Vertical scroll order between sections — matches the side drawer's order.
const SECTION_ORDER: Section[] = ['organise', 'notes', 'vault', 'cinema', 'library', 'videogames', 'deadhead'];

const CINEMA_MENU_ITEMS = [
  { localIndex: 0, label: '🍿 Watchlist' },
  { localIndex: 1, label: '🎥 Watched' },
  { localIndex: 2, label: '🏆 9-Club' },
];

const LIBRARY_MENU_ITEMS = [
  { localIndex: 0, label: '📖 To Read' },
  { localIndex: 1, label: '📚 Read' },
  { localIndex: 2, label: '🏆 9-Club' },
];

const VIDEOGAMES_MENU_ITEMS = [
  { localIndex: 0, label: '🎮 Backlog' },
  { localIndex: 1, label: '🕹️ Played' },
  { localIndex: 2, label: '🏆 9-Club' },
];

const DEADHEAD_MENU_ITEMS = [
  { localIndex: 0, label: '🌹 Shows' },
  { localIndex: 1, label: '📊 Stats' },
];

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
  const [notesList, setNotesList] = useState<Note[]>([]);
  const [sectionIndex, setSectionIndex] = useState(0);
  const [sectionPage, setSectionPage] = useState({ organise: 0, vault: 0, notes: 0, cinema: 0, library: 0, videogames: 0, deadhead: 0 });
  const [pagerHeight, setPagerHeight] = useState(0);

  const currentSection = SECTION_ORDER[sectionIndex];

  const verticalRef = useRef<VerticalSectionPagerHandle>(null);
  const organiseRef = useRef<SectionPagerHandle>(null);
  const notesRef = useRef<NotesPageHandle>(null);
  const vaultRef = useRef<SectionPagerHandle>(null);
  const cinemaRef = useRef<SectionPagerHandle>(null);
  const libraryRef = useRef<SectionPagerHandle>(null);
  const videogamesRef = useRef<SectionPagerHandle>(null);
  const deadheadRef = useRef<SectionPagerHandle>(null);

  // Tracks whether each section's content is scrolled to its top/bottom edge,
  // so the vertical pager knows when it's safe to take over a vertical drag.
  // Sections that never report (e.g. notes) stay permissively "at both edges".
  const edgesRef = useRef<Record<Section, EdgeState>>({
    organise: { atTop: true, atBottom: true },
    notes: { atTop: true, atBottom: true },
    vault: { atTop: true, atBottom: true },
    cinema: { atTop: true, atBottom: true },
    library: { atTop: true, atBottom: true },
    videogames: { atTop: true, atBottom: true },
    deadhead: { atTop: true, atBottom: true },
  });

  const onEdgesChange = useMemo(() => {
    const make = (section: Section): EdgesChangeHandler => (atTop, atBottom) => {
      edgesRef.current[section] = { atTop, atBottom };
    };
    return {
      organise: make('organise'),
      vault: make('vault'),
      cinema: make('cinema'),
      library: make('library'),
      videogames: make('videogames'),
      deadhead: make('deadhead'),
    };
  }, []);

  useEffect(() => {
    supabase
      .from('logs')
      .select('category')
      .then(({ data }) => {
        if (!data) return;
        const keys = sortCategoryKeys([...new Set(data.map((r) => r.category as string))]);
        setVaultConfigs(keys.map(makeConfig));
      });
  }, []);

  // Fetched independently of NotesPage mounting — the vertical pager only
  // renders the active section, so the drawer's Notes list would otherwise
  // stay empty until the user actually swipes to Notes at least once.
  useEffect(() => {
    supabase
      .from('notes')
      .select('*')
      .order('sort_order', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true })
      .then(({ data }) => {
        if (data) setNotesList(data);
      });
  }, []);

  // Cache vault page components by category key to prevent remounts
  const vaultCompCache = useRef(new Map<string, SectionItem['Component']>());
  const getVaultComponent = useCallback((config: CategoryConfig) => {
    if (!vaultCompCache.current.has(config.key)) {
      const Comp = ({ onEdgesChange }: { onEdgesChange?: EdgesChangeHandler }) => (
        <LogPage config={config} onEdgesChange={onEdgesChange} />
      );
      vaultCompCache.current.set(config.key, Comp);
    }
    return vaultCompCache.current.get(config.key)!;
  }, []);

  // Cache cinema page components — keyed by page id, props are baked in at creation
  const cinemaCompCache = useRef(new Map<string, SectionItem['Component']>());
  const getCinemaComponent = useCallback(
    (id: string, props: CinemaPosterPageProps) => {
      if (!cinemaCompCache.current.has(id)) {
        const Comp = ({ onEdgesChange }: { onEdgesChange?: EdgesChangeHandler }) => (
          <CinemaPosterPage {...props} onEdgesChange={onEdgesChange} />
        );
        cinemaCompCache.current.set(id, Comp);
      }
      return cinemaCompCache.current.get(id)!;
    },
    [],
  );

  const vaultPageComponents = useMemo(
    () => vaultConfigs.map(getVaultComponent),
    [vaultConfigs, getVaultComponent],
  );

  // Cache library page components — keyed by page id, props are baked in at creation
  const libraryCompCache = useRef(new Map<string, SectionItem['Component']>());
  const getLibraryComponent = useCallback(
    (id: string, props: LibraryBookPageProps) => {
      if (!libraryCompCache.current.has(id)) {
        const Comp = ({ onEdgesChange }: { onEdgesChange?: EdgesChangeHandler }) => (
          <LibraryBookPage {...props} onEdgesChange={onEdgesChange} />
        );
        libraryCompCache.current.set(id, Comp);
      }
      return libraryCompCache.current.get(id)!;
    },
    [],
  );

  const cinemaPageComponents = useMemo(() => [
    getCinemaComponent('watchlist', { title: '🍿 Watchlist', mode: 'watch',     status: 'to_watch' }),
    getCinemaComponent('watched',   { title: '🎥 Watched',    mode: 'watch',     status: 'watched'  }),
    getCinemaComponent('nineClub',  { title: '🏆 9-Club',     mode: 'nine_club'                      }),
  ], [getCinemaComponent]);

  const libraryPageComponents = useMemo(() => [
    getLibraryComponent('toRead',   { title: '📖 To Read', mode: 'read',      status: 'to_read' }),
    getLibraryComponent('read',     { title: '📚 Read',     mode: 'read',      status: 'read'    }),
    getLibraryComponent('nineClub', { title: '🏆 9-Club',  mode: 'nine_club'                    }),
  ], [getLibraryComponent]);

  // Cache videogame page components — keyed by page id, props are baked in at creation
  const videogamesCompCache = useRef(new Map<string, SectionItem['Component']>());
  const getVideogamesComponent = useCallback(
    (id: string, props: VideogamePosterPageProps) => {
      if (!videogamesCompCache.current.has(id)) {
        const Comp = ({ onEdgesChange }: { onEdgesChange?: EdgesChangeHandler }) => (
          <VideogamePosterPage {...props} onEdgesChange={onEdgesChange} />
        );
        videogamesCompCache.current.set(id, Comp);
      }
      return videogamesCompCache.current.get(id)!;
    },
    [],
  );

  const videogamesPageComponents = useMemo(() => [
    getVideogamesComponent('backlog',  { title: '🎮 Backlog', mode: 'play',      status: 'to_play' }),
    getVideogamesComponent('played',   { title: '🕹️ Played',  mode: 'play',      status: 'play'    }),
    getVideogamesComponent('nineClub', { title: '🏆 9-Club',  mode: 'nine_club'                     }),
  ], [getVideogamesComponent]);

  const deadheadData = useMemo<SectionItem[]>(() => [
    { id: 'shows', Component: DeadheadShowsPage },
    { id: 'stats', Component: DeadheadStatsPage },
  ], []);

  const organiseData = useMemo<SectionItem[]>(() => [
    { id: 'habits',        Component: HabitsPage },
    { id: 'todo',          Component: TodoPage },
    { id: 'entertainment', Component: EntertainmentPage },
  ], []);

  const vaultData = useMemo<SectionItem[]>(
    () => vaultConfigs.map((config, i) => ({ id: config.key, Component: vaultPageComponents[i] })),
    [vaultConfigs, vaultPageComponents],
  );

  const cinemaData = useMemo<SectionItem[]>(
    () => cinemaPageComponents.map((Component, i) => ({ id: `cinema-${i}`, Component })),
    [cinemaPageComponents],
  );

  const libraryData = useMemo<SectionItem[]>(
    () => libraryPageComponents.map((Component, i) => ({ id: `library-${i}`, Component })),
    [libraryPageComponents],
  );

  const videogamesData = useMemo<SectionItem[]>(
    () => videogamesPageComponents.map((Component, i) => ({ id: `videogames-${i}`, Component })),
    [videogamesPageComponents],
  );

  const bg =
    currentSection === 'organise'   ? ORGANISE_BG :
    currentSection === 'vault'      ? VAULT_BG :
    currentSection === 'cinema'     ? CINEMA_BG :
    currentSection === 'library'    ? LIBRARY_BG :
    currentSection === 'videogames' ? VIDEOGAMES_BG :
    currentSection === 'deadhead'   ? DEADHEAD_BG :
    NOTES_BG;

  const vaultMenuItems = useMemo(
    () => vaultConfigs.map((config, i) => ({ localIndex: i, label: config.title })),
    [vaultConfigs],
  );

  const notesMenuItems = useMemo(
    () => notesList.map((note, i) => ({ localIndex: i, label: note.title.trim() || 'Untitled' })),
    [notesList],
  );

  const navigateTo = useCallback((section: Section, localIndex: number) => {
    if (section !== currentSection) {
      verticalRef.current?.jumpTo(SECTION_ORDER.indexOf(section));
    }
    setSectionPage((prev) => ({ ...prev, [section]: localIndex }));

    const ref =
      section === 'organise' ? organiseRef :
      section === 'notes'    ? notesRef :
      section === 'vault'    ? vaultRef :
      section === 'cinema'     ? cinemaRef :
      section === 'library'    ? libraryRef :
      section === 'videogames' ? videogamesRef :
      section === 'deadhead'   ? deadheadRef :
      null;
    ref?.current?.scrollToIndex(localIndex);

    setDrawerOpen(false);
  }, [currentSection]);

  const sections: SectionDef<Section>[] = [
    {
      key: 'organise',
      render: () => (
        <SectionPager
          ref={organiseRef}
          data={organiseData}
          width={width}
          height={pagerHeight}
          initialIndex={sectionPage.organise}
          onPageChange={(i) => setSectionPage((p) => ({ ...p, organise: i }))}
          onEdgesChange={onEdgesChange.organise}
        />
      ),
    },
    {
      key: 'notes',
      render: () => (
        <NotesPage
          ref={notesRef}
          onNotesChange={setNotesList}
          onPageChange={(i) => setSectionPage((p) => ({ ...p, notes: i }))}
        />
      ),
    },
    {
      key: 'vault',
      render: () => (
        <SectionPager
          ref={vaultRef}
          data={vaultData}
          width={width}
          height={pagerHeight}
          initialIndex={sectionPage.vault}
          onPageChange={(i) => setSectionPage((p) => ({ ...p, vault: i }))}
          onEdgesChange={onEdgesChange.vault}
        />
      ),
    },
    {
      key: 'cinema',
      render: () => (
        <SectionPager
          ref={cinemaRef}
          data={cinemaData}
          width={width}
          height={pagerHeight}
          initialIndex={sectionPage.cinema}
          onPageChange={(i) => setSectionPage((p) => ({ ...p, cinema: i }))}
          onEdgesChange={onEdgesChange.cinema}
        />
      ),
    },
    {
      key: 'library',
      render: () => (
        <SectionPager
          ref={libraryRef}
          data={libraryData}
          width={width}
          height={pagerHeight}
          initialIndex={sectionPage.library}
          onPageChange={(i) => setSectionPage((p) => ({ ...p, library: i }))}
          onEdgesChange={onEdgesChange.library}
        />
      ),
    },
    {
      key: 'videogames',
      render: () => (
        <SectionPager
          ref={videogamesRef}
          data={videogamesData}
          width={width}
          height={pagerHeight}
          initialIndex={sectionPage.videogames}
          onPageChange={(i) => setSectionPage((p) => ({ ...p, videogames: i }))}
          onEdgesChange={onEdgesChange.videogames}
        />
      ),
    },
    {
      key: 'deadhead',
      render: () => (
        <SectionPager
          ref={deadheadRef}
          data={deadheadData}
          width={width}
          height={pagerHeight}
          initialIndex={sectionPage.deadhead}
          onPageChange={(i) => setSectionPage((p) => ({ ...p, deadhead: i }))}
          onEdgesChange={onEdgesChange.deadhead}
        />
      ),
    },
  ];

  return (
    <View style={styles.root}>
      <PageBackground layer1={bg.layer1} layer2={bg.layer2} />
      <SafeAreaView style={styles.fill}>
        <View
          style={styles.fill}
          onLayout={(e) => setPagerHeight(e.nativeEvent.layout.height)}
        >
          {pagerHeight > 0 && (
            <VerticalSectionPager
              ref={verticalRef}
              sections={sections}
              activeIndex={sectionIndex}
              onActiveIndexChange={setSectionIndex}
              width={width}
              height={pagerHeight}
            />
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
        currentSection={currentSection}
        currentLocalIndex={sectionPage[currentSection]}
        onSelectPage={navigateTo}
        onClose={() => setDrawerOpen(false)}
        notesPages={notesMenuItems}
        vaultPages={vaultMenuItems}
        cinemaPages={CINEMA_MENU_ITEMS}
        libraryPages={LIBRARY_MENU_ITEMS}
        videogamePages={VIDEOGAMES_MENU_ITEMS}
        deadheadPages={DEADHEAD_MENU_ITEMS}
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
});
