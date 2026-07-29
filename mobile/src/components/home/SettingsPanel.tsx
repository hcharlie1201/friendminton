import * as AppleAuthentication from 'expo-apple-authentication';
import { useCallback, useState } from 'react';
import { Alert, Platform, StyleSheet, Text, View } from 'react-native';

import {
  getApiAuthAccountDeletion,
  postApiAuthDeleteAccount,
  postApiAuthOauthAppleChallenge,
  type AccountDeletionRequirements,
  type DeleteAccount,
  type Notification,
} from '../../api/generated';
import { apiData, apiSuccess } from '../../api/runtime';
import { normalizeAppError } from '../../common/errors';
import { getCurrentLocation, LocationPermissionError } from '../../features/location/currentCity';
import { formatDate } from '../../lib/dates';
import { LocationAutocomplete, type SelectedLocation } from '../location';
import { Button, TextField, colors, fonts } from '../ui';
import type { DiscoveryLocation } from './types';

type Props = {
  city: string;
  email: string;
  notifications: Notification[];
  onLocationChange: (location: DiscoveryLocation) => void;
  onAccountDeleted: () => Promise<void>;
  onSignOut: () => void;
};

export function SettingsPanel({
  city,
  email,
  notifications,
  onLocationChange,
  onAccountDeleted,
  onSignOut,
}: Props) {
  const location = useSettingsLocation(onLocationChange);
  const deletion = useAccountDeletion(onAccountDeleted);

  return (
    <View style={styles.wrapper}>
      <View style={styles.accountSection}>
        <Text style={styles.title}>Account & settings</Text>
        <Text style={styles.meta}>{email}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Discovery Settings</Text>
        <Text style={styles.help}>Used for player and group discovery. Your home feed stays global.</Text>
        <LocationAutocomplete
          initialText={city}
          onSelect={location.select}
          placeholder="Search for your home city"
          value={null}
        />
        <Button
          icon="navigate"
          loading={location.isLocating}
          onPress={location.useCurrent}
          variant="secondary"
        >
          Use current location
        </Button>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Notifications</Text>
        {notifications.length === 0 ? (
          <Text style={styles.help}>No notifications yet.</Text>
        ) : (
          notifications.map((notification) => <NotificationRow key={notification.id} notification={notification} />)
        )}
      </View>

      <View style={styles.signOutSection}>
        {deletion.isOpen ? (
          <View style={styles.deleteForm}>
            <Text style={styles.sectionTitle}>Delete account</Text>
            <Text style={styles.help}>
              This permanently deletes your Friendminton account, profile, and associated activity.
              Type {deletion.requirements?.confirmation_phrase ?? 'DELETE'} to confirm.
            </Text>
            <TextField
              autoCapitalize="characters"
              autoCorrect={false}
              onChangeText={deletion.setConfirmation}
              placeholder={deletion.requirements?.confirmation_phrase ?? 'DELETE'}
              value={deletion.confirmation}
            />
            {deletion.requirements?.requires_password ? (
              <TextField
                autoCapitalize="none"
                autoCorrect={false}
                onChangeText={deletion.setPassword}
                placeholder="Password"
                secureTextEntry
                value={deletion.password}
              />
            ) : null}
            {deletion.requirements?.requires_apple_reauth ? (
              <Text style={styles.help}>
                You will confirm with Sign in with Apple before the account is deleted.
              </Text>
            ) : null}
            {deletion.error ? <Text style={styles.error}>{deletion.error}</Text> : null}
            <Button loading={deletion.isSubmitting} onPress={deletion.confirm} variant="danger">
              {deletion.requirements?.requires_apple_reauth
                ? 'Continue with Apple to delete'
                : 'Permanently delete account'}
            </Button>
            <Button disabled={deletion.isSubmitting} onPress={deletion.cancel} variant="secondary">
              Cancel
            </Button>
          </View>
        ) : (
          <>
            <Button icon="log-out-outline" onPress={onSignOut} variant="danger">
              Sign out
            </Button>
            <Button loading={deletion.isOpening} onPress={deletion.open} variant="secondary">
              Delete account
            </Button>
          </>
        )}
      </View>
    </View>
  );
}

function useSettingsLocation(onLocationChange: Props['onLocationChange']) {
  const [isLocating, setIsLocating] = useState(false);
  const select = useCallback((location: SelectedLocation) => {
    onLocationChange({
      city: location.city ?? location.label,
      latitude: location.latitude,
      longitude: location.longitude,
    });
  }, [onLocationChange]);
  const useCurrent = useCallback(() => {
    void applyCurrentLocation({ onLocationChange, setIsLocating });
  }, [onLocationChange]);
  return { isLocating, select, useCurrent };
}

function useAccountDeletion(onAccountDeleted: Props['onAccountDeleted']) {
  const [isOpen, setIsOpen] = useState(false);
  const [isOpening, setIsOpening] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState('');
  const [password, setPassword] = useState('');
  const [requirements, setRequirements] = useState<AccountDeletionRequirements | null>(null);

  const cancel = useCallback(() => {
    setIsOpen(false);
    setError(null);
    setConfirmation('');
    setPassword('');
    setRequirements(null);
  }, []);
  const open = useCallback(() => {
    void openAccountDeletion({
      setError,
      setIsOpen,
      setIsOpening,
      setRequirements,
    });
  }, []);
  const confirm = useCallback(() => {
    void submitAccountDeletion({
      confirmation,
      onAccountDeleted,
      password,
      requirements,
      setError,
      setIsSubmitting,
    });
  }, [confirmation, onAccountDeleted, password, requirements]);

  return {
    cancel,
    confirm,
    confirmation,
    error,
    isOpen,
    isOpening,
    isSubmitting,
    open,
    password,
    requirements,
    setConfirmation,
    setPassword,
  };
}

function NotificationRow({ notification }: { notification: Notification }) {
  return (
    <View style={styles.notification}>
      <View style={[styles.unreadDot, notification.read_at && styles.readDot]} />
      <View style={styles.notificationBody}>
        <Text style={styles.notificationTitle}>{notification.title}</Text>
        <Text style={styles.notificationText}>{notification.body}</Text>
        <Text style={styles.notificationTime}>{formatDate(notification.created_at)}</Text>
      </View>
    </View>
  );
}

async function applyCurrentLocation({
  onLocationChange,
  setIsLocating,
}: {
  onLocationChange: (location: DiscoveryLocation) => void;
  setIsLocating: (isLocating: boolean) => void;
}) {
  setIsLocating(true);

  try {
    onLocationChange(await getCurrentLocation());
  } catch (error) {
    const message =
      error instanceof LocationPermissionError
        ? 'Location permission is needed to use your current city.'
        : error instanceof Error
          ? error.message
          : 'Could not read your location.';
    Alert.alert('Friendminton', message);
  } finally {
    setIsLocating(false);
  }
}

async function openAccountDeletion({
  setError,
  setIsOpen,
  setIsOpening,
  setRequirements,
}: {
  setError: (error: string | null) => void;
  setIsOpen: (isOpen: boolean) => void;
  setIsOpening: (isOpening: boolean) => void;
  setRequirements: (requirements: AccountDeletionRequirements | null) => void;
}) {
  setIsOpening(true);
  setError(null);
  try {
    const nextRequirements = await apiData(getApiAuthAccountDeletion());
    if (nextRequirements.requires_apple_reauth && Platform.OS !== 'ios') {
      Alert.alert(
        'Delete account',
        'This account uses Sign in with Apple. Open Friendminton on iPhone to delete it.',
      );
      return;
    }
    setRequirements(nextRequirements);
    setIsOpen(true);
  } catch (error) {
    Alert.alert('Friendminton', normalizeAppError(error).message);
  } finally {
    setIsOpening(false);
  }
}

async function submitAccountDeletion({
  confirmation,
  onAccountDeleted,
  password,
  requirements,
  setError,
  setIsSubmitting,
}: {
  confirmation: string;
  onAccountDeleted: () => Promise<void>;
  password: string;
  requirements: AccountDeletionRequirements | null;
  setError: (error: string | null) => void;
  setIsSubmitting: (isSubmitting: boolean) => void;
}) {
  if (!requirements) return;
  if (confirmation.trim() !== requirements.confirmation_phrase) {
    setError(`Type ${requirements.confirmation_phrase} to confirm.`);
    return;
  }
  if (requirements.requires_password && !password.trim()) {
    setError('Enter your password to delete this account.');
    return;
  }

  setIsSubmitting(true);
  setError(null);
  try {
    const body: DeleteAccount = {
      confirmation: requirements.confirmation_phrase,
      password: requirements.requires_password ? password : null,
      apple_authorization_code: null,
      apple_identity_token: null,
      apple_nonce: null,
    };
    if (requirements.requires_apple_reauth) {
      Object.assign(body, await appleReauthCredentials());
    }
    await apiSuccess(postApiAuthDeleteAccount({ body }));
    await onAccountDeleted();
  } catch (error) {
    if (isAppleCancellation(error)) {
      setError(null);
      return;
    }
    setError(normalizeAppError(error).message);
  } finally {
    setIsSubmitting(false);
  }
}

async function appleReauthCredentials(): Promise<Pick<
  DeleteAccount,
  'apple_authorization_code' | 'apple_identity_token' | 'apple_nonce'
>> {
  const available = await AppleAuthentication.isAvailableAsync();
  if (!available) {
    throw new Error('Sign in with Apple is not available on this device.');
  }
  const challenge = await apiData(postApiAuthOauthAppleChallenge());
  const credential = await AppleAuthentication.signInAsync({
    nonce: challenge.nonce,
    requestedScopes: [],
  });
  if (!credential.identityToken || !credential.authorizationCode) {
    throw new Error('Apple did not return the credentials required to delete this account.');
  }
  return {
    apple_authorization_code: credential.authorizationCode,
    apple_identity_token: credential.identityToken,
    apple_nonce: challenge.nonce,
  };
}

function isAppleCancellation(error: unknown) {
  return (
    typeof error === 'object'
    && error !== null
    && 'code' in error
    && (error as { code?: string }).code === 'ERR_REQUEST_CANCELED'
  );
}

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: colors.background,
  },
  accountSection: {
    backgroundColor: colors.surface,
    borderBottomColor: colors.border,
    borderBottomWidth: 8,
    gap: 3,
    paddingHorizontal: 20,
    paddingVertical: 26,
  },
  section: {
    backgroundColor: colors.surface,
    borderBottomColor: colors.border,
    borderBottomWidth: 8,
    gap: 13,
    paddingHorizontal: 20,
    paddingVertical: 24,
  },
  signOutSection: {
    backgroundColor: colors.surface,
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 24,
  },
  deleteForm: {
    gap: 12,
  },
  title: {
    color: colors.text,
    fontFamily: fonts.black,
    fontSize: 20,
    fontWeight: '900',
  },
  meta: {
    color: colors.textMuted,
    fontFamily: fonts.bold,
    fontSize: 14,
    fontWeight: '700',
  },
  sectionTitle: {
    color: colors.text,
    fontFamily: fonts.black,
    fontSize: 17,
    fontWeight: '900',
  },
  help: {
    color: colors.textMuted,
    fontFamily: fonts.regular,
    fontSize: 14,
    lineHeight: 20,
  },
  error: {
    color: colors.danger,
    fontFamily: fonts.bold,
    fontSize: 14,
    fontWeight: '700',
  },
  notification: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 10,
  },
  unreadDot: {
    backgroundColor: colors.primary,
    borderRadius: 5,
    height: 10,
    marginTop: 6,
    width: 10,
  },
  readDot: {
    backgroundColor: colors.border,
  },
  notificationBody: {
    flex: 1,
    gap: 3,
  },
  notificationTitle: {
    color: colors.text,
    fontFamily: fonts.black,
    fontSize: 15,
    fontWeight: '900',
  },
  notificationText: {
    color: colors.textMuted,
    fontFamily: fonts.regular,
    fontSize: 14,
    lineHeight: 20,
  },
  notificationTime: {
    color: colors.textMuted,
    fontFamily: fonts.bold,
    fontSize: 12,
    fontWeight: '700',
  },
});
