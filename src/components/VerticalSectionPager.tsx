import { forwardRef, useImperativeHandle, useRef } from 'react';
import { Animated, PanResponder, StyleSheet, View } from 'react-native';

const ACTIVATION_DISTANCE = 10;
const COMMIT_DISTANCE_RATIO = 0.25;
const COMMIT_VELOCITY = 0.5;

export interface EdgeState {
  atTop: boolean;
  atBottom: boolean;
}

export interface SectionDef<K extends string> {
  key: K;
  render: () => React.ReactNode;
}

export interface VerticalSectionPagerHandle {
  jumpTo: (index: number) => void;
}

interface VerticalSectionPagerProps<K extends string> {
  sections: SectionDef<K>[];
  activeIndex: number;
  onActiveIndexChange: (index: number) => void;
  edgesRef: React.RefObject<Record<K, EdgeState>>;
  width: number;
  height: number;
}

function VerticalSectionPagerInner<K extends string>(
  { sections, activeIndex, onActiveIndexChange, edgesRef, width, height }: VerticalSectionPagerProps<K>,
  ref: React.ForwardedRef<VerticalSectionPagerHandle>,
) {
  const translateY = useRef(new Animated.Value(0)).current;
  const activeIndexRef = useRef(activeIndex);
  activeIndexRef.current = activeIndex;

  useImperativeHandle(ref, () => ({
    jumpTo: (index: number) => {
      translateY.setValue(0);
      onActiveIndexChange(index);
    },
  }), [onActiveIndexChange, translateY]);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponderCapture: (_evt, gesture) => {
        if (Math.abs(gesture.dx) > Math.abs(gesture.dy)) return false;
        if (Math.abs(gesture.dy) < ACTIVATION_DISTANCE) return false;

        const idx = activeIndexRef.current;
        const edges = edgesRef.current?.[sections[idx].key];
        if (!edges) return false;

        if (gesture.dy > 0) return edges.atTop && idx > 0;
        return edges.atBottom && idx < sections.length - 1;
      },
      onPanResponderMove: (_evt, gesture) => {
        translateY.setValue(Math.max(-height, Math.min(height, gesture.dy)));
      },
      onPanResponderRelease: (_evt, gesture) => {
        const idx = activeIndexRef.current;
        const commit = Math.abs(gesture.dy) > height * COMMIT_DISTANCE_RATIO
          || Math.abs(gesture.vy) > COMMIT_VELOCITY;

        if (commit && gesture.dy > 0 && idx > 0) {
          onActiveIndexChange(idx - 1);
        } else if (commit && gesture.dy < 0 && idx < sections.length - 1) {
          onActiveIndexChange(idx + 1);
        }

        Animated.spring(translateY, {
          toValue: 0,
          useNativeDriver: true,
          damping: 20,
          stiffness: 250,
        }).start();
      },
      onPanResponderTerminationRequest: () => false,
    }),
  ).current;

  const visible = [activeIndex - 1, activeIndex, activeIndex + 1].filter(
    (i) => i >= 0 && i < sections.length,
  );

  return (
    <View style={{ width, height, overflow: 'hidden' }} {...panResponder.panHandlers}>
      <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ translateY }] }]}>
        {visible.map((i) => (
          <View
            key={sections[i].key}
            style={[styles.page, { width, height, top: (i - activeIndex) * height }]}
          >
            {sections[i].render()}
          </View>
        ))}
      </Animated.View>
    </View>
  );
}

type VerticalSectionPagerType = <K extends string>(
  props: VerticalSectionPagerProps<K> & { ref?: React.Ref<VerticalSectionPagerHandle> }
) => React.ReactElement | null;

export const VerticalSectionPager = forwardRef(VerticalSectionPagerInner) as unknown as VerticalSectionPagerType;

const styles = StyleSheet.create({
  page: {
    position: 'absolute',
    left: 0,
  },
});
