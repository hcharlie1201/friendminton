import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { postApiAuthSignUpEmail } from '../src/api/generated';
import { unwrap } from '../src/api/runtime';
import { useSession } from '../src/auth/session';
import { Button, PageHeader, Screen, TextField } from '../src/components/ui';

export default function LoginScreen() {
  const { signIn } = useSession();
  const [email, setEmail] = useState('player@friendminton.local');
  const [displayName, setDisplayName] = useState('Oakland Rally Partner');
  const [city, setCity] = useState('Oakland');

  const signUpMutation = useMutation({
    mutationFn: () =>
      postApiAuthSignUpEmail({
        body: {
          email: email.trim(),
          display_name: displayName.trim(),
          city: city.trim() || null,
          skill_level: 'intermediate',
        },
      }).then(unwrap),
    onError: showError,
    onSuccess: async (user) => {
      await signIn(user);
    },
  });

  return (
    <Screen centered>
      <View style={styles.header}>
        <PageHeader eyebrow="Friendminton" title="Sign in to find your next rally." />
      </View>

      <View style={styles.form}>
        <TextField
          autoCapitalize="none"
          keyboardType="email-address"
          onChangeText={setEmail}
          placeholder="Email"
          value={email}
        />
        <TextField
          autoCapitalize="words"
          onChangeText={setDisplayName}
          placeholder="Display name"
          value={displayName}
        />
        <TextField autoCapitalize="words" onChangeText={setCity} placeholder="City" value={city} />
        <Button loading={signUpMutation.isPending} onPress={() => signUpMutation.mutate()}>
          Continue
        </Button>
      </View>
    </Screen>
  );
}

function showError(error: unknown) {
  const message = error instanceof Error ? error.message : 'Something went wrong.';
  Alert.alert('Friendminton', message);
}

const styles = StyleSheet.create({
  header: {
    marginBottom: 28,
  },
  form: {
    gap: 14,
  },
});
