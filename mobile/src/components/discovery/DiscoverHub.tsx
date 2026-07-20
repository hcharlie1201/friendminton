import type { Gathering } from '../../api/generated';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import type { DiscoverSection } from '../../features/gatherings/gameDiscovery';
import { HostGatheringBanner } from '../home/HostGatheringBanner';
import { DiscoverCarousels } from './DiscoverCarousels';
import { DiscoverSectionPicker } from './DiscoverSectionPicker';
import { FindGames } from './FindGames';

type Props = {
  city: string;
  gatherings: readonly Gathering[];
  latitude: number | null;
  longitude: number | null;
  onCreateGathering: () => void;
  onOpenGathering: (gatheringId: string) => void;
};

export function DiscoverHub({
  city,
  gatherings,
  latitude,
  longitude,
  onCreateGathering,
  onOpenGathering,
}: Props) {
  const navigation = useDiscoverSection();
  return (
    <View style={styles.container}>
      <DiscoverSectionPicker onChange={navigation.change} value={navigation.value} />
      {navigation.value === 'explore' ? (
        <View style={styles.section}>
          <HostGatheringBanner onCreate={onCreateGathering} />
          <DiscoverCarousels gatherings={gatherings} onOpenGathering={onOpenGathering} />
        </View>
      ) : (
        <FindGames
          city={city}
          gatherings={gatherings}
          latitude={latitude}
          longitude={longitude}
          onCreateGathering={onCreateGathering}
          onOpenGathering={onOpenGathering}
        />
      )}
    </View>
  );
}

function useDiscoverSection() {
  const [value, setValue] = useState<DiscoverSection>('explore');
  const change = useCallback((section: DiscoverSection) => setValue(section), []);
  return { change, value };
}

const styles = StyleSheet.create({
  container: { gap: 18 },
  section: { gap: 22 },
});
