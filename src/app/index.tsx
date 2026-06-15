import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { PageBackground } from '@/components/PageBackground';
import { SectionPager, type SectionItem, type SectionPagerHandle } from '@/components/SectionPager';
import { SideDrawer } from '@/components/SideDrawer';
import {
  VerticalSectionPager,
  type EdgeState,
  type SectionDef,
  type VerticalSectionPagerHandle,
} from '@/components/VerticalSectionPager';
import type { EdgesChangeHandler } from '@/hooks/use-section-edge-scroll';
import { makeConfig, type CategoryConfig } from '@/lib/logCategories';
import { completeWebAuth } from '@/lib/spotify';
import { supabase } from '@/lib/supabase';
import { LogPage } from '@/screens/LogPage';
import NotesPage from '@/screens/NotesPage';
import CinemaPosterPage, { type CinemaPosterPageProps } from '@/screens/CinemaPosterPage';
import SpotifyPage from '@/screens/SpotifyPage';
import SpotifyPlaylistPage from '@/screens/SpotifyPlaylistPage';
import EntertainmentPage from '@/screens/entertainment';
import HabitsPage from '@/screens/habits';
import TodoPage from '@/screens/todo';

// One fixed spotify page: main management view
const SPOTIFY_FIXED = 1;

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
const SPOTIFY_BG = {
  layer1: ['#D1FAE5', '#A7F3D0', '#6EE7B7', '#D1FAE5'] as const,
  layer2: ['#34D399', 'transparent', '#059669'] as const,
};

export type Section = 'organise' | 'vault' | 'notes' | 'cinema' | 'spotify';

// Vertical scroll order between sections — matches the side drawer's order.
const SECTION_ORDER: Section[] = ['organise', 'notes', 'vault', 'cinema', 'spotify'];

const CINEMA_MENU_ITEMS = [
  { localIndex: 0, label: '🍿 Watchlist' },
  { localIndex: 1, label: '🎥 Watched' },
  { localIndex: 2, label: '🏆 9-Club' },
];

interface SpotifyPinnedPlaylist {
  spotifyId: string;
  name: string;
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
  const [spotifyPlaylists, setSpotifyPlaylists] = useState<SpotifyPinnedPlaylist[]>([]);
  const [sectionIndex, setSectionIndex] = useState(0);
  const [sectionPage, setSectionPage] = useState({ organise: 0, vault: 0, notes: 0, cinema: 0, spotify: 0 });
  const [pagerHeight, setPagerHeight] = useState(0);

  const currentSection = SECTION_ORDER[sectionIndex];

  const verticalRef = useRef<VerticalSectionPagerHandle>(null);
  const organiseRef = useRef<SectionPagerHandle>(null);
  const vaultRef = useRef<SectionPagerHandle>(null);
  const cinemaRef = useRef<SectionPagerHandle>(null);
  const spotifyRef = useRef<SectionPagerHandle>(null);

  // Tracks whether each section's content is scrolled to its top/bottom edge,
  // so the vertical pager knows when it's safe to take over a vertical drag.
  // Sections that never report (e.g. notes) stay permissively "at both edges".
  const edgesRef = useRef<Record<Section, EdgeState>>({
    organise: { atTop: true, atBottom: true },
    notes: { atTop: true, atBottom: true },
    vault: { atTop: true, atBottom: true },
    cinema: { atTop: true, atBottom: true },
    spotify: { atTop: true, atBottom: true },
  });

  const onEdgesChange = useMemo(() => {
    const make = (section: Section): EdgesChangeHandler => (atTop, atBottom) => {
      edgesRef.current[section] = { atTop, atBottom };
    };
    return {
      organise: make('organise'),
      vault: make('vault'),
      cinema: make('cinema'),
      spotify: make('spotify'),
    };
  }, []);

  // Handle Spotify OAuth redirect back to the web app (?code=...)
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (!code) return;
    window.history.replaceState({}, '', window.location.pathname);
    completeWebAuth(code)
      .then(() => setSectionIndex(SECTION_ORDER.indexOf('spotify')))
      .catch((err) => console.warn('Spotify web auth failed:', err));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadSpotifyPlaylists = useCallback(() => {
    supabase
      .from('spotify_playlists')
      .select('spotify_id, name, page_order')
      .eq('pinned', true)
      .order('page_order', { ascending: true })
      .then(({ data }) => {
        if (!data) return;
        setSpotifyPlaylists(data.map((r) => ({ spotifyId: r.spotify_id, name: r.name })));
      });
  }, []);

  // Stable ref so SpotifyPage's cached closure always calls the latest version
  const loadSpotifyRef = useRef(loadSpotifyPlaylists);
  loadSpotifyRef.current = loadSpotifyPlaylists;

  useEffect(() => {
    supabase
      .from('logs')
      .select('category')
      .then(({ data }) => {
        if (!data) return;
        const keys = [...new Set(data.map((r) => r.category as string))].sort();
        setVaultConfigs(keys.map(makeConfig));
      });

    loadSpotifyPlaylists();
  }, [loadSpotifyPlaylists]);

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

  // Cache spotify page components
  const spotifyCompCache = useRef(new Map<string, SectionItem['Component']>());
  const getSpotifyComponent = useCallback(
    (id: string, factory: () => SectionItem['Component']) => {
      if (!spotifyCompCache.current.has(id)) {
        spotifyCompCache.current.set(id, factory());
      }
      return spotifyCompCache.current.get(id)!;
    },
    [],
  );

  const spotifyPageComponents = useMemo(() => [
    getSpotifyComponent('spotify-main', () => {
      const Comp = ({ onEdgesChange }: { onEdgesChange?: EdgesChangeHandler }) => (
        <SpotifyPage onPinsChanged={() => loadSpotifyRef.current()} onEdgesChange={onEdgesChange} />
      );
      return Comp;
    }),
    ...spotifyPlaylists.map((p) =>
      getSpotifyComponent(`spotify-${p.spotifyId}`, () => {
        const Comp = ({ onEdgesChange }: { onEdgesChange?: EdgesChangeHandler }) => (
          <SpotifyPlaylistPage title={p.name} spotifyId={p.spotifyId} onEdgesChange={onEdgesChange} />
        );
        return Comp;
      }),
    ),
  ], [spotifyPlaylists, getSpotifyComponent]);

  const cinemaPageComponents = useMemo(() => [
    getCinemaComponent('watchlist', { title: '🍿 Watchlist', mode: 'watch',     status: 'to_watch' }),
    getCinemaComponent('watched',   { title: '🎥 Watched',    mode: 'watch',     status: 'watched'  }),
    getCinemaComponent('nineClub',  { title: '🏆 9-Club',     mode: 'nine_club'                      }),
  ], [getCinemaComponent]);

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

  const spotifyData = useMemo<SectionItem[]>(
    () => spotifyPageComponents.map((Component, i) => ({ id: `spotify-${i}`, Component })),
    [spotifyPageComponents],
  );

  const bg =
    currentSection === 'organise' ? ORGANISE_BG :
    currentSection === 'vault'    ? VAULT_BG :
    currentSection === 'cinema'   ? CINEMA_BG :
    currentSection === 'spotify'  ? SPOTIFY_BG :
    NOTES_BG;

  const vaultMenuItems = useMemo(
    () => vaultConfigs.map((config, i) => ({ localIndex: i, label: config.title })),
    [vaultConfigs],
  );

  const spotifyMenuItems = useMemo(() => [
    { localIndex: 0, label: '🎵 Music' },
    ...spotifyPlaylists.map((p, i) => ({
      localIndex: SPOTIFY_FIXED + i,
      label: p.name,
    })),
  ], [spotifyPlaylists]);

  const navigateTo = useCallback((section: Section, localIndex: number) => {
    if (section !== currentSection) {
      verticalRef.current?.jumpTo(SECTION_ORDER.indexOf(section));
    }
    setSectionPage((prev) => ({ ...prev, [section]: localIndex }));

    const ref =
      section === 'organise' ? organiseRef :
      section === 'vault'    ? vaultRef :
      section === 'cinema'   ? cinemaRef :
      section === 'spotify'  ? spotifyRef :
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
      render: () => <NotesPage />,
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
      key: 'spotify',
      render: () => (
        <SectionPager
          ref={spotifyRef}
          data={spotifyData}
          width={width}
          height={pagerHeight}
          initialIndex={sectionPage.spotify}
          onPageChange={(i) => setSectionPage((p) => ({ ...p, spotify: i }))}
          onEdgesChange={onEdgesChange.spotify}
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
              edgesRef={edgesRef}
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
        vaultPages={vaultMenuItems}
        cinemaPages={CINEMA_MENU_ITEMS}
        spotifyPages={spotifyMenuItems}
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
