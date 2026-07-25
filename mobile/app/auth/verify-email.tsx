import { useMutation } from '@tanstack/react-query';
import { type Href, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { postApiAuthVerificationResend } from '../../src/api/generated';
import { apiData } from '../../src/api/runtime';
import { errorMessage } from '../../src/common/errors';
import { Button, PageHeader, Screen, TextField, colors, fonts } from '../../src/components/ui';

export default function VerifyEmailScreen() {
  const params = useLocalSearchParams<{
    email?: string | string[];
    emailSent?: string | string[];
  }>();
  const [email, setEmail] = useState(firstParameter(params.email) ?? '');
  const resend = useVerificationResend(email);
  const goToSignIn = useSignInNavigation();
  const deliveryState = emailDeliveryState(firstParameter(params.emailSent));

  return (
    <Screen centered>
      <View style={styles.content}>
        <PageHeader eyebrow="One more step" title="Check your email." />
        <Text style={styles.body}>{deliveryMessage(deliveryState)}</Text>
        <TextField
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          onChangeText={setEmail}
          placeholder="Email"
          value={email}
        />
        <Button
          loading={resend.isPending}
          onPress={resend.submit}
          variant="secondary"
        >
          Resend verification email
        </Button>
        <Button onPress={goToSignIn} variant="quiet">
          Back to sign in
        </Button>
        <Text style={styles.help}>
          After you tap the verification link, Friendminton will reopen at the sign-in screen.
        </Text>
      </View>
    </Screen>
  );
}

function useVerificationResend(email: string) {
  const mutationFn = useCallback(
    () => resendVerificationEmail(email),
    [email],
  );
  const mutation = useMutation({
    mutationFn,
    onError: showResendError,
    onSuccess: showResendSuccess,
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

async function resendVerificationEmail(email: string) {
  return apiData(postApiAuthVerificationResend({
    body: { email: email.trim() },
  }));
}

function showResendSuccess() {
  Alert.alert(
    'Check your email',
    'If this account still needs verification, a new link is on its way.',
  );
}

function showResendError(error: unknown) {
  Alert.alert('Couldn’t resend the email', errorMessage(error));
}

function emailValidationError(email: string) {
  const normalizedEmail = email.trim();
  if (!normalizedEmail) return 'Enter the email address for your account.';
  if (!normalizedEmail.includes('@')) return 'Enter a valid email address.';
  return null;
}

function emailDeliveryState(value: string | undefined) {
  if (value === 'true') return 'sent';
  if (value === 'false') return 'failed';
  return 'unknown';
}

function deliveryMessage(state: ReturnType<typeof emailDeliveryState>) {
  if (state === 'sent') {
    return 'We sent a verification link to the address below. Open it to finish setting up your account.';
  }
  if (state === 'failed') {
    return 'Your account was created, but the first email could not be sent. Try resending it below.';
  }
  return 'Verify your email before signing in. If your link expired, request a new one below.';
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
  help: {
    color: colors.textSubtle,
    fontFamily: fonts.regular,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
});
