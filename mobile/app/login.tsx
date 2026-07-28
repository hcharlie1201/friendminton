import { useMutation } from '@tanstack/react-query';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import { type Href, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';

import {
  postApiAuthOauthApple,
  postApiAuthOauthAppleChallenge,
  postApiAuthOauthAppleCreate,
  postApiAuthOauthAppleLink,
  postApiAuthOauthExchange,
  postApiAuthOauthGoogleStart,
  postApiAuthSignInEmail,
  postApiAuthSignOut,
  postApiAuthSignUpEmail,
  type AppleSignInOutcome,
  type AuthenticatedSession,
  type EmailSignUpPending,
} from '../src/api/generated';
import { apiData, apiSuccess } from '../src/api/runtime';
import { useSession } from '../src/auth/session';
import {
  AppError,
  AppErrorKind,
  errorMessage,
  normalizeAppError,
} from '../src/common/errors';
import { Button, PageHeader, Screen, TextField, colors, fonts } from '../src/components/ui';

type AuthenticationMode = 'signIn' | 'signUp';
type VerificationRouteDetails = {
  email: string;
  emailSent?: boolean;
};
type EmailAuthenticationResult =
  | { mode: 'signIn'; session: AuthenticatedSession }
  | { mode: 'signUp'; pending: EmailSignUpPending };
type PendingAppleRegistration = Extract<
  AppleSignInOutcome,
  { status: 'registration_required' }
>;

const mobileAuthRedirectUrl = 'friendminton://auth/callback';

WebBrowser.maybeCompleteAuthSession();

export default function LoginScreen() {
  const { signIn } = useSession();
  const { verified } = useLocalSearchParams<{ verified?: string | string[] }>();
  const { mode, selectMode, toggleMode } = useAuthenticationMode();
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [pendingAppleRegistration, setPendingAppleRegistration] =
    useState<PendingAppleRegistration | null>(null);
  const [pendingAppleLinkToken, setPendingAppleLinkToken] = useState<string | null>(null);
  const emailAuthentication = useEmailAuthentication(
    mode,
    email,
    password,
    displayName,
    pendingAppleLinkToken,
    signIn,
  );
  const appleAuthentication = useAppleAuthentication(signIn, setPendingAppleRegistration);
  const appleRegistration = useCompleteAppleRegistration(signIn);
  const googleAuthentication = useGoogleAuthentication(signIn, pendingAppleLinkToken);
  const openForgotPassword = useForgotPasswordNavigation(email);
  const isSignUp = mode === 'signUp';
  const wasJustVerified = firstParameter(verified) === 'true';
  const chooseExistingAccount = useCallback(() => {
    if (!pendingAppleRegistration) return;
    setPendingAppleLinkToken(pendingAppleRegistration.pending_token);
    setPendingAppleRegistration(null);
    selectMode('signIn');
  }, [pendingAppleRegistration, selectMode]);

  if (pendingAppleRegistration) {
    return (
      <Screen centered>
        <View style={styles.header}>
          <PageHeader eyebrow="Sign in with Apple" title="Is this a new Friendminton account?" />
        </View>
        <View style={styles.form}>
          <View style={styles.appleChoiceNotice}>
            <Text style={styles.appleChoiceTitle}>Apple shared this email</Text>
            <Text style={styles.appleChoiceEmail}>{pendingAppleRegistration.apple_email}</Text>
            <Text style={styles.appleChoiceBody}>
              Apple’s email may be different from the one you already use for Friendminton.
              Choose carefully so your games and groups stay in one account.
            </Text>
          </View>
          <Button
            loading={appleRegistration.isPending}
            onPress={() => appleRegistration.submit(pendingAppleRegistration.pending_token)}
          >
            Create a new account
          </Button>
          <Button onPress={chooseExistingAccount} variant="secondary">
            I already have an account
          </Button>
          <Button onPress={() => setPendingAppleRegistration(null)} variant="quiet">
            Cancel
          </Button>
        </View>
      </Screen>
    );
  }

  return (
    <Screen centered>
      <View style={styles.header}>
        <PageHeader
          eyebrow="Friendminton"
          title={isSignUp ? 'Find your people. Play more badminton.' : 'Welcome back.'}
        />
      </View>

      <View style={styles.form}>
        {pendingAppleLinkToken && (
          <View style={styles.appleLinkNotice}>
            <Text style={styles.appleLinkNoticeTitle}>Link Apple to your existing account</Text>
            <Text style={styles.appleLinkNoticeBody}>
              Sign in with email or Google. We’ll attach Apple only after your existing account is
              authenticated.
            </Text>
            <Button onPress={() => setPendingAppleLinkToken(null)} variant="quiet">
              Cancel linking
            </Button>
          </View>
        )}
        {wasJustVerified && (
          <View style={styles.successNotice}>
            <Text style={styles.successNoticeTitle}>Email verified</Text>
            <Text style={styles.successNoticeBody}>You can sign in to your account now.</Text>
          </View>
        )}
        {appleAuthentication.isAvailable && !pendingAppleLinkToken && (
          <AppleAuthentication.AppleAuthenticationButton
            buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
            cornerRadius={12}
            onPress={appleAuthentication.submit}
            style={styles.appleButton}
          />
        )}
        <Button
          icon="logo-google"
          loading={googleAuthentication.isPending}
          onPress={googleAuthentication.submit}
          variant="secondary"
        >
          Continue with Google
        </Button>

        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerLabel}>or use email</Text>
          <View style={styles.dividerLine} />
        </View>

        <TextField
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          onChangeText={setEmail}
          placeholder="Email"
          value={email}
        />
        <TextField
          autoCapitalize="none"
          autoComplete={isSignUp ? 'new-password' : 'current-password'}
          onChangeText={setPassword}
          placeholder="Password"
          secureTextEntry
          value={password}
        />
        {isSignUp && (
          <TextField
            autoCapitalize="words"
            autoComplete="name"
            onChangeText={setDisplayName}
            placeholder="Display name"
            value={displayName}
          />
        )}
        <Button loading={emailAuthentication.isPending} onPress={emailAuthentication.submit}>
          {isSignUp ? 'Create account' : 'Sign in'}
        </Button>
        {!isSignUp && (
          <Button onPress={openForgotPassword} variant="quiet">
            Forgot password?
          </Button>
        )}
        {!pendingAppleLinkToken && (
          <Button onPress={toggleMode} variant="quiet">
            {isSignUp ? 'Already have an account? Sign in' : 'New here? Create an account'}
          </Button>
        )}
        <Text style={styles.nextStep}>
          {isSignUp
            ? 'We’ll email you a link to verify your account before you sign in.'
            : 'Your games, groups, and activity will be right where you left them.'}
        </Text>
      </View>
    </Screen>
  );
}

function useAuthenticationMode() {
  const [mode, setMode] = useState<AuthenticationMode>('signIn');
  const toggleMode = useCallback(() => {
    setMode((currentMode) => currentMode === 'signIn' ? 'signUp' : 'signIn');
  }, []);
  const selectMode = useCallback((nextMode: AuthenticationMode) => setMode(nextMode), []);
  return { mode, selectMode, toggleMode };
}

function useEmailAuthentication(
  mode: AuthenticationMode,
  email: string,
  password: string,
  displayName: string,
  pendingAppleLinkToken: string | null,
  signIn: ReturnType<typeof useSession>['signIn'],
) {
  const router = useRouter();
  const mutationFn = useCallback(
    async () => {
      const result = await authenticateWithEmail(mode, email, password, displayName);
      if (result.mode === 'signIn' && pendingAppleLinkToken) {
        const session = await linkAppleAfterSignIn(result.session, pendingAppleLinkToken);
        return { mode: 'signIn' as const, session };
      }
      return result;
    },
    [displayName, email, mode, password, pendingAppleLinkToken],
  );
  const handleSuccess = useCallback(async (result: EmailAuthenticationResult) => {
    if (result.mode === 'signIn') {
      await signIn(result.session);
      return;
    }
    router.replace(verificationRoute({
      email: result.pending.email,
      emailSent: result.pending.email_sent,
    }));
  }, [router, signIn]);
  const handleError = useCallback((error: unknown) => {
    const appError = normalizeAppError(error);
    if (mode === 'signIn' && appError.code === 'email_not_verified') {
      router.push(verificationRoute({
        email: email.trim(),
      }));
      return;
    }
    showEmailAuthenticationError(error, mode);
  }, [email, mode, router]);
  const mutation = useMutation({
    mutationFn,
    onError: handleError,
    onSuccess: handleSuccess,
  });
  const submit = useSubmitEmailAuthentication(
    mutation.mutate,
    mode,
    email,
    password,
    displayName,
  );
  return { isPending: mutation.isPending, submit };
}

function useForgotPasswordNavigation(email: string) {
  const router = useRouter();
  return useCallback(() => {
    router.push(forgotPasswordRoute(email));
  }, [email, router]);
}

function useSubmitEmailAuthentication(
  submit: () => void,
  mode: AuthenticationMode,
  email: string,
  password: string,
  displayName: string,
) {
  return useCallback(() => {
    const validationError = authenticationValidationError(mode, email, password, displayName);
    if (validationError) {
      Alert.alert('Unable to continue', validationError);
      return;
    }
    submit();
  }, [displayName, email, mode, password, submit]);
}

function useGoogleAuthentication(
  signIn: ReturnType<typeof useSession>['signIn'],
  pendingAppleLinkToken: string | null,
) {
  const mutation = useMutation({
    mutationFn: async () => {
      const session = await authenticateWithGoogle();
      if (pendingAppleLinkToken) {
        return linkAppleAfterSignIn(session, pendingAppleLinkToken);
      }
      return session;
    },
    onError: showAuthenticationError,
    onSuccess: signIn,
  });
  return {
    isPending: mutation.isPending,
    submit: mutation.mutate,
  };
}

function useAppleAuthentication(
  signIn: ReturnType<typeof useSession>['signIn'],
  requireRegistration: (pending: PendingAppleRegistration) => void,
) {
  const [isAvailable, setIsAvailable] = useState(false);
  useEffect(() => {
    let active = true;
    AppleAuthentication.isAvailableAsync()
      .then((available) => {
        if (active) setIsAvailable(available);
      })
      .catch(() => {
        if (active) setIsAvailable(false);
      });
    return () => {
      active = false;
    };
  }, []);
  const mutation = useMutation({
    mutationFn: authenticateWithApple,
    onError: showAuthenticationError,
    onSuccess: async (outcome) => {
      if (outcome.status === 'authenticated') {
        await signIn(outcome.session);
        return;
      }
      requireRegistration(outcome);
    },
  });
  const { isPending, mutate } = mutation;
  const submit = useCallback(() => {
    if (!isPending) mutate();
  }, [isPending, mutate]);
  return {
    isAvailable,
    isPending,
    submit,
  };
}

function useCompleteAppleRegistration(signIn: ReturnType<typeof useSession>['signIn']) {
  const mutation = useMutation({
    mutationFn: (pendingToken: string) => apiData(postApiAuthOauthAppleCreate({
      body: { pending_token: pendingToken },
    })),
    onError: showAuthenticationError,
    onSuccess: signIn,
  });
  return {
    isPending: mutation.isPending,
    submit: mutation.mutate,
  };
}

async function authenticateWithEmail(
  mode: AuthenticationMode,
  email: string,
  password: string,
  displayName: string,
): Promise<EmailAuthenticationResult> {
  if (mode === 'signIn') {
    const session = await apiData(postApiAuthSignInEmail({
      body: {
        email: email.trim(),
        password,
      },
    }));
    return { mode, session };
  }

  const pending = await apiData(postApiAuthSignUpEmail({
    body: {
      bio: null,
      city: null,
      display_name: displayName.trim(),
      email: email.trim(),
      password,
      skill_level: 'intermediate',
    },
  }));
  return {
    mode,
    pending,
  };
}

async function authenticateWithGoogle(): Promise<AuthenticatedSession> {
  const { challenge, verifier } = await createMobilePkce();
  const start = await apiData(postApiAuthOauthGoogleStart({
    body: { code_challenge: challenge },
  }));
  const browserResult = await WebBrowser.openAuthSessionAsync(
    start.authorization_url,
    mobileAuthRedirectUrl,
  );
  if (browserResult.type === 'cancel' || browserResult.type === 'dismiss') {
    throw new AuthenticationCancelledError();
  }
  if (browserResult.type !== 'success') {
    throw new AppError(
      AppErrorKind.Authentication,
      'Google sign-in did not finish. Please try again.',
    );
  }

  const callback = new URL(browserResult.url);
  const providerError = callback.searchParams.get('error');
  const code = callback.searchParams.get('code');
  if (providerError || !code) {
    throw new AppError(
      AppErrorKind.Authentication,
      'Google sign-in could not be completed. Please try again.',
    );
  }

  return apiData(postApiAuthOauthExchange({
    body: {
      code,
      code_verifier: verifier,
    },
  }));
}

async function authenticateWithApple(): Promise<AppleSignInOutcome> {
  const challenge = await apiData(postApiAuthOauthAppleChallenge());
  let credential: AppleAuthentication.AppleAuthenticationCredential;
  try {
    credential = await AppleAuthentication.signInAsync({
      nonce: challenge.nonce,
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });
  } catch (error) {
    if (isAppleCancellation(error)) throw new AuthenticationCancelledError();
    throw error;
  }
  if (!credential.identityToken || !credential.authorizationCode) {
    throw new AppError(
      AppErrorKind.Authentication,
      'Apple sign-in did not return the credentials required to continue.',
    );
  }

  return apiData(postApiAuthOauthApple({
    body: {
      authorization_code: credential.authorizationCode,
      display_name: appleDisplayName(credential.fullName),
      identity_token: credential.identityToken,
      nonce: challenge.nonce,
    },
  }));
}

async function linkAppleToSession(session: AuthenticatedSession, pendingToken: string) {
  await apiData(postApiAuthOauthAppleLink({
    body: { pending_token: pendingToken },
    headers: {
      Authorization: `Bearer ${session.token}`,
    },
  }));
}

async function linkAppleAfterSignIn(
  session: AuthenticatedSession,
  pendingToken: string,
): Promise<AuthenticatedSession> {
  try {
    await linkAppleToSession(session, pendingToken);
    return session;
  } catch (error) {
    await revokeSessionToken(session.token);
    throw error;
  }
}

async function revokeSessionToken(token: string) {
  try {
    await apiSuccess(postApiAuthSignOut({
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }));
  } catch {
    // Best effort: the client must not keep a session when Apple linking fails.
  }
}

async function createMobilePkce() {
  const bytes = await Crypto.getRandomBytesAsync(32);
  const verifier = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  const digest = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    verifier,
    { encoding: Crypto.CryptoEncoding.BASE64 },
  );
  return {
    challenge: base64Url(digest),
    verifier,
  };
}

function base64Url(value: string) {
  return value.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function showAuthenticationError(error: unknown) {
  if (error instanceof AuthenticationCancelledError) return;
  Alert.alert('Unable to sign in', errorMessage(error));
}

function isAppleCancellation(error: unknown) {
  return (
    typeof error === 'object'
    && error !== null
    && 'code' in error
    && error.code === 'ERR_REQUEST_CANCELED'
  );
}

function appleDisplayName(fullName: AppleAuthentication.AppleAuthenticationFullName | null) {
  if (!fullName) return null;
  const name = [fullName.givenName, fullName.middleName, fullName.familyName]
    .filter((part): part is string => Boolean(part?.trim()))
    .join(' ')
    .trim();
  return name || null;
}

function showEmailAuthenticationError(error: unknown, mode: AuthenticationMode) {
  Alert.alert(
    mode === 'signUp' ? 'Unable to create account' : 'Unable to sign in',
    errorMessage(error),
  );
}

function authenticationValidationError(
  mode: AuthenticationMode,
  email: string,
  password: string,
  displayName: string,
) {
  const normalizedEmail = email.trim();
  if (!normalizedEmail) return 'Enter your email address.';
  if (!normalizedEmail.includes('@')) return 'Enter a valid email address.';
  if (password.length < 8) return 'Your password must be at least 8 characters.';
  if (mode === 'signUp' && !displayName.trim()) return 'Enter your display name.';
  return null;
}

function verificationRoute(details: VerificationRouteDetails): Href {
  const params: Record<string, string> = { email: details.email };
  if (details.emailSent !== undefined) {
    params.emailSent = String(details.emailSent);
  }
  return {
    pathname: '/auth/verify-email',
    params,
  } as Href;
}

function forgotPasswordRoute(email: string): Href {
  return {
    pathname: '/auth/forgot-password',
    params: email.trim() ? { email: email.trim() } : {},
  } as Href;
}

function firstParameter(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

class AuthenticationCancelledError extends Error {}

const styles = StyleSheet.create({
  appleButton: {
    height: 50,
    width: '100%',
  },
  appleChoiceNotice: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: 1,
    gap: 6,
    padding: 16,
  },
  appleChoiceTitle: {
    color: colors.text,
    fontFamily: fonts.black,
    fontSize: 16,
  },
  appleChoiceEmail: {
    color: colors.primary,
    fontFamily: fonts.bold,
    fontSize: 14,
  },
  appleChoiceBody: {
    color: colors.textMuted,
    fontFamily: fonts.regular,
    fontSize: 14,
    lineHeight: 20,
  },
  appleLinkNotice: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.primary,
    borderRadius: 12,
    borderWidth: 1,
    gap: 6,
    padding: 12,
  },
  appleLinkNoticeTitle: {
    color: colors.text,
    fontFamily: fonts.black,
    fontSize: 14,
  },
  appleLinkNoticeBody: {
    color: colors.textMuted,
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 18,
  },
  header: {
    marginBottom: 28,
  },
  form: {
    gap: 14,
  },
  successNotice: {
    backgroundColor: colors.successSurface,
    borderColor: colors.success,
    borderRadius: 12,
    borderWidth: 1,
    gap: 2,
    padding: 12,
  },
  successNoticeTitle: {
    color: colors.success,
    fontFamily: fonts.black,
    fontSize: 14,
  },
  successNoticeBody: {
    color: colors.textMuted,
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 18,
  },
  divider: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  dividerLabel: {
    color: colors.textMuted,
    fontFamily: fonts.medium,
    fontSize: 12,
  },
  dividerLine: {
    backgroundColor: colors.border,
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },
  nextStep: {
    color: colors.textMuted,
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },
});
