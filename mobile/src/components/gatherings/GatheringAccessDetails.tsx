import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import type { GatheringVisibility } from '../../features/gatherings/gatheringDraft';
import { colors, fonts } from '../ui';
import { GatheringChoiceGroup, type GatheringChoiceOption } from './GatheringChoiceGroup';
import { GatheringFieldLabel, GatheringFormSection } from './GatheringFormPrimitives';

const visibilityOptions: GatheringChoiceOption<GatheringVisibility>[] = [
  { description: 'Appears in Discover', label: 'Public', value: 'public' },
  { description: 'Hidden from public Discover', label: 'Private', value: 'private' },
];

type Props = {
  onVisibilityChange: (value: GatheringVisibility) => void;
  visibility: GatheringVisibility;
};

export function GatheringAccessDetails({ onVisibilityChange, visibility }: Props) {
  const isPrivate = visibility === 'private';
  return (
    <GatheringFormSection
      icon="people-outline"
      subtitle="Visibility controls whether the gathering appears publicly."
      title="Visibility & access"
    >
      <GatheringFieldLabel>Visibility</GatheringFieldLabel>
      <GatheringChoiceGroup onChange={onVisibilityChange} options={visibilityOptions} value={visibility} />
      <GatheringFieldLabel>RSVP rule</GatheringFieldLabel>
      <View
        accessibilityLabel={`RSVP rule: ${isPrivate ? 'Host only for now' : 'Open RSVP'}`}
        accessible
        style={styles.openAccess}
      >
        <Ionicons color={colors.primary} name={isPrivate ? 'lock-closed-outline' : 'enter-outline'} size={19} />
        <View style={styles.openAccessCopy}>
          <Text style={styles.openAccessTitle}>{isPrivate ? 'Host-only for now' : 'Open RSVP'}</Text>
          <Text style={styles.openAccessDescription}>
            {isPrivate
              ? 'Private invitations will arrive with host-management tools.'
              : 'Anyone who finds the gathering can RSVP.'}
          </Text>
        </View>
      </View>
    </GatheringFormSection>
  );
}

const styles = StyleSheet.create({
  openAccess: {
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderColor: '#B9D8FF',
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    padding: 12,
  },
  openAccessCopy: { flex: 1, gap: 2 },
  openAccessTitle: {
    color: colors.primaryDark,
    fontFamily: fonts.black,
    fontSize: 13,
    fontWeight: '900',
  },
  openAccessDescription: { color: colors.muted, fontFamily: fonts.medium, fontSize: 10, lineHeight: 14 },
});
