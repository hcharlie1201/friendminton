import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useQuery, type QueryObserverResult } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getApiUsersById, type Player } from '../api/generated';
import { apiData } from '../api/runtime';
import { Button, colors, fonts } from '../components/ui';

export function PlayerProfileScreen() {
  const params = useLocalSearchParams<{ playerId?: string | string[] }>();
  const playerId = singleParam(params.playerId);
  const query = usePlayerProfile(playerId);
  const goBack = usePlayerBackNavigation();
  const retry = usePlayerRetry(query.refetch);

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar style="dark" />
      <PlayerProfileHeader onBack={goBack} />
      {query.data ? (
        <PlayerProfileContent player={query.data} />
      ) : query.isPending ? (
        <PlayerProfileLoading />
      ) : (
        <PlayerProfileError onRetry={retry} />
      )}
    </SafeAreaView>
  );
}

function PlayerProfileContent({ player }: { player: Player }) {
  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.hero}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{playerInitials(player.display_name)}</Text>
        </View>
        <Text accessibilityRole="header" style={styles.name}>{player.display_name}</Text>
        <View style={styles.badges}>
          <ProfileBadge icon="speedometer-outline" label={skillLevelLabel(player.skill_level)} />
          {player.city && <ProfileBadge icon="location-outline" label={player.city} />}
        </View>
      </View>

      <View style={styles.card}>
        <View style={styles.cardTitleRow}>
          <MaterialCommunityIcons color={colors.primary} name="badminton" size={22} />
          <Text style={styles.cardTitle}>About this player</Text>
        </View>
        <Text style={styles.bio}>
          {player.bio?.trim() || `${player.display_name} has not added a badminton bio yet.`}
        </Text>
      </View>

      <View style={styles.card}>
        <View style={styles.cardTitleRow}>
          <Ionicons color={colors.primary} name="people-outline" size={22} />
          <Text style={styles.cardTitle}>Play connection</Text>
        </View>
        <Text style={styles.bio}>
          Player messaging and direct challenge invitations will live here once challenge matching is enabled.
        </Text>
      </View>
    </ScrollView>
  );
}

function PlayerProfileHeader({ onBack }: { onBack: () => void }) {
  return (
    <View style={styles.header}>
      <Pressable
        accessibilityLabel="Back to player discovery"
        accessibilityRole="button"
        hitSlop={10}
        onPress={onBack}
        style={styles.headerButton}
      >
        <Ionicons color={colors.text} name="chevron-back" size={28} />
      </Pressable>
      <Text style={styles.headerTitle}>Player Profile</Text>
      <View style={styles.headerButton} />
    </View>
  );
}

function ProfileBadge({ icon, label }: { icon: keyof typeof Ionicons.glyphMap; label: string }) {
  return (
    <View style={styles.badge}>
      <Ionicons color={colors.primaryStrong} name={icon} size={16} />
      <Text style={styles.badgeText}>{label}</Text>
    </View>
  );
}

function PlayerProfileLoading() {
  return (
    <View style={styles.centeredState}>
      <ActivityIndicator color={colors.primary} size="large" />
      <Text style={styles.stateText}>Loading player profile...</Text>
    </View>
  );
}

function PlayerProfileError({ onRetry }: { onRetry: () => void }) {
  return (
    <View style={styles.centeredState}>
      <Ionicons color={colors.textMuted} name="person-circle-outline" size={42} />
      <Text style={styles.stateTitle}>Player unavailable</Text>
      <Text style={styles.stateText}>This profile may have been removed, or the API needs to be restarted.</Text>
      <Button onPress={onRetry} variant="secondary">Try again</Button>
    </View>
  );
}

function usePlayerProfile(playerId: string) {
  const load = useCallback(
    () => apiData<Player>(getApiUsersById({ path: { id: playerId } })),
    [playerId],
  );
  return useQuery({
    enabled: playerId.length > 0,
    queryFn: load,
    queryKey: ['players', 'profile', playerId],
  });
}

function usePlayerBackNavigation() {
  const router = useRouter();
  return useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/');
  }, [router]);
}

function usePlayerRetry(refetch: () => Promise<QueryObserverResult<Player, Error>>) {
  return useCallback(() => {
    void refetch();
  }, [refetch]);
}

function singleParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

function playerInitials(displayName: string) {
  return displayName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toLocaleUpperCase())
    .join('') || '?';
}

function skillLevelLabel(skillLevel: string) {
  return `${skillLevel.charAt(0).toLocaleUpperCase()}${skillLevel.slice(1)}`;
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.background, flex: 1 },
  header: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 58,
    paddingHorizontal: 14,
  },
  headerButton: { alignItems: 'center', height: 42, justifyContent: 'center', width: 42 },
  headerTitle: { color: colors.text, fontFamily: fonts.black, fontSize: 18, fontWeight: '900' },
  content: { gap: 16, padding: 20, paddingBottom: 40 },
  hero: { alignItems: 'center', gap: 12, paddingVertical: 24 },
  avatar: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderColor: colors.borderStrong,
    borderRadius: 52,
    borderWidth: 5,
    height: 104,
    justifyContent: 'center',
    width: 104,
  },
  avatarText: { color: colors.textOnPrimary, fontFamily: fonts.black, fontSize: 34, fontWeight: '900' },
  name: { color: colors.text, fontFamily: fonts.black, fontSize: 28, fontWeight: '900', textAlign: 'center' },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  badge: {
    alignItems: 'center',
    backgroundColor: colors.primarySurface,
    borderRadius: 99,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  badgeText: { color: colors.primaryStrong, fontFamily: fonts.black, fontSize: 12, fontWeight: '900' },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 20,
    borderWidth: 1,
    gap: 12,
    padding: 18,
  },
  cardTitleRow: { alignItems: 'center', flexDirection: 'row', gap: 9 },
  cardTitle: { color: colors.text, fontFamily: fonts.black, fontSize: 17, fontWeight: '900' },
  bio: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 15, lineHeight: 22 },
  centeredState: {
    alignItems: 'center',
    flex: 1,
    gap: 12,
    justifyContent: 'center',
    padding: 30,
  },
  stateTitle: { color: colors.text, fontFamily: fonts.black, fontSize: 21, fontWeight: '900' },
  stateText: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, textAlign: 'center' },
});
