import { useState } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CATEGORIES } from '@/lib/logCategories';
import { LogPage } from '@/screens/LogPage';
import EntertainmentPage from '@/screens/entertainment';
import HabitsPage from '@/screens/habits';
import TodoPage from '@/screens/todo';

// Stable wrappers so LogPage hooks don't remount on every render
const GigsPage        = () => <LogPage config={CATEGORIES.gig} />;
const BooksLogPage    = () => <LogPage config={CATEGORIES.book} />;
const TeaPage         = () => <LogPage config={CATEGORIES.tea} />;
const ChiliPage       = () => <LogPage config={CATEGORIES.chili} />;
const CountriesPage   = () => <LogPage config={CATEGORIES.country} />;
const WildlifePage    = () => <LogPage config={CATEGORIES.wildlife} />;

const PAGES = [
  HabitsPage,
  TodoPage,
  EntertainmentPage,
  GigsPage,
  BooksLogPage,
  TeaPage,
  ChiliPage,
  CountriesPage,
  WildlifePage,
];

export default function App() {
  const { width } = useWindowDimensions();
  const [page, setPage] = useState(0);
  const [pagerH, setPagerH] = useState(0);

  return (
    <SafeAreaView style={styles.root}>
      <View
        style={{ flex: 1 }}
        onLayout={(e) => setPagerH(e.nativeEvent.layout.height)}>
        {pagerH > 0 && (
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            scrollEventThrottle={32}
            onMomentumScrollEnd={(e) =>
              setPage(Math.round(e.nativeEvent.contentOffset.x / width))
            }>
            {PAGES.map((Page, i) => (
              <View key={i} style={{ width, height: pagerH }}>
                <Page />
              </View>
            ))}
          </ScrollView>
        )}

        {PAGES.length > 1 && (
          <View style={styles.dots}>
            {PAGES.map((_, i) => (
              <View key={i} style={[styles.dot, i === page && styles.dotActive]} />
            ))}
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
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
