import { LinearGradient } from 'expo-linear-gradient';
import { useCallback } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  gatheringThemes,
  type GatheringTheme,
  type GatheringThemeId,
} from '../../features/gatherings/gatheringDraft';
import { colors, fonts } from '../ui';

export function GatheringThemePicker({
  onChange,
  value,
}: {
  onChange: (value: GatheringThemeId) => void;
  value: GatheringThemeId;
}) {
  return (
    <View accessibilityRole="radiogroup" style={styles.themeSection}>
      <Text accessibilityRole="header" style={styles.themeLabel}>Cover style</Text>
      <ScrollView horizontal contentContainerStyle={styles.themeList} showsHorizontalScrollIndicator={false}>
        {gatheringThemes.map((theme) => (
          <ThemeChoice key={theme.id} onSelect={onChange} selected={value === theme.id} theme={theme} />
        ))}
      </ScrollView>
    </View>
  );
}

function ThemeChoice({
  onSelect,
  selected,
  theme,
}: {
  onSelect: (value: GatheringThemeId) => void;
  selected: boolean;
  theme: GatheringTheme;
}) {
  const select = useThemeSelection(onSelect, theme.id);
  return (
    <Pressable
      accessibilityLabel={`${theme.label} cover style`}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      onPress={select}
      style={styles.themeChoice}
    >
      <LinearGradient
        colors={theme.colors}
        end={{ x: 1, y: 1 }}
        start={{ x: 0, y: 0 }}
        style={[styles.themeSwatch, selected && styles.themeSwatchSelected]}
      >
        <View style={[styles.themeBirdie, { backgroundColor: theme.accent }]} />
      </LinearGradient>
      <Text style={[styles.themeChoiceText, selected && styles.themeChoiceTextSelected]}>{theme.label}</Text>
    </Pressable>
  );
}

function useThemeSelection(onSelect: (value: GatheringThemeId) => void, value: GatheringThemeId) {
  return useCallback(() => onSelect(value), [onSelect, value]);
}

const styles = StyleSheet.create({
  themeSection: { gap: 9 },
  themeLabel: {
    color: colors.textMuted,
    fontFamily: fonts.black,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  themeList: { gap: 12, paddingRight: 18 },
  themeChoice: { gap: 5, width: 84 },
  themeSwatch: {
    alignItems: 'flex-end',
    borderColor: 'transparent',
    borderRadius: 12,
    borderWidth: 3,
    height: 58,
    justifyContent: 'flex-start',
    overflow: 'hidden',
    padding: 8,
  },
  themeSwatchSelected: { borderColor: colors.text },
  themeBirdie: {
    borderRadius: 20,
    height: 22,
    opacity: 0.8,
    transform: [{ rotate: '-25deg' }],
    width: 22,
  },
  themeChoiceText: {
    color: colors.textMuted,
    fontFamily: fonts.bold,
    fontSize: 10,
    fontWeight: '700',
    textAlign: 'center',
  },
  themeChoiceTextSelected: { color: colors.text, fontFamily: fonts.black, fontWeight: '900' },
});
