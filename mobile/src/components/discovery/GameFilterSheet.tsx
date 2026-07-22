import { Ionicons } from '@expo/vector-icons';
import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { CourtSetup, GatheringSkillLevel, PlayFormat } from '../../api/generated';
import {
  defaultGameDiscoveryFilters,
  gameDateOptions,
  type GameCostFilter,
  type GameDateFilter,
  type GameDiscoveryFilters,
} from '../../features/gatherings/gameDiscovery';
import { GatheringChoiceGroup, type GatheringChoiceOption } from '../gatherings';
import { Button, colors, fonts } from '../ui';

type Props = {
  filters: GameDiscoveryFilters;
  onApply: (filters: GameDiscoveryFilters) => void;
  onClose: () => void;
  resultCount: number;
  visible: boolean;
};

const dateOptions: GatheringChoiceOption<GameDateFilter>[] = [
  { label: 'Any date', value: 'any' },
  ...gameDateOptions(),
];

const formatOptions: GatheringChoiceOption<PlayFormat | 'all'>[] = [
  { label: 'All formats', value: 'all' },
  { label: 'Open play', value: 'open_play' },
  { label: 'Round robin', value: 'round_robin' },
  { label: 'Doubles', value: 'doubles' },
  { label: 'Singles', value: 'singles' },
  { label: 'Drills', value: 'drills' },
  { label: 'Coaching', value: 'coaching' },
];

const levelOptions: GatheringChoiceOption<GatheringSkillLevel | 'all'>[] = [
  { label: 'All levels', value: 'all' },
  { label: 'Beginner', value: 'beginner' },
  { label: 'E', value: 'e' },
  { label: 'E+', value: 'e_plus' },
  { label: 'D', value: 'd' },
  { label: 'C', value: 'c' },
  { label: 'B', value: 'b' },
  { label: 'A', value: 'a' },
];

const courtOptions: GatheringChoiceOption<CourtSetup | 'all'>[] = [
  { label: 'Any setup', value: 'all' },
  { label: 'Drop-in', value: 'drop_in' },
  { label: 'Reserved', value: 'reserved' },
];

const costOptions: GatheringChoiceOption<GameCostFilter>[] = [
  { label: 'Any cost', value: 'any' },
  { label: 'Free', value: 'free' },
  { label: 'Paid', value: 'paid' },
];

export function GameFilterSheet({ filters, onApply, onClose, resultCount, visible }: Props) {
  const insets = useSafeAreaInsets();
  const draft = useGameFilterDraft(filters, onApply, visible);

  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={visible}>
      <View accessibilityViewIsModal style={styles.overlay}>
        <Pressable accessibilityLabel="Close game filters" onPress={onClose} style={styles.backdrop} />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={styles.grabber} />
          <View style={styles.header}>
            <Pressable accessibilityLabel="Close game filters" hitSlop={8} onPress={onClose}>
              <Ionicons color={colors.text} name="close" size={27} />
            </Pressable>
            <Text accessibilityRole="header" style={styles.title}>Game filters</Text>
            <Pressable accessibilityLabel="Reset game filters" hitSlop={8} onPress={draft.reset}>
              <Text style={styles.reset}>Reset</Text>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            <FilterSection title="When">
              <GatheringChoiceGroup onChange={draft.setDate} options={dateOptions} value={draft.value.date} />
            </FilterSection>
            <FilterSection title="Format">
              <GatheringChoiceGroup onChange={draft.setFormat} options={formatOptions} value={draft.value.playFormat ?? 'all'} />
            </FilterSection>
            <FilterSection title="Playing level">
              <GatheringChoiceGroup onChange={draft.setLevel} options={levelOptions} value={draft.value.level ?? 'all'} />
            </FilterSection>
            <FilterSection title="Court setup">
              <GatheringChoiceGroup onChange={draft.setCourtSetup} options={courtOptions} value={draft.value.courtSetup ?? 'all'} />
            </FilterSection>
            <FilterSection title="Cost">
              <GatheringChoiceGroup onChange={draft.setCost} options={costOptions} value={draft.value.cost} />
            </FilterSection>
          </ScrollView>

          <Button icon="search" onPress={draft.apply}>Show {resultCount} games</Button>
        </View>
      </View>
    </Modal>
  );
}

function useGameFilterDraft(filters: GameDiscoveryFilters, onApply: Props['onApply'], visible: boolean) {
  const [value, setValue] = useState(filters);
  useEffect(() => {
    if (visible) setValue(filters);
  }, [filters, visible]);

  const setDate = useCallback((date: GameDateFilter) => setValue((current) => ({ ...current, date })), []);
  const setFormat = useCallback((playFormat: PlayFormat | 'all') => {
    setValue((current) => ({ ...current, playFormat: playFormat === 'all' ? null : playFormat }));
  }, []);
  const setLevel = useCallback((level: GatheringSkillLevel | 'all') => {
    setValue((current) => ({ ...current, level: level === 'all' ? null : level }));
  }, []);
  const setCourtSetup = useCallback((courtSetup: CourtSetup | 'all') => {
    setValue((current) => ({ ...current, courtSetup: courtSetup === 'all' ? null : courtSetup }));
  }, []);
  const setCost = useCallback((cost: GameCostFilter) => setValue((current) => ({ ...current, cost })), []);
  const reset = useCallback(() => setValue(defaultGameDiscoveryFilters), []);
  const apply = useCallback(() => onApply(value), [onApply, value]);
  return { apply, reset, setCost, setCourtSetup, setDate, setFormat, setLevel, value };
}

function FilterSection({ children, title }: { children: ReactNode; title: string }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { backgroundColor: colors.overlay, bottom: 0, left: 0, position: 'absolute', right: 0, top: 0 },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, gap: 16, maxHeight: '92%', paddingHorizontal: 20, paddingTop: 10 },
  grabber: { alignSelf: 'center', backgroundColor: colors.borderStrong, borderRadius: 2, height: 4, width: 38 },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  title: { color: colors.text, fontFamily: fonts.black, fontSize: 19, fontWeight: '900' },
  reset: { color: colors.primaryStrong, fontFamily: fonts.bold, fontSize: 14, fontWeight: '700' },
  content: { gap: 22, paddingBottom: 6 },
  section: { gap: 9 },
  sectionTitle: { color: colors.text, fontFamily: fonts.black, fontSize: 16, fontWeight: '900' },
});
