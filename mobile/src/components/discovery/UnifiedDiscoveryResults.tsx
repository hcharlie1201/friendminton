import { useCallback } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import type { DiscoveryCategory, DiscoveryResult } from '../../api/generated';
import { Button, Card, colors, textSizes, textWeights } from '../ui';
import { DiscoveryResultRow } from './DiscoveryResultRow';

type Props = {
  category: DiscoveryCategory;
  hasError: boolean;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  isLoading: boolean;
  items: readonly DiscoveryResult[];
  onCategoryChange: (category: DiscoveryCategory) => void;
  onLoadMore: () => void;
  onOpenGathering: (gatheringId: string) => void;
  onOpenGroup: (groupId: string) => void;
  onOpenPlayer: (playerId: string) => void;
  onRetry: () => void;
  query: string;
};

const categories: Array<{ label: string; value: DiscoveryCategory }> = [
  { label: 'All', value: 'all' },
  { label: 'Games', value: 'games' },
  { label: 'Courts', value: 'courts' },
  { label: 'Groups', value: 'groups' },
  { label: 'Players', value: 'players' },
];

export function UnifiedDiscoveryResults({
  category,
  hasError,
  hasNextPage,
  isFetchingNextPage,
  isLoading,
  items,
  onCategoryChange,
  onLoadMore,
  onOpenGathering,
  onOpenGroup,
  onOpenPlayer,
  onRetry,
  query,
}: Props) {
  if (!query) return null;

  return (
    <View style={styles.container}>
      <View style={styles.heading}>
        <Text accessibilityRole="header" style={styles.title}>Results for “{query}”</Text>
        {!isLoading && !hasError && <Text style={styles.count}>{items.length} found</Text>}
      </View>
      <View accessibilityRole="tablist" style={styles.tabs}>
        {categories.map((option) => (
          <CategoryTab
            key={option.value}
            onChange={onCategoryChange}
            option={option}
            selected={category === option.value}
          />
        ))}
      </View>
      <DiscoveryResultState
        hasError={hasError}
        isLoading={isLoading}
        itemCount={items.length}
        onRetry={onRetry}
      />
      {items.length > 0 && (
        <View style={styles.results}>
          {items.map((result) => (
            <DiscoveryResultRow
              key={`${result.category}-${result.item.id}`}
              onOpenGathering={onOpenGathering}
              onOpenGroup={onOpenGroup}
              onOpenPlayer={onOpenPlayer}
              result={result}
            />
          ))}
        </View>
      )}
      {hasNextPage && (
        <Button
          icon="chevron-down"
          loading={isFetchingNextPage}
          onPress={onLoadMore}
          size="compact"
          variant="secondary"
        >
          Load more
        </Button>
      )}
    </View>
  );
}

function CategoryTab({
  onChange,
  option,
  selected,
}: {
  onChange: Props['onCategoryChange'];
  option: (typeof categories)[number];
  selected: boolean;
}) {
  const select = useCategorySelection(onChange, option.value);
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      onPress={select}
      style={[styles.tab, selected && styles.tabSelected]}
    >
      <Text style={[styles.tabLabel, selected && styles.tabLabelSelected]}>{option.label}</Text>
    </Pressable>
  );
}

function DiscoveryResultState({
  hasError,
  isLoading,
  itemCount,
  onRetry,
}: {
  hasError: boolean;
  isLoading: boolean;
  itemCount: number;
  onRetry: () => void;
}) {
  if (isLoading && itemCount === 0) {
    return <Text accessibilityRole="progressbar" style={styles.status}>Searching games, courts, groups, and players…</Text>;
  }
  if (hasError && itemCount === 0) {
    return (
      <Card>
        <Text style={styles.stateTitle}>Search is unavailable</Text>
        <Text style={styles.status}>Check your connection and try again.</Text>
        <Button icon="refresh" onPress={onRetry} size="compact" variant="secondary">Try again</Button>
      </Card>
    );
  }
  if (itemCount === 0) {
    return (
      <Card>
        <Text style={styles.stateTitle}>No matches yet</Text>
        <Text style={styles.status}>Try another phrase, category, or discovery location.</Text>
      </Card>
    );
  }
  return null;
}

function useCategorySelection(onChange: Props['onCategoryChange'], category: DiscoveryCategory) {
  return useCallback(() => onChange(category), [category, onChange]);
}

const styles = StyleSheet.create({
  container: { gap: 14 },
  heading: { alignItems: 'baseline', flexDirection: 'row', justifyContent: 'space-between' },
  title: { ...textSizes.large, ...textWeights.heavy, color: colors.text, flex: 1 },
  count: { ...textSizes.xSmall, ...textWeights.strong, color: colors.textMuted },
  tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  tab: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 999, borderWidth: 1, paddingHorizontal: 13, paddingVertical: 8 },
  tabSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabLabel: { ...textSizes.xSmall, ...textWeights.strong, color: colors.textMuted },
  tabLabelSelected: { color: colors.textOnPrimary },
  results: { borderBottomColor: colors.border, borderBottomWidth: 1 },
  stateTitle: { ...textSizes.medium, ...textWeights.heavy, color: colors.text },
  status: { ...textSizes.small, ...textWeights.regular, color: colors.textMuted },
});
