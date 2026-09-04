import { forwardRef, Fragment, useImperativeHandle } from 'react';
import { View } from 'react-native';

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
  width: number;
  height: number;
}

function VerticalSectionPagerInner<K extends string>(
  { sections, activeIndex, onActiveIndexChange, width, height }: VerticalSectionPagerProps<K>,
  ref: React.ForwardedRef<VerticalSectionPagerHandle>,
) {
  useImperativeHandle(ref, () => ({
    jumpTo: (index: number) => {
      onActiveIndexChange(index);
    },
  }), [onActiveIndexChange]);

  return (
    <View style={{ width, height, overflow: 'hidden' }}>
      {/* keyed so same-typed sections (e.g. two SectionPagers) remount instead of reusing scroll state */}
      <Fragment key={sections[activeIndex].key}>
        {sections[activeIndex].render()}
      </Fragment>
    </View>
  );
}

type VerticalSectionPagerType = <K extends string>(
  props: VerticalSectionPagerProps<K> & { ref?: React.Ref<VerticalSectionPagerHandle> }
) => React.ReactElement | null;

export const VerticalSectionPager = forwardRef(VerticalSectionPagerInner) as unknown as VerticalSectionPagerType;
