import { StyleSheet, View } from 'react-native';

import type { Gathering } from '../../api/generated';
import { GatheringDiscoveryCard } from '../gatherings';
import { DiscoveryCarousel } from './DiscoveryCarousel';

type Props = {
  gatherings: readonly Gathering[];
  onOpenGathering: (gatheringId: string) => void;
};

export function DiscoverCarousels({ gatherings, onOpenGathering }: Props) {
  const collections = gatheringCollections(gatherings);

  return (
    <View style={styles.rows}>
      <DiscoveryGatheringRow
        emptyText="No play sessions are scheduled nearby yet."
        gatherings={collections.play}
        onOpenGathering={onOpenGathering}
        title="Play this week"
      />
      <DiscoveryGatheringRow
        emptyText="No badminton socials are published nearby yet."
        gatherings={collections.socials}
        onOpenGathering={onOpenGathering}
        title="Badminton socials"
      />
      <DiscoveryGatheringRow
        emptyText="No public or private group sessions are published nearby yet."
        gatherings={collections.groups}
        onOpenGathering={onOpenGathering}
        title="Groups near you"
      />
      <DiscoveryGatheringRow
        emptyText="No singles, doubles, or competitive-level challenges are open nearby yet."
        gatherings={collections.challenges}
        onOpenGathering={onOpenGathering}
        title="Competitive challenges"
      />
    </View>
  );
}

function DiscoveryGatheringRow({
  emptyText,
  gatherings,
  onOpenGathering,
  title,
}: {
  emptyText: string;
  gatherings: Gathering[];
  onOpenGathering: (gatheringId: string) => void;
  title: string;
}) {
  return (
    <DiscoveryCarousel emptyText={emptyText} title={title}>
      {gatherings.map((gathering) => (
        <View key={gathering.id} style={styles.cardFrame}>
          <GatheringDiscoveryCard
            gathering={gathering}
            onOpenGathering={onOpenGathering}
          />
        </View>
      ))}
    </DiscoveryCarousel>
  );
}

function gatheringCollections(gatherings: readonly Gathering[]) {
  const sorted = [...gatherings].sort(compareGatheringStart);
  return {
    challenges: sorted.filter(isCompetitiveGathering),
    groups: sorted.filter(isGroupGathering),
    play: sorted.filter(isPlayGathering),
    socials: sorted.filter(isSocialGathering),
  };
}

function isPlayGathering(gathering: Gathering) {
  return gathering.join_policy !== 'members_only'
    && (gathering.kind === 'play' || gathering.kind === 'play_and_social');
}

function isSocialGathering(gathering: Gathering) {
  return gathering.join_policy !== 'members_only'
    && (gathering.kind === 'social' || gathering.kind === 'play_and_social');
}

function isGroupGathering(gathering: Gathering) {
  return gathering.join_policy === 'members_only';
}

function isCompetitiveGathering(gathering: Gathering) {
  return gathering.join_policy !== 'members_only'
    && (gathering.play_format === 'singles'
      || gathering.play_format === 'doubles'
      || gathering.skill_level === 'a'
      || gathering.skill_level === 'b');
}

function compareGatheringStart(first: Gathering, second: Gathering) {
  const firstTime = new Date(first.starts_at).getTime();
  const secondTime = new Date(second.starts_at).getTime();
  return safeTimestamp(firstTime) - safeTimestamp(secondTime);
}

function safeTimestamp(value: number) {
  return Number.isNaN(value) ? Number.MAX_SAFE_INTEGER : value;
}

const styles = StyleSheet.create({
  rows: { gap: 28 },
  cardFrame: { width: 286 },
});
