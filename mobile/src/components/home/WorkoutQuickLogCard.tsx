import { StyleSheet, Text } from 'react-native';

import { Card, colors } from '../ui';

export function WorkoutQuickLogCard() {
  return (
    <Card>
      <Text style={styles.title}>Default quick log</Text>
      <Text style={styles.body}>Saves a 75 minute match workout to your signed-in profile.</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  title: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: '900',
  },
  body: {
    color: colors.ink,
    fontSize: 15,
    lineHeight: 21,
  },
});
