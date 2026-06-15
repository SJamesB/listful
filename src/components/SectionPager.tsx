import { forwardRef, useCallback, useImperativeHandle, useRef, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';

import type { EdgesChangeHandler } from '@/hooks/use-section-edge-scroll';

export interface SectionItem {
  id: string;
  Component: React.ComponentType<{ onEdgesChange?: EdgesChangeHandler }>;
}

interface SectionPagerProps {
  data: SectionItem[];
  width: number;
  height: number;
  initialIndex: number;
  onPageChange: (index: number) => void;
  onEdgesChange: EdgesChangeHandler;
}

export interface SectionPagerHandle {
  scrollToIndex: (index: number) => void;
}

export const SectionPager = forwardRef<SectionPagerHandle, SectionPagerProps>(
  function SectionPager({ data, width, height, initialIndex, onPageChange, onEdgesChange }, ref) {
    const flatRef = useRef<FlatList<SectionItem>>(null);
    const [page, setPage] = useState(initialIndex);

    useImperativeHandle(ref, () => ({
      scrollToIndex: (index: number) => {
        flatRef.current?.scrollToIndex({ index, animated: false });
        setPage(index);
      },
    }), []);

    const getItemLayout = useCallback(
      (_: unknown, index: number) => ({ length: width, offset: width * index, index }),
      [width],
    );

    const renderItem = useCallback(
      ({ item }: { item: SectionItem }) => (
        <View style={{ width, height }}>
          <item.Component onEdgesChange={onEdgesChange} />
        </View>
      ),
      [width, height, onEdgesChange],
    );

    return (
      <View style={{ width, height }}>
        <FlatList
          ref={flatRef}
          data={data}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          scrollEventThrottle={32}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          getItemLayout={getItemLayout}
          initialScrollIndex={initialIndex}
          onMomentumScrollEnd={(e) => {
            const idx = Math.round(e.nativeEvent.contentOffset.x / width);
            setPage(idx);
            onPageChange(idx);
          }}
        />
        {data.length > 1 && (
          <View style={styles.dots}>
            {data.map((_, i) => (
              <View key={i} style={[styles.dot, i === page && styles.dotActive]} />
            ))}
          </View>
        )}
      </View>
    );
  },
);

const styles = StyleSheet.create({
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
