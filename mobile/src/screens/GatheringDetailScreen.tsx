import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useQuery, type QueryObserverResult } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getApiGatheringsByGatheringId, type Gathering } from '../api/generated';
import { apiData, authHeaders } from '../api/runtime';
import { useSession } from '../auth/session';
import { GatheringDiscoveryCard } from '../components/gatherings';
import { Button, colors, fonts } from '../components/ui';

export function GatheringDetailScreen() {
  const params = useLocalSearchParams<{ gatheringId?: string | string[] }>();
  const gatheringId = singleParam(params.gatheringId);
  const { user } = useSession();
  const query = useGatheringDetail(gatheringId, user?.id ?? '');
  const goBack = useGatheringBackNavigation();
  const retry = useGatheringRetry(query.refetch);

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar style="dark" />
      <GatheringDetailHeader onBack={goBack} />
      {query.data ? (
        <GatheringDetailContent gathering={query.data} />
      ) : query.isPending ? (
        <GatheringDetailLoading />
      ) : (
        <GatheringDetailError onRetry={retry} />
      )}
    </SafeAreaView>
  );
}

function GatheringDetailContent({ gathering }: { gathering: Gathering }) {
  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <GatheringDiscoveryCard gathering={gathering} />

      {gathering.description && (
        <GatheringDetailSection icon="text-outline" title="About this gathering">
          <Text style={styles.description}>{gathering.description}</Text>
        </GatheringDetailSection>
      )}

      <GatheringDetailSection icon="information-circle-outline" title="Host details">
        <DetailRow
          icon="shield-checkmark-outline"
          label="Access"
          value={accessLabel(gathering)}
        />
        <DetailRow
          icon="people-outline"
          label="Capacity"
          value={gathering.capacity ? `${gathering.capacity} people` : 'Unlimited'}
        />
        <DetailRow
          icon="wallet-outline"
          label="Cost"
          value={formatCost(gathering.cost_per_person_cents, gathering.currency)}
        />
        {gathering.court_setup && (
          <DetailRow
            icon="grid-outline"
            label="Court setup"
            value={courtSetupLabel(gathering)}
          />
        )}
      </GatheringDetailSection>

      <View accessible accessibilityLabel="RSVP controls are not available yet" style={styles.rsvpNotice}>
        <MaterialCommunityIcons color={colors.primaryDark} name="badminton" size={25} />
        <View style={styles.rsvpCopy}>
          <Text style={styles.rsvpTitle}>Gathering details are live</Text>
          <Text style={styles.rsvpBody}>RSVP and host-management controls are the next part of this flow.</Text>
        </View>
      </View>
    </ScrollView>
  );
}

function courtSetupLabel(gathering: Gathering) {
  if (gathering.court_setup === 'drop_in') return 'Drop-in';
  if (!gathering.court_count) return 'Courts reserved';
  return `${gathering.court_count} reserved ${gathering.court_count === 1 ? 'court' : 'courts'}`;
}

function GatheringDetailHeader({ onBack }: { onBack: () => void }) {
  return (
    <View accessibilityRole="header" style={styles.header}>
      <Pressable
        accessibilityLabel="Back to Discover"
        accessibilityRole="button"
        hitSlop={10}
        onPress={onBack}
        style={styles.headerButton}
      >
        <Ionicons color={colors.ink} name="chevron-back" size={28} />
      </Pressable>
      <Text style={styles.headerTitle}>Gathering</Text>
      <View accessible={false} style={styles.headerButton} />
    </View>
  );
}

function GatheringDetailSection({
  children,
  icon,
  title,
}: {
  children: ReactNode;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeading}>
        <Ionicons color={colors.primary} name={icon} size={20} />
        <Text accessibilityRole="header" style={styles.sectionTitle}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

function DetailRow({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
}) {
  return (
    <View accessibilityLabel={`${label}: ${value}`} accessible style={styles.detailRow}>
      <Ionicons color={colors.muted} name={icon} size={19} />
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

function GatheringDetailLoading() {
  return (
    <View accessibilityLabel="Loading gathering" accessibilityRole="progressbar" style={styles.centeredState}>
      <ActivityIndicator color={colors.primary} size="large" />
      <Text style={styles.stateText}>Loading gathering...</Text>
    </View>
  );
}

function GatheringDetailError({ onRetry }: { onRetry: () => void }) {
  return (
    <View style={styles.centeredState}>
      <Ionicons color={colors.muted} name="calendar-outline" size={36} />
      <Text accessibilityRole="header" style={styles.stateTitle}>Gathering unavailable</Text>
      <Text style={styles.stateText}>It may be private, removed, or the API may need to be restarted.</Text>
      <Button onPress={onRetry} variant="secondary">Try again</Button>
    </View>
  );
}

function useGatheringDetail(gatheringId: string, userId: string) {
  return useQuery({
    enabled: Boolean(gatheringId && userId),
    queryKey: ['gatherings', 'detail', gatheringId, userId],
    queryFn: () => apiData<Gathering>(getApiGatheringsByGatheringId({
      headers: authHeaders(userId),
      path: { gathering_id: gatheringId },
    })),
  });
}

function useGatheringBackNavigation() {
  const router = useRouter();
  return useCallback(() => router.back(), [router]);
}

function useGatheringRetry(refetch: () => Promise<QueryObserverResult<Gathering, Error>>) {
  return useCallback(() => {
    void refetch();
  }, [refetch]);
}

function accessLabel(gathering: Gathering) {
  const visibility = gathering.visibility === 'private' ? 'Private' : 'Public';
  const policy = gathering.join_policy === 'invite_only'
    ? 'invite only'
    : gathering.join_policy === 'approval_required'
      ? 'approval required'
      : gathering.join_policy === 'members_only'
        ? 'members only'
        : 'open RSVP';
  return `${visibility} · ${policy}`;
}

function formatCost(cents: number, currency: string) {
  if (cents <= 0) return 'Free';
  try {
    return new Intl.NumberFormat(undefined, {
      currency: currency || 'USD',
      maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
      style: 'currency',
    }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency || 'USD'}`;
  }
}

function singleParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

const styles = StyleSheet.create({
  screen: { backgroundColor: '#F4F8FF', flex: 1 },
  header: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    minHeight: 60,
    paddingHorizontal: 10,
  },
  headerButton: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 },
  headerTitle: { color: colors.ink, flex: 1, fontFamily: fonts.black, fontSize: 18, fontWeight: '900', textAlign: 'center' },
  content: { gap: 18, padding: 18, paddingBottom: 40 },
  section: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: 20,
    borderWidth: 1,
    gap: 12,
    padding: 16,
  },
  sectionHeading: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  sectionTitle: { color: colors.ink, fontFamily: fonts.black, fontSize: 18, fontWeight: '900' },
  description: { color: colors.ink, fontFamily: fonts.regular, fontSize: 15, lineHeight: 23 },
  detailRow: { alignItems: 'center', flexDirection: 'row', gap: 9, minHeight: 34 },
  detailLabel: { color: colors.muted, flex: 1, fontFamily: fonts.bold, fontSize: 13, fontWeight: '700' },
  detailValue: { color: colors.ink, fontFamily: fonts.black, fontSize: 13, fontWeight: '900', textAlign: 'right' },
  rsvpNotice: {
    alignItems: 'center',
    backgroundColor: '#E8F6C8',
    borderColor: '#C8E777',
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    padding: 15,
  },
  rsvpCopy: { flex: 1, gap: 3 },
  rsvpTitle: { color: colors.primaryDark, fontFamily: fonts.black, fontSize: 14, fontWeight: '900' },
  rsvpBody: { color: colors.muted, fontFamily: fonts.medium, fontSize: 11, lineHeight: 16 },
  centeredState: { alignItems: 'center', flex: 1, gap: 12, justifyContent: 'center', padding: 30 },
  stateTitle: { color: colors.ink, fontFamily: fonts.black, fontSize: 21, fontWeight: '900', textAlign: 'center' },
  stateText: { color: colors.muted, fontFamily: fonts.medium, fontSize: 14, lineHeight: 20, textAlign: 'center' },
});
