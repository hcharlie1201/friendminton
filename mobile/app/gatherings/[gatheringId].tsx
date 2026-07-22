import { useLocalSearchParams } from 'expo-router';

import { FinishGatheringActivityScreen } from '../../src/screens/FinishGatheringActivityScreen';
import { GatheringDetailScreen } from '../../src/screens/GatheringDetailScreen';

export default function GatheringRoute() {
  const params = useLocalSearchParams<{ workoutId?: string | string[] }>();
  return params.workoutId ? <FinishGatheringActivityScreen /> : <GatheringDetailScreen />;
}
