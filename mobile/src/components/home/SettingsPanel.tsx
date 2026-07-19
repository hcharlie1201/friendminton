import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import type { Notification } from '../../api/generated';
import { getCurrentCity, LocationPermissionError } from '../../features/location/currentCity';
import { formatDate } from '../../lib/dates';
import { Button, Card, TextField, colors, fonts } from '../ui';

type Props = {
  city: string;
  displayName: string;
  email: string;
  notifications: Notification[];
  onCityChange: (city: string) => void;
  onSignOut: () => void;
};

export function SettingsPanel({ city, displayName, email, notifications, onCityChange, onSignOut }: Props) {
  const [isLocating, setIsLocating] = useState(false);

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
        <Button
          icon="navigate"
          loading={isLocating}
          onPress={() => void applyCurrentLocation({ onCityChange, setIsLocating })}
          variant="secondary"
        >
          Use current location
        </Button>
      </Card>

      <Card>
        <Text style={styles.sectionTitle}>Notifications</Text>
        {notifications.length === 0 ? (
          <Text style={styles.help}>No notifications yet.</Text>
        ) : (
          notifications.map((notification) => <NotificationRow key={notification.id} notification={notification} />)
        )}
      </Card>

      <Button icon="log-out-outline" onPress={onSignOut} variant="danger">
        Sign out
      </Button>
    </View>
  );
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
  onCityChange,
  setIsLocating,
}: {
  onCityChange: (city: string) => void;
  setIsLocating: (isLocating: boolean) => void;
}) {
  setIsLocating(true);

  try {
    onCityChange(await getCurrentCity());
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
    gap: 12,
  },
  title: {
    color: colors.ink,
    fontFamily: fonts.black,
    fontSize: 20,
    fontWeight: '900',
  },
  meta: {
    color: colors.muted,
    fontFamily: fonts.bold,
    fontSize: 14,
    fontWeight: '700',
  },
  sectionTitle: {
    color: colors.ink,
    fontFamily: fonts.black,
    fontSize: 17,
    fontWeight: '900',
  },
  help: {
    color: colors.muted,
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
    color: colors.ink,
    fontFamily: fonts.black,
    fontSize: 15,
    fontWeight: '900',
  },
  notificationText: {
    color: colors.muted,
    fontFamily: fonts.regular,
    fontSize: 14,
    lineHeight: 20,
  },
  notificationTime: {
    color: colors.muted,
    fontFamily: fonts.bold,
    fontSize: 12,
    fontWeight: '700',
  },
});
