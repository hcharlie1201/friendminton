import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useCallback } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import type { Court } from '../../api/generated';
import { colors, fonts } from '../ui';

export function CourtResults({ courts, isLoading }: { courts: readonly Court[]; isLoading: boolean }) {
  if (isLoading) {
    return <Text style={styles.status}>Loading badminton courts…</Text>;
  }
  if (courts.length === 0) {
    return (
      <View style={styles.empty}>
        <MaterialCommunityIcons color={colors.primary} name="badminton" size={39} />
        <Text style={styles.emptyTitle}>No verified courts yet</Text>
        <Text style={styles.status}>Admins can seed courts, and community suggestions can be reviewed before publishing.</Text>
      </View>
    );
  }
  return <View style={styles.list}>{courts.map((court) => <CourtRow court={court} key={court.id} />)}</View>;
}

function CourtRow({ court }: { court: Court }) {
  const openDirections = useCourtDirections(court);
  return (
    <Pressable accessibilityRole="link" onPress={openDirections} style={styles.row}>
      <View style={styles.iconTile}>
        <MaterialCommunityIcons color={colors.primaryDark} name="badminton" size={25} />
      </View>
      <View style={styles.copy}>
        <View style={styles.nameRow}>
          <Text numberOfLines={1} style={styles.name}>{court.name}</Text>
          {court.verified_at && <Ionicons color={colors.success} name="checkmark-circle" size={17} />}
        </View>
        <Text numberOfLines={1} style={styles.address}>{court.address}</Text>
        <Text style={styles.metadata}>{courtMetadata(court)}</Text>
      </View>
      <Ionicons color={colors.muted} name="navigate-outline" size={21} />
    </Pressable>
  );
}

function useCourtDirections(court: Court) {
  return useCallback(() => {
    const destination = encodeURIComponent(`${court.latitude},${court.longitude}`);
    void Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${destination}`);
  }, [court.latitude, court.longitude]);
}

function courtMetadata(court: Court) {
  const count = court.court_count ? `${court.court_count} courts` : 'Court count pending';
  const environment = court.environment.charAt(0).toUpperCase() + court.environment.slice(1);
  const access = court.drop_in_available ? 'Drop-in' : 'Check access';
  return `${count} · ${environment} · ${access}`;
}

const styles = StyleSheet.create({
  list: { borderBottomColor: colors.border, borderBottomWidth: 1 },
  row: { alignItems: 'center', borderTopColor: colors.border, borderTopWidth: 1, flexDirection: 'row', gap: 12, minHeight: 104, paddingVertical: 13 },
  iconTile: { alignItems: 'center', backgroundColor: colors.primarySoft, borderRadius: 13, height: 64, justifyContent: 'center', width: 64 },
  copy: { flex: 1, gap: 3, minWidth: 0 },
  nameRow: { alignItems: 'center', flexDirection: 'row', gap: 5 },
  name: { color: colors.ink, flexShrink: 1, fontFamily: fonts.black, fontSize: 16, fontWeight: '900' },
  address: { color: colors.muted, fontFamily: fonts.medium, fontSize: 12 },
  metadata: { color: colors.primaryDark, fontFamily: fonts.bold, fontSize: 11, marginTop: 3 },
  status: { color: colors.muted, fontFamily: fonts.medium, fontSize: 13, lineHeight: 19, textAlign: 'center' },
  empty: { alignItems: 'center', backgroundColor: colors.card, borderColor: colors.border, borderRadius: 16, borderWidth: 1, gap: 8, padding: 25 },
  emptyTitle: { color: colors.ink, fontFamily: fonts.black, fontSize: 17, fontWeight: '900' },
});
