import type { TextStyle } from 'react-native';

export const fonts = {
  regular: 'NotoSans_400Regular',
  medium: 'NotoSans_500Medium',
  semibold: 'NotoSans_600SemiBold',
  bold: 'NotoSans_700Bold',
  extraBold: 'NotoSans_800ExtraBold',
  black: 'NotoSans_900Black',
};

export const textSizes = {
  caption: { fontSize: 11, lineHeight: 15 },
  xSmall: { fontSize: 12, lineHeight: 17 },
  small: { fontSize: 14, lineHeight: 20 },
  medium: { fontSize: 16, lineHeight: 22 },
  large: { fontSize: 20, lineHeight: 26 },
  xLarge: { fontSize: 22, lineHeight: 28 },
} satisfies Record<string, TextStyle>;

export const textWeights = {
  regular: { fontFamily: fonts.regular, fontWeight: '400' },
  medium: { fontFamily: fonts.medium, fontWeight: '500' },
  strong: { fontFamily: fonts.bold, fontWeight: '700' },
  heavy: { fontFamily: fonts.black, fontWeight: '900' },
} satisfies Record<string, TextStyle>;
