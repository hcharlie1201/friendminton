import { useCallback, useState, type ReactNode } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import type { Notification } from '../../api/generated';
import { getCurrentLocation, LocationPermissionError } from '../../features/location/currentCity';
import { formatDate } from '../../lib/dates';
import { LocationAutocomplete, type SelectedLocation } from '../location';
import { Button, colors, fonts } from '../ui';
import type { DiscoveryLocation } from './types';

type Props = {
  children?: ReactNode;
  city: string;
  displayName: string;
  email: string;
  notifications: Notification[];
  onLocationChange: (location: DiscoveryLocation) => void;
  onSignOut: () => void;
};

export function SettingsPanel({ children, city, displayName, email, notifications, onLocationChange, onSignOut }: Props) {
  const location = useSettingsLocation(onLocationChange);

  return (
    <View style={styles.wrapper}>
      <View style={styles.profileSection}>
        <Text style={styles.title}>{displayName}</Text>
        <Text style={styles.meta}>{email}</Text>
      </View>

      {children}

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
        <Button icon="log-out-outline" onPress={onSignOut} variant="danger">
          Sign out
        </Button>
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

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: colors.background,
  },
  profileSection: {
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
  signOutSection: { backgroundColor: colors.surface, paddingHorizontal: 20, paddingVertical: 24 },
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
