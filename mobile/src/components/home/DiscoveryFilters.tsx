import { ScrollView, StyleSheet, View } from 'react-native';

import { PillButton } from '../PillButton';
import { skillLevels, type SkillLevel } from './types';

type Props = {
  onSkillLevelChange: (skillLevel: SkillLevel) => void;
  skillLevel: SkillLevel;
};

export function DiscoveryFilters({ onSkillLevelChange, skillLevel }: Props) {
  return (
    <View style={styles.filters}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.skillScroller}>
        <View style={styles.skillRow}>
          {skillLevels.map((level) => (
            <PillButton active={skillLevel === level} key={level} onPress={() => onSkillLevelChange(level)}>
              {level}
            </PillButton>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  filters: {
    gap: 12,
    paddingBottom: 14,
    paddingHorizontal: 20,
  },
  skillScroller: {
    marginHorizontal: -20,
    paddingHorizontal: 20,
  },
  skillRow: {
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 2,
    paddingRight: 20,
  },
});
