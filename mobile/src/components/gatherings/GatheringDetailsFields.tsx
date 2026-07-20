import { StyleSheet, View } from 'react-native';

import { CurrencyInput, TextField } from '../ui';
import {
  GatheringFieldLabel,
  GatheringFormSection,
  GatheringLabeledInput,
} from './GatheringFormPrimitives';

type Props = {
  capacity: string;
  costPerPersonCents: number;
  description: string;
  onCapacityChange: (value: string) => void;
  onCostPerPersonCentsChange: (value: number) => void;
  onDescriptionChange: (value: string) => void;
};

export function GatheringDetailsFields({
  capacity,
  costPerPersonCents,
  description,
  onCapacityChange,
  onCostPerPersonCentsChange,
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
        <View style={styles.currencyField}>
          <GatheringFieldLabel>Cost per person</GatheringFieldLabel>
          <CurrencyInput
            accessibilityLabel="Cost per person"
            onChangeCents={onCostPerPersonCentsChange}
            valueCents={costPerPersonCents}
          />
        </View>
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
  currencyField: { flex: 1, gap: 6 },
  descriptionInput: { minHeight: 122, paddingTop: 13 },
});
