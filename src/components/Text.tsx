import { forwardRef, type ElementRef } from 'react';
import { StyleSheet, Text as RNText, type TextProps } from 'react-native';

import { fontFamilyForWeight } from '@/constants/fonts';

export const Text = forwardRef<ElementRef<typeof RNText>, TextProps>(function Text({ style, ...rest }, ref) {
  const flat = StyleSheet.flatten(style);
  const fontFamily = flat?.fontFamily ?? fontFamilyForWeight(flat?.fontWeight);
  return <RNText ref={ref} style={[style, { fontFamily }]} {...rest} />;
});
