import { forwardRef, type ElementRef } from 'react';
import { StyleSheet, TextInput as RNTextInput, type TextInputProps } from 'react-native';

import { fontFamilyForWeight } from '@/constants/fonts';

export type TextInputRef = ElementRef<typeof RNTextInput>;

export const TextInput = forwardRef<TextInputRef, TextInputProps>(function TextInput({ style, ...rest }, ref) {
  const flat = StyleSheet.flatten(style);
  const fontFamily = flat?.fontFamily ?? fontFamilyForWeight(flat?.fontWeight);
  return <RNTextInput ref={ref} style={[style, { fontFamily }]} {...rest} />;
});
