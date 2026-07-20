import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View, type TextInputProps } from 'react-native';

import { TextField, colors, fonts } from '../ui';

type FormSectionProps = {
  children: ReactNode;
  icon?: keyof typeof Ionicons.glyphMap;
  subtitle?: string;
  title: string;
};

export function GatheringFormSection({ children, icon, subtitle, title }: FormSectionProps) {
  return (
    <View style={styles.formSection}>
      <View style={styles.sectionHeading}>
        <View style={styles.sectionTitleRow}>
          {icon && <Ionicons color={colors.primary} name={icon} size={20} />}
          <Text accessibilityRole="header" style={styles.sectionTitle}>{title}</Text>
        </View>
        {subtitle && <Text style={styles.sectionSubtitle}>{subtitle}</Text>}
      </View>
      {children}
    </View>
  );
}

export function GatheringFieldLabel({ children }: { children: ReactNode }) {
  return <Text style={styles.fieldLabel}>{children}</Text>;
}

export function GatheringLabeledInput({
  keyboardType,
  label,
  onChangeText,
  placeholder,
  value,
}: {
  keyboardType?: TextInputProps['keyboardType'];
  label: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  value: string;
}) {
  return (
    <View style={styles.labeledInput}>
      <GatheringFieldLabel>{label}</GatheringFieldLabel>
      <TextField
        accessibilityLabel={label}
        keyboardType={keyboardType}
        onChangeText={onChangeText}
        placeholder={placeholder}
        value={value}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  formSection: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: 20,
    borderWidth: 1,
    gap: 12,
    padding: 16,
  },
  sectionHeading: { gap: 4 },
  sectionTitleRow: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  sectionTitle: { color: colors.ink, fontFamily: fonts.black, fontSize: 18, fontWeight: '900' },
  sectionSubtitle: { color: colors.muted, fontFamily: fonts.medium, fontSize: 12, lineHeight: 17 },
  fieldLabel: {
    color: colors.muted,
    fontFamily: fonts.black,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.6,
    marginTop: 2,
    textTransform: 'uppercase',
  },
  labeledInput: { flex: 1, gap: 6 },
});
