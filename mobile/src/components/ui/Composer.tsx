import { StyleSheet, View } from 'react-native';

import { Button } from './Button';
import { TextField } from './TextField';

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
      <Button onPress={onSubmit}>{buttonLabel}</Button>
    </View>
  );
}

const styles = StyleSheet.create({
  composer: {
    gap: 8,
  },
});
