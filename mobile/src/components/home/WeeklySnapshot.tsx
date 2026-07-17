import { StyleSheet, Text, View } from 'react-native';

import { colors } from '../ui';

type Props = {
  activities: number;
  games: number;
  minutes: number;
};

export function WeeklySnapshot({ activities, games, minutes }: Props) {
  return (
    <View style={styles.wrapper}>
      <View style={styles.header}>
        <Text style={styles.title}>Your Weekly Snapshot</Text>
        <Text style={styles.more}>See More</Text>
      </View>

      <View style={styles.metrics}>
        <Metric delta="▼ 1" label="Activities" value={String(activities)} />
        <Metric delta="▼ 18m" label="Time" value={formatMinutes(minutes)} />
        <Metric delta="▲ 2" label="Games" value={String(games)} />
      </View>

      <View style={styles.dots}>
        <View style={styles.dot} />
        <View style={[styles.dot, styles.activeDot]} />
      </View>
    </View>
  );
}

function Metric({ delta, label, value }: { delta: string; label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.delta}>{delta}</Text>
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
    backgroundColor: colors.card,
    borderBottomColor: colors.border,
    borderBottomWidth: 8,
    gap: 26,
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
    color: colors.ink,
    fontSize: 19,
    fontWeight: '900',
  },
  more: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: '900',
  },
  metrics: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  metric: {
    minWidth: 86,
  },
  metricLabel: {
    color: '#555555',
    fontSize: 16,
    fontWeight: '500',
  },
  metricValue: {
    color: '#050505',
    fontSize: 25,
    fontWeight: '900',
    marginTop: 6,
  },
  delta: {
    alignSelf: 'flex-start',
    backgroundColor: '#F1F2F2',
    borderRadius: 4,
    color: '#666666',
    fontSize: 14,
    fontWeight: '700',
    marginTop: 10,
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  dots: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'center',
  },
  dot: {
    backgroundColor: '#D8D8D8',
    borderRadius: 5,
    height: 10,
    width: 10,
  },
  activeDot: {
    backgroundColor: '#4C4C4C',
  },
});
