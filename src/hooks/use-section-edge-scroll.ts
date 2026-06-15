import { useCallback, useRef } from 'react';
import type { LayoutChangeEvent, NativeScrollEvent, NativeSyntheticEvent } from 'react-native';

export type EdgesChangeHandler = (atTop: boolean, atBottom: boolean) => void;

/**
 * Tracks a scrollable's vertical edge state (scrolled to top / bottom) and
 * reports it via `onEdgesChange`. Spread the returned handlers onto a
 * ScrollView/FlatList/DraggableFlatList to let the outer vertical section
 * pager know when it's safe to take over a vertical drag.
 */
export function useSectionEdgeScroll(onEdgesChange?: EdgesChangeHandler) {
  const state = useRef({ offset: 0, layout: 0, content: 0 });

  const emit = useCallback(() => {
    if (!onEdgesChange) return;
    const { offset, layout, content } = state.current;
    const atTop = offset <= 0;
    const atBottom = content <= layout || offset >= content - layout - 1;
    onEdgesChange(atTop, atBottom);
  }, [onEdgesChange]);

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    state.current.offset = e.nativeEvent.contentOffset.y;
    state.current.layout = e.nativeEvent.layoutMeasurement.height;
    state.current.content = e.nativeEvent.contentSize.height;
    emit();
  }, [emit]);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    state.current.layout = e.nativeEvent.layout.height;
    emit();
  }, [emit]);

  const onContentSizeChange = useCallback((_w: number, h: number) => {
    state.current.content = h;
    emit();
  }, [emit]);

  return { onScroll, onLayout, onContentSizeChange, scrollEventThrottle: 16 };
}
