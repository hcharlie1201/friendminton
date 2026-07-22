import { StyleSheet, View } from 'react-native';

import { Button } from './Button';
import { TextField } from './TextField';
import { colors } from './theme';

type Props = {
  buttonLabel: string;
  onChangeText: (value: string) => void;
  onSubmit: () => void;
  placeholder: string;
  value: string;
};

export function Composer({ buttonLabel, onChangeText, onSubmit, placeholder, value }: Props) {
  return (
    <View style={styles.composer}>
      <TextField onChangeText={onChangeText} placeholder={placeholder} value={value} variant="compact" />
      <Button icon="paper-plane" onPress={onSubmit}>
        {buttonLabel}
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  composer: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: 10,
    padding: 12,
  },
});
