import { StyleSheet, Text, View } from 'react-native';

import { Button, Card, TextField, colors } from '../ui';

type Props = {
  city: string;
  displayName: string;
  email: string;
  onCityChange: (city: string) => void;
  onSignOut: () => void;
};

export function SettingsPanel({ city, displayName, email, onCityChange, onSignOut }: Props) {
  return (
    <View style={styles.wrapper}>
      <Card>
        <Text style={styles.title}>{displayName}</Text>
        <Text style={styles.meta}>{email}</Text>
      </Card>

      <Card>
        <Text style={styles.sectionTitle}>Discovery Settings</Text>
        <Text style={styles.help}>Used for player and group discovery. Your home feed stays global.</Text>
        <TextField autoCapitalize="words" onChangeText={onCityChange} placeholder="Location" value={city} />
      </Card>

      <Button onPress={onSignOut} variant="secondary">
        Sign out
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: 12,
  },
  title: {
    color: colors.ink,
    fontSize: 20,
    fontWeight: '900',
  },
  meta: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: '700',
  },
  sectionTitle: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: '900',
  },
  help: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
  },
});
