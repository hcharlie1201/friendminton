import { StyleSheet, View } from 'react-native';

import { TextField } from '../ui';
import {
  GatheringFieldLabel,
  GatheringFormSection,
  GatheringLabeledInput,
} from './GatheringFormPrimitives';

type Props = {
  capacity: string;
  costPerPerson: string;
  description: string;
  onCapacityChange: (value: string) => void;
  onCostPerPersonChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
};

export function GatheringDetailsFields({
  capacity,
  costPerPerson,
  description,
  onCapacityChange,
  onCostPerPersonChange,
  onDescriptionChange,
}: Props) {
  return (
    <GatheringFormSection
      icon="options-outline"
      subtitle="Leave spots blank for unlimited. Cost is informational only."
      title="Gathering details"
    >
      <View style={styles.twoColumns}>
        <GatheringLabeledInput
          keyboardType="number-pad"
          label="Spots"
          onChangeText={onCapacityChange}
          placeholder="Unlimited"
          value={capacity}
        />
        <GatheringLabeledInput
          keyboardType="decimal-pad"
          label="Cost per person"
          onChangeText={onCostPerPersonChange}
          placeholder="$0"
          value={costPerPerson}
        />
      </View>
      <GatheringFieldLabel>Description</GatheringFieldLabel>
      <TextField
        accessibilityLabel="Gathering description"
        maxLength={5000}
        multiline
        onChangeText={onDescriptionChange}
        placeholder="Tell people about the vibe, shuttles, food, or what to bring."
        style={styles.descriptionInput}
        textAlignVertical="top"
        value={description}
      />
    </GatheringFormSection>
  );
}

const styles = StyleSheet.create({
  twoColumns: { flexDirection: 'row', gap: 10 },
  descriptionInput: { minHeight: 122, paddingTop: 13 },
});
