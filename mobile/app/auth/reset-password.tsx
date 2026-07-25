import { useMutation } from '@tanstack/react-query';
import { type Href, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { postApiAuthResetPassword } from '../../src/api/generated';
import { apiData } from '../../src/api/runtime';
import { useSession } from '../../src/auth/session';
import { errorMessage, normalizeAppError } from '../../src/common/errors';
import { Button, PageHeader, Screen, TextField, colors, fonts } from '../../src/components/ui';

export default function ResetPasswordScreen() {
  const params = useLocalSearchParams<{ token?: string | string[] }>();
  const token = firstParameter(params.token);
  const { clearSession } = useSession();
  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [isComplete, setIsComplete] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(
    token ? null : 'This reset link is missing its security token.',
  );
  const reset = usePasswordReset({
    clearSession,
    password,
    passwordConfirmation,
    setIsComplete,
    setLinkError,
    token,
  });
  const goToSignIn = useSignInNavigation();
  const openForgotPassword = useForgotPasswordNavigation();

  return (
    <Screen centered>
      <View style={styles.content}>
        <PageHeader
          eyebrow="Account recovery"
          title={isComplete ? 'Password updated.' : 'Choose a new password.'}
        />
        {isComplete ? (
          <>
            <Text style={styles.body}>
              Your password has been changed and other signed-in sessions were closed.
            </Text>
            <Button onPress={goToSignIn}>Sign in</Button>
          </>
        ) : linkError ? (
          <>
            <View style={styles.errorNotice}>
              <Text style={styles.errorTitle}>This link can’t be used</Text>
              <Text style={styles.errorBody}>{linkError}</Text>
            </View>
            <Button onPress={openForgotPassword}>Request another link</Button>
            <Button onPress={goToSignIn} variant="quiet">
              Back to sign in
            </Button>
          </>
        ) : (
          <>
            <Text style={styles.body}>
              Use at least 8 characters. Resetting your password signs out your other sessions.
            </Text>
            <TextField
              autoCapitalize="none"
              autoComplete="new-password"
              onChangeText={setPassword}
              placeholder="New password"
              secureTextEntry
              value={password}
            />
            <TextField
              autoCapitalize="none"
              autoComplete="new-password"
              onChangeText={setPasswordConfirmation}
              placeholder="Confirm new password"
              secureTextEntry
              value={passwordConfirmation}
            />
            <Button loading={reset.isPending} onPress={reset.submit}>
              Update password
            </Button>
          </>
        )}
      </View>
    </Screen>
  );
}

function usePasswordReset({
  clearSession,
  password,
  passwordConfirmation,
  setIsComplete,
  setLinkError,
  token,
}: {
  clearSession: () => Promise<void>;
  password: string;
  passwordConfirmation: string;
  setIsComplete: (isComplete: boolean) => void;
  setLinkError: (message: string | null) => void;
  token: string | undefined;
}) {
  const mutationFn = useCallback(
    () => resetPasswordAndClearSession(token, password, clearSession),
    [clearSession, password, token],
  );
  const handleSuccess = useCallback(() => {
    setIsComplete(true);
  }, [setIsComplete]);
  const handleError = useCallback((error: unknown) => {
    const appError = normalizeAppError(error);
    if (isResetLinkError(appError.status, appError.message)) {
      setLinkError('This link is invalid or has expired. Request a new one to continue.');
      return;
    }
    showResetError(error);
  }, [setLinkError]);
  const mutation = useMutation({
    mutationFn,
    onError: handleError,
    onSuccess: handleSuccess,
  });
  const submit = useCallback(() => {
    const validationError = passwordValidationError(token, password, passwordConfirmation);
    if (validationError) {
      Alert.alert('Unable to update password', validationError);
      return;
    }
    mutation.mutate();
  }, [mutation, password, passwordConfirmation, token]);

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

function useForgotPasswordNavigation() {
  const router = useRouter();
  return useCallback(() => {
    router.replace('/auth/forgot-password' as Href);
  }, [router]);
}

async function resetPasswordAndClearSession(
  token: string | undefined,
  newPassword: string,
  clearSession: () => Promise<void>,
) {
  if (!token) {
    throw new Error('Password reset token is missing.');
  }
  await apiData(postApiAuthResetPassword({
    body: {
      new_password: newPassword,
      token,
    },
  }));
  try {
    await clearSession();
  } catch {
    // The server already revoked the session. A persisted stale token will be
    // discarded by session restoration on the next launch.
  }
}

function showResetError(error: unknown) {
  Alert.alert('Couldn’t update your password', errorMessage(error));
}

function passwordValidationError(
  token: string | undefined,
  password: string,
  passwordConfirmation: string,
) {
  if (!token) return 'This reset link is missing its security token.';
  if (password.length < 8) return 'Your password must be at least 8 characters.';
  if (password !== passwordConfirmation) return 'The passwords do not match.';
  return null;
}

function isResetLinkError(status: number | undefined, message: string) {
  if (status !== 400) return false;
  return /token|expired|reset link/i.test(message);
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
  errorNotice: {
    backgroundColor: colors.dangerSurface,
    borderColor: colors.dangerBorder,
    borderRadius: 12,
    borderWidth: 1,
    gap: 3,
    padding: 13,
  },
  errorTitle: {
    color: colors.danger,
    fontFamily: fonts.black,
    fontSize: 14,
  },
  errorBody: {
    color: colors.textMuted,
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 19,
  },
});
