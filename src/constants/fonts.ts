import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';

export const interFontAssets = {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
};

// Maps the fontWeight values used across the app's StyleSheets to the
// matching static Inter font file, since custom fonts don't get synthetic
// bolding on iOS the way the system font does.
export function fontFamilyForWeight(weight?: number | string | null): string {
  switch (String(weight)) {
    case '700':
    case '800':
    case '900':
    case 'bold':
      return 'Inter_700Bold';
    case '600':
      return 'Inter_600SemiBold';
    case '500':
      return 'Inter_500Medium';
    default:
      return 'Inter_400Regular';
  }
}
