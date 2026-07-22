/**
 * Semantic color tokens for the Friendminton light theme.
 *
 * Components should choose colors by purpose, not by hue. This keeps the
 * brand identity replaceable without requiring component-level changes.
 */
export const colors = {
  transparent: 'transparent',
  background: '#FFFAFB',
  surface: '#FFFFFF',
  surfaceMuted: '#F8F2F4',
  surfaceElevated: '#FFFCFD',
  surfaceOverlay: 'rgba(255, 255, 255, 0.94)',

  text: '#3A2B31',
  textMuted: '#756D73',
  textSubtle: '#958A91',
  textInverse: '#FFFFFF',
  textOnPrimary: '#3A2028',

  primary: '#FF8FA3',
  primaryPressed: '#F4778D',
  primaryStrong: '#B9425B',
  primarySurface: '#FFF0F3',
  primarySurfacePressed: '#FFDDE4',

  secondary: '#83CFF1',
  secondaryPressed: '#5AB8E2',
  secondarySurface: '#EDF8FD',

  accent: '#FFD166',
  accentPressed: '#E8B849',
  accentSurface: '#FFF7DC',
  textOnAccent: '#49340A',

  playAccent: '#83CFF1',
  playAccentStrong: '#27789C',
  playAccentSurface: '#EDF8FD',
  socialAccent: '#FFD166',
  socialAccentStrong: '#8A6500',
  socialAccentSurface: '#FFF7DC',
  energyAccent: '#FF8A4C',
  energyAccentStrong: '#B85A18',
  energyAccentSurface: '#FFF0E7',

  live: '#FFD166',
  liveStrong: '#8A6500',
  liveSurface: '#FFF7DC',

  border: '#E6DDE1',
  borderStrong: '#CEBFC6',

  success: '#378A5A',
  successSurface: '#E8F5ED',
  warning: '#B85A18',
  warningSurface: '#FFF0E7',
  danger: '#D94A4A',
  dangerSurface: '#FFF0F0',
  dangerBorder: '#F1B4B4',

  overlay: 'rgba(58, 43, 49, 0.48)',
  overlayStrong: 'rgba(38, 24, 30, 0.74)',
  imageOverlay: 'rgba(38, 24, 30, 0.56)',
  imageOverlayClear: 'rgba(38, 24, 30, 0.04)',
  imageOverlayText: 'rgba(255, 255, 255, 0.88)',
  imageOverlayBorder: 'rgba(255, 255, 255, 0.36)',
  shadow: '#7B3F50',
  mediaBackground: '#20171B',
  mediaIndicator: '#796D73',
} as const;

export type ThemeColors = typeof colors;
