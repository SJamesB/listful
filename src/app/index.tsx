import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Platform, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { PageBackground } from '@/components/PageBackground';
import { SideDrawer } from '@/components/SideDrawer';
import { makeConfig, type CategoryConfig } from '@/lib/logCategories';
import { completeWebAuth } from '@/lib/spotify';
import { supabase } from '@/lib/supabase';
import { LogPage } from '@/screens/LogPage';
import NotesPage from '@/screens/NotesPage';
import CinemaPosterPage from '@/screens/CinemaPosterPage';
import SpotifyPage from '@/screens/SpotifyPage';
import SpotifyPlaylistPage from '@/screens/SpotifyPlaylistPage';
import EntertainmentPage from '@/screens/entertainment';
import HabitsPage from '@/screens/habits';
import TodoPage from '@/screens/todo';

const ORGANISE_COUNT = 3;
// Three fixed cinema pages: To Watch (Film) + To Watch (TV) + Recents
const CINEMA_FIXED = 3;
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

type Section = 'organise' | 'vault' | 'notes' | 'cinema' | 'spotify';

interface SectionItem {
  id: string;
  Component: React.ComponentType;
}

interface CinemaList {
  listId: string;
  listName: string | null;
}

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
  const [cinemaLists, setCinemaLists] = useState<CinemaList[]>([]);
  const [spotifyPlaylists, setSpotifyPlaylists] = useState<SpotifyPinnedPlaylist[]>([]);
  const [currentSection, setCurrentSection] = useState<Section>('organise');
  const [sectionPage, setSectionPage] = useState({ organise: 0, vault: 0, notes: 0, cinema: 0, spotify: 0 });
  const [pagerHeight, setPagerHeight] = useState(0);

  const flatRef = useRef<FlatList<SectionItem>>(null);

  // Handle Spotify OAuth redirect back to the web app (?code=...)
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (!code) return;
    window.history.replaceState({}, '', window.location.pathname);
    completeWebAuth(code)
      .then(() => setCurrentSection('spotify'))
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

    supabase
      .from('imdb_items')
      .select('list_id, list_name')
      .eq('source', 'list')
      .not('list_id', 'is', null)
      .then(({ data }) => {
        if (!data) return;
        const seen = new Set<string>();
        const unique: CinemaList[] = [];
        for (const r of data) {
          if (r.list_id && !seen.has(r.list_id)) {
            seen.add(r.list_id);
            unique.push({ listId: r.list_id, listName: r.list_name ?? null });
          }
        }
        setCinemaLists(unique);
      });

    loadSpotifyPlaylists();
  }, [loadSpotifyPlaylists]);

  // Cache vault page components by category key to prevent remounts
  const vaultCompCache = useRef(new Map<string, React.ComponentType>());
  const getVaultComponent = useCallback((config: CategoryConfig) => {
    if (!vaultCompCache.current.has(config.key)) {
      const Comp = () => <LogPage config={config} />;
      vaultCompCache.current.set(config.key, Comp);
    }
    return vaultCompCache.current.get(config.key)!;
  }, []);

  // Cache cinema page components — keyed by page id, props are baked in at creation
  const cinemaCompCache = useRef(new Map<string, React.ComponentType>());
  const getCinemaComponent = useCallback(
    (id: string, props: React.ComponentProps<typeof CinemaPosterPage>) => {
      if (!cinemaCompCache.current.has(id)) {
        const Comp = () => <CinemaPosterPage {...props} />;
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
  const spotifyCompCache = useRef(new Map<string, React.ComponentType>());
  const getSpotifyComponent = useCallback(
    (id: string, factory: () => React.ComponentType) => {
      if (!spotifyCompCache.current.has(id)) {
        spotifyCompCache.current.set(id, factory());
      }
      return spotifyCompCache.current.get(id)!;
    },
    [],
  );

  const spotifyPageComponents = useMemo(() => [
    getSpotifyComponent('spotify-main', () => () => (
      <SpotifyPage onPinsChanged={() => loadSpotifyRef.current()} />
    )),
    ...spotifyPlaylists.map((p) =>
      getSpotifyComponent(`spotify-${p.spotifyId}`, () => () => (
        <SpotifyPlaylistPage title={p.name} spotifyId={p.spotifyId} />
      )),
    ),
  ], [spotifyPlaylists, getSpotifyComponent]);

  const cinemaPageComponents = useMemo(() => [
    getCinemaComponent('film',    { title: '🎬 To Watch (Film)', source: 'watchlist', mediaType: 'Movie' }),
    getCinemaComponent('tv',      { title: '📺 To Watch (TV)',   source: 'watchlist', mediaType: 'TV'    }),
    getCinemaComponent('recents', { title: '⭐ Recents',          source: 'ratings'                       }),
    ...cinemaLists.map((list) =>
      getCinemaComponent(`list-${list.listId}`, {
        title: list.listName ?? list.listId,
        source: 'list',
        listId: list.listId,
      }),
    ),
  ], [cinemaLists, getCinemaComponent]);

  const notesPageIndex    = ORGANISE_COUNT + vaultConfigs.length;
  const cinemaStartIndex  = notesPageIndex + 1;
  const cinemaTotalCount  = CINEMA_FIXED + cinemaLists.length;
  const spotifyStartIndex = cinemaStartIndex + cinemaTotalCount;
  const spotifyTotalCount = SPOTIFY_FIXED + spotifyPlaylists.length;

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
    if (currentSection === 'cinema') return cinemaPageComponents.map((Component, i) => ({
      id: `cinema-${i}`,
      Component,
    }));
    if (currentSection === 'spotify') return spotifyPageComponents.map((Component, i) => ({
      id: `spotify-${i}`,
      Component,
    }));
    return [];
  }, [currentSection, vaultConfigs, vaultPageComponents, cinemaPageComponents, spotifyPageComponents]);

  const currentPage =
    currentSection === 'organise' ? sectionPage.organise :
    currentSection === 'vault'    ? ORGANISE_COUNT + sectionPage.vault :
    currentSection === 'cinema'   ? cinemaStartIndex + sectionPage.cinema :
    currentSection === 'spotify'  ? spotifyStartIndex + sectionPage.spotify :
    notesPageIndex;

  const bg =
    currentSection === 'organise' ? ORGANISE_BG :
    currentSection === 'vault'    ? VAULT_BG :
    currentSection === 'cinema'   ? CINEMA_BG :
    currentSection === 'spotify'  ? SPOTIFY_BG :
    NOTES_BG;

  const vaultMenuItems = useMemo(
    () => vaultConfigs.map((config, i) => ({ index: ORGANISE_COUNT + i, label: config.title })),
    [vaultConfigs],
  );

  const spotifyMenuItems = useMemo(() => [
    { index: spotifyStartIndex, label: '🎵 Music' },
    ...spotifyPlaylists.map((p, i) => ({
      index: spotifyStartIndex + SPOTIFY_FIXED + i,
      label: p.name,
    })),
  ], [spotifyStartIndex, spotifyPlaylists]);

  const cinemaMenuItems = useMemo(() => [
    { index: cinemaStartIndex,     label: '🎬 To Watch (Film)' },
    { index: cinemaStartIndex + 1, label: '📺 To Watch (TV)'   },
    { index: cinemaStartIndex + 2, label: '⭐ Recents'          },
    ...cinemaLists.map((list, i) => ({
      index: cinemaStartIndex + CINEMA_FIXED + i,
      label: list.listName ?? list.listId,
    })),
  ], [cinemaStartIndex, cinemaLists]);

  const navigateTo = useCallback((globalIndex: number) => {
    let newSection: Section;
    let localIndex: number;
    if (globalIndex < ORGANISE_COUNT) {
      newSection = 'organise';
      localIndex = globalIndex;
    } else if (globalIndex < notesPageIndex) {
      newSection = 'vault';
      localIndex = globalIndex - ORGANISE_COUNT;
    } else if (globalIndex >= cinemaStartIndex && globalIndex < cinemaStartIndex + cinemaTotalCount) {
      newSection = 'cinema';
      localIndex = globalIndex - cinemaStartIndex;
    } else if (globalIndex >= spotifyStartIndex && globalIndex < spotifyStartIndex + spotifyTotalCount) {
      newSection = 'spotify';
      localIndex = globalIndex - spotifyStartIndex;
    } else {
      newSection = 'notes';
      localIndex = 0;
    }

    const isSamePaged = newSection === currentSection &&
      (newSection === 'organise' || newSection === 'vault' || newSection === 'cinema' || newSection === 'spotify');

    if (isSamePaged) {
      flatRef.current?.scrollToIndex({ index: localIndex, animated: false });
      setSectionPage((prev) => ({ ...prev, [newSection]: localIndex }));
    } else {
      setSectionPage((prev) => ({ ...prev, [newSection]: localIndex }));
      setCurrentSection(newSection);
    }
    setDrawerOpen(false);
  }, [currentSection, notesPageIndex, cinemaStartIndex, cinemaTotalCount, spotifyStartIndex, spotifyTotalCount]);

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

  const pagedSection = currentSection === 'organise' || currentSection === 'vault' || currentSection === 'cinema' || currentSection === 'spotify';

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
            pagedSection && pagerHeight > 0 && (
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
                  initialScrollIndex={sectionPage[currentSection as 'organise' | 'vault' | 'cinema']}
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
                        style={[
                          styles.dot,
                          i === sectionPage[currentSection as 'organise' | 'vault' | 'cinema'] && styles.dotActive,
                        ]}
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
        cinemaPages={cinemaMenuItems}
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
