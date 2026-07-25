import { useMutation } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { postApiAuthSignUpEmail } from '../src/api/generated';
import { apiData } from '../src/api/runtime';
import { useSession } from '../src/auth/session';
import { errorMessage } from '../src/common/errors';
import { Button, PageHeader, Screen, TextField } from '../src/components/ui';

export default function LoginScreen() {
  const { signIn } = useSession();
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [city, setCity] = useState('');

  const signUpMutation = useMutation({
    mutationFn: () =>
      apiData(postApiAuthSignUpEmail({
        body: {
          email: email.trim(),
          display_name: displayName.trim(),
          city: city.trim() || null,
          skill_level: 'intermediate',
        },
      })),
    onError: showError,
    onSuccess: async (user) => {
      await signIn(user);
    },
  });
  const submit = useSubmitSignUp(signUpMutation.mutate, email, displayName);

  return (
    <Screen centered>
      <View style={styles.header}>
        <PageHeader eyebrow="Friendminton" title="Create your account to find your next rally." />
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
        <Button loading={signUpMutation.isPending} onPress={submit}>
          Sign up
        </Button>
      </View>
    </Screen>
  );
}

function showError(error: unknown) {
  Alert.alert('Unable to sign up', errorMessage(error));
}

function useSubmitSignUp(submit: () => void, email: string, displayName: string) {
  return useCallback(() => {
    const validationError = signUpValidationError(email, displayName);
    if (validationError) {
      Alert.alert('Unable to sign up', validationError);
      return;
    }
    submit();
  }, [displayName, email, submit]);
}

function signUpValidationError(email: string, displayName: string) {
  const normalizedEmail = email.trim();
  if (!normalizedEmail) return 'Enter your email address.';
  if (!normalizedEmail.includes('@')) return 'Enter a valid email address.';
  if (!displayName.trim()) return 'Enter your display name.';
  return null;
}

const styles = StyleSheet.create({
  header: {
    marginBottom: 28,
  },
  form: {
    gap: 14,
  },
});
