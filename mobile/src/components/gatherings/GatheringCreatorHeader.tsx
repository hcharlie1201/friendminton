import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { gatheringKindLabel, type GatheringKind } from '../../features/gatherings/gatheringDraft';
import { colors, fonts } from '../ui';

export function GatheringCreatorHeader({ kind, onClose }: { kind: GatheringKind; onClose: () => void }) {
  return (
    <View accessibilityRole="header" style={styles.header}>
      <Pressable
        accessibilityHint="Closes the gathering creator"
        accessibilityLabel="Close gathering creator"
        accessibilityRole="button"
        hitSlop={10}
        onPress={onClose}
        style={styles.headerButton}
      >
        <Ionicons color={colors.text} name="close" size={27} />
      </Pressable>
      <View style={styles.headerCopy}>
        <Text style={styles.headerEyebrow}>HOST SOMETHING</Text>
        <Text style={styles.headerTitle}>New {gatheringKindLabel(kind).toLowerCase()}</Text>
      </View>
      <View accessible={false} style={styles.headerButton} />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: 'center',
    backgroundColor: colors.surfaceOverlay,
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    minHeight: 64,
    paddingHorizontal: 10,
  },
  headerButton: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 },
  headerCopy: { alignItems: 'center', flex: 1 },
  headerEyebrow: {
    color: colors.primary,
    fontFamily: fonts.black,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  headerTitle: { color: colors.text, fontFamily: fonts.black, fontSize: 17, fontWeight: '900' },
});
