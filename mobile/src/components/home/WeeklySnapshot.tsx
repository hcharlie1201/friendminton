import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { colors, textSizes, textWeights } from '../ui';

type Props = {
  activities: number;
  activeDays: number;
  activeWeeks: number;
  consistency: number;
  currentStreak: number;
  games: number;
  goal: number;
  goalProgress: number;
  longestStreak: number;
  minutes: number;
};

export function WeeklySnapshot({
  activities,
  activeDays,
  activeWeeks,
  consistency,
  currentStreak,
  games,
  goal,
  goalProgress,
  longestStreak,
  minutes,
}: Props) {
  const goalPercent = Math.min(100, Math.round((goalProgress / Math.max(goal, 1)) * 100));
  return (
    <View style={styles.wrapper}>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>YOUR CONSISTENCY</Text>
          <Text style={styles.title}>Weekly snapshot</Text>
        </View>
        <View style={styles.streakBadge}>
          <MaterialCommunityIcons color={colors.energyAccentStrong} name="fire" size={22} />
          <Text style={styles.streakValue}>{currentStreak}</Text>
          <Text style={styles.streakUnit}>{currentStreak === 1 ? 'week' : 'weeks'}</Text>
        </View>
      </View>

      <View style={styles.metrics}>
        <Metric label="Activities" value={String(activities)} />
        <Metric label="Time" value={formatMinutes(minutes)} />
        <Metric label="Games" value={String(games)} />
      </View>

      <View style={styles.goalCard}>
        <View style={styles.goalHeader}>
          <Text style={styles.goalTitle}>Weekly goal</Text>
          <Text style={styles.goalCount}>{goalProgress}/{goal} activities</Text>
        </View>
        <View style={styles.goalTrack}>
          <View style={[styles.goalFill, { width: `${goalPercent}%` }]} />
        </View>
        <Text style={styles.goalBody}>{goalMessage(goalProgress, goal, currentStreak)}</Text>
      </View>

      <View style={styles.consistencyRow}>
        <View style={styles.consistencyScore}>
          <Text style={styles.consistencyValue}>{consistency}%</Text>
          <Text style={styles.consistencyLabel}>8-week consistency</Text>
        </View>
        <View style={styles.consistencyCopy}>
          <Text style={styles.consistencyTitle}>{consistencyLabel(consistency)}</Text>
          <Text style={styles.consistencyBody}>
            Active {activeWeeks} of 8 weeks · {activeDays} active days this month · best streak {longestStreak} weeks
          </Text>
        </View>
      </View>
    </View>
  );
}

function goalMessage(progress: number, goal: number, streak: number) {
  if (progress >= goal) return `Goal complete. Your ${streak}-week streak is safe.`;
  if (streak > 0) return `Record one activity this week to protect your ${streak}-week streak.`;
  return 'Record an activity this week to start your streak.';
}

function consistencyLabel(percent: number) {
  if (percent >= 88) return 'Unstoppable rhythm';
  if (percent >= 63) return 'Strong routine';
  if (percent >= 38) return 'Building momentum';
  if (percent > 0) return 'Streak started';
  return 'Ready for your first week';
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

function formatMinutes(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return hours > 0 ? `${hours}h ${remainder}m` : `${remainder}m`;
}

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: colors.surface,
    borderBottomColor: colors.border,
    borderBottomWidth: 8,
    gap: 20,
    marginHorizontal: -20,
    marginTop: -16,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 18,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  title: {
    ...textSizes.large,
    ...textWeights.heavy,
    color: colors.text,
  },
  eyebrow: { ...textSizes.caption, ...textWeights.heavy, color: colors.primaryStrong, letterSpacing: 0.8 },
  streakBadge: { alignItems: 'center', backgroundColor: colors.energyAccentSurface, borderRadius: 16, flexDirection: 'row', gap: 4, paddingHorizontal: 12, paddingVertical: 9 },
  streakValue: { ...textSizes.large, ...textWeights.heavy, color: colors.energyAccentStrong },
  streakUnit: { ...textSizes.caption, ...textWeights.strong, color: colors.energyAccentStrong },
  metrics: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  metric: {
    minWidth: 86,
  },
  metricLabel: {
    ...textSizes.small,
    ...textWeights.medium,
    color: colors.textMuted,
  },
  metricValue: {
    ...textSizes.xLarge,
    ...textWeights.heavy,
    color: colors.text,
    marginTop: 6,
  },
  goalCard: { backgroundColor: colors.primarySurface, borderRadius: 16, gap: 9, padding: 14 },
  goalHeader: { flexDirection: 'row', justifyContent: 'space-between' },
  goalTitle: { ...textSizes.small, ...textWeights.strong, color: colors.text },
  goalCount: { ...textSizes.xSmall, ...textWeights.strong, color: colors.primaryStrong },
  goalTrack: { backgroundColor: colors.border, borderRadius: 6, height: 10, overflow: 'hidden' },
  goalFill: { backgroundColor: colors.primary, borderRadius: 6, height: '100%' },
  goalBody: { ...textSizes.xSmall, ...textWeights.regular, color: colors.textMuted },
  consistencyRow: { alignItems: 'center', flexDirection: 'row', gap: 14 },
  consistencyScore: { alignItems: 'center', backgroundColor: colors.playAccentSurface, borderRadius: 18, minWidth: 90, padding: 12 },
  consistencyValue: { ...textSizes.xLarge, ...textWeights.heavy, color: colors.playAccentStrong },
  consistencyLabel: { ...textSizes.caption, ...textWeights.medium, color: colors.textMuted, textAlign: 'center' },
  consistencyCopy: { flex: 1, gap: 3 },
  consistencyTitle: { ...textSizes.small, ...textWeights.heavy, color: colors.text },
  consistencyBody: { ...textSizes.xSmall, ...textWeights.regular, color: colors.textMuted },
});
