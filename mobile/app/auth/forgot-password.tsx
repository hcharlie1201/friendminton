import { useMutation } from '@tanstack/react-query';
import { type Href, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { postApiAuthForgotPassword } from '../../src/api/generated';
import { apiData } from '../../src/api/runtime';
import { errorMessage } from '../../src/common/errors';
import { Button, PageHeader, Screen, TextField, colors, fonts } from '../../src/components/ui';

export default function ForgotPasswordScreen() {
  const params = useLocalSearchParams<{ email?: string | string[] }>();
  const [email, setEmail] = useState(firstParameter(params.email) ?? '');
  const [wasSubmitted, setWasSubmitted] = useState(false);
  const request = usePasswordResetRequest(email, setWasSubmitted);
  const goToSignIn = useSignInNavigation();

  return (
    <Screen centered>
      <View style={styles.content}>
        <PageHeader
          eyebrow="Account recovery"
          title={wasSubmitted ? 'Check your email.' : 'Reset your password.'}
        />
        {wasSubmitted ? (
          <>
            <Text style={styles.body}>
              If an account exists for that address, we sent a password reset link. It may take a
              minute to arrive.
            </Text>
            <Button onPress={goToSignIn}>Back to sign in</Button>
          </>
        ) : (
          <>
            <Text style={styles.body}>
              Enter the email for your account and we’ll send you a secure reset link.
            </Text>
            <TextField
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              onChangeText={setEmail}
              placeholder="Email"
              value={email}
            />
            <Button loading={request.isPending} onPress={request.submit}>
              Send reset link
            </Button>
            <Button onPress={goToSignIn} variant="quiet">
              Back to sign in
            </Button>
          </>
        )}
      </View>
    </Screen>
  );
}

function usePasswordResetRequest(
  email: string,
  setWasSubmitted: (wasSubmitted: boolean) => void,
) {
  const mutationFn = useCallback(
    () => requestPasswordReset(email),
    [email],
  );
  const handleSuccess = useCallback(() => {
    setWasSubmitted(true);
  }, [setWasSubmitted]);
  const mutation = useMutation({
    mutationFn,
    onError: showRequestError,
    onSuccess: handleSuccess,
  });
  const submit = useCallback(() => {
    const validationError = emailValidationError(email);
    if (validationError) {
      Alert.alert('Enter your email', validationError);
      return;
    }
    mutation.mutate();
  }, [email, mutation]);

  return {
    isPending: mutation.isPending,
    submit,
  };
}

function useSignInNavigation() {
  const router = useRouter();
  return useCallback(() => {
    router.replace('/login' as Href);
  }, [router]);
}

async function requestPasswordReset(email: string) {
  return apiData(postApiAuthForgotPassword({
    body: { email: email.trim() },
  }));
}

function showRequestError(error: unknown) {
  Alert.alert('Couldn’t request a reset link', errorMessage(error));
}

function emailValidationError(email: string) {
  const normalizedEmail = email.trim();
  if (!normalizedEmail) return 'Enter the email address for your account.';
  if (!normalizedEmail.includes('@')) return 'Enter a valid email address.';
  return null;
}

function firstParameter(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

const styles = StyleSheet.create({
  content: {
    gap: 16,
  },
  body: {
    color: colors.textMuted,
    fontFamily: fonts.regular,
    fontSize: 15,
    lineHeight: 22,
  },
});
