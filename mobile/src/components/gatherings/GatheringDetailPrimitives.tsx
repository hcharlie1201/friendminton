import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, fonts } from '../ui';

export type GatheringDetailFactItem = {
  detail?: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
};

type SectionProps = {
  children: ReactNode;
  icon: keyof typeof Ionicons.glyphMap;
  subtitle?: string;
  title: string;
};

export function GatheringDetailSection({ children, icon, subtitle, title }: SectionProps) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeading}>
        <View style={styles.sectionIcon}>
          <Ionicons color={colors.primary} name={icon} size={20} />
        </View>
        <View style={styles.sectionHeadingCopy}>
          <Text accessibilityRole="header" style={styles.sectionTitle}>{title}</Text>
          {subtitle && <Text style={styles.sectionSubtitle}>{subtitle}</Text>}
        </View>
      </View>
      {children}
    </View>
  );
}

export function GatheringDetailFactList({ items }: { items: readonly GatheringDetailFactItem[] }) {
  return (
    <View style={styles.factList}>
      {items.map((item, index) => (
        <GatheringDetailFact
          detail={item.detail}
          icon={item.icon}
          isLast={index === items.length - 1}
          key={item.label}
          label={item.label}
          value={item.value}
        />
      ))}
    </View>
  );
}

export function GatheringDetailChipList({
  accessibilityLabel,
  labels,
}: {
  accessibilityLabel: string;
  labels: readonly string[];
}) {
  return (
    <View accessibilityLabel={`${accessibilityLabel}: ${labels.join(', ')}`} accessible style={styles.chips}>
      {labels.map((label) => (
        <View key={label} style={styles.chip}>
          <Text style={styles.chipText}>{label}</Text>
        </View>
      ))}
    </View>
  );
}

export function GatheringDetailBody({ children }: { children: ReactNode }) {
  return <Text selectable style={styles.body}>{children}</Text>;
}

function GatheringDetailFact({
  detail,
  icon,
  isLast,
  label,
  value,
}: GatheringDetailFactItem & { isLast: boolean }) {
  return (
    <View
      accessibilityLabel={`${label}: ${value}${detail ? `. ${detail}` : ''}`}
      accessible
      style={[styles.fact, !isLast && styles.factDivider]}
    >
      <View style={styles.factIcon}>
        <Ionicons color={colors.primaryStrong} name={icon} size={20} />
      </View>
      <View style={styles.factCopy}>
        <Text style={styles.factLabel}>{label}</Text>
        <Text style={styles.factValue}>{value}</Text>
        {detail && <Text style={styles.factDetail}>{detail}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 22,
    borderWidth: 1,
    gap: 16,
    padding: 17,
  },
  sectionHeading: { alignItems: 'flex-start', flexDirection: 'row', gap: 11 },
  sectionIcon: {
    alignItems: 'center',
    backgroundColor: colors.primarySurface,
    borderRadius: 13,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  sectionHeadingCopy: { flex: 1, gap: 2, paddingTop: 1 },
  sectionTitle: { color: colors.text, fontFamily: fonts.black, fontSize: 19, fontWeight: '900' },
  sectionSubtitle: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 12, lineHeight: 18 },
  factList: {
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  fact: {
    alignItems: 'flex-start',
    backgroundColor: colors.surfaceElevated,
    flexDirection: 'row',
    gap: 12,
    minHeight: 74,
    padding: 14,
  },
  factDivider: { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth },
  factIcon: {
    alignItems: 'center',
    backgroundColor: colors.primarySurface,
    borderRadius: 11,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  factCopy: { flex: 1, gap: 2, minWidth: 0 },
  factLabel: {
    color: colors.textMuted,
    fontFamily: fonts.black,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  factValue: { color: colors.text, fontFamily: fonts.black, fontSize: 15, fontWeight: '900', lineHeight: 21 },
  factDetail: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 12, lineHeight: 17 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    backgroundColor: colors.accentSurface,
    borderColor: colors.accentPressed,
    borderRadius: 99,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipText: { color: colors.textOnAccent, fontFamily: fonts.bold, fontSize: 12, fontWeight: '700' },
  body: { color: colors.text, fontFamily: fonts.regular, fontSize: 15, lineHeight: 24 },
});
