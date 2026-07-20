import { Children, type ReactNode, useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { colors, fonts } from '../ui';

type Props = {
  children: ReactNode;
  emptyText: string;
  previewCount?: number;
  title: string;
};

const DEFAULT_PREVIEW_COUNT = 3;
const CARD_SNAP_INTERVAL = 298;

export function DiscoveryCarousel({
  children,
  emptyText,
  previewCount = DEFAULT_PREVIEW_COUNT,
  title,
}: Props) {
  const items = useMemo(() => Children.toArray(children), [children]);
  const expansion = useCarouselExpansion(items.length, previewCount);
  const visibleItems = items.slice(0, expansion.visibleCount);

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Text accessibilityRole="header" style={styles.title}>{title}</Text>
          <View style={styles.countBadge}>
            <Text style={styles.countText}>{items.length}</Text>
          </View>
        </View>
        {expansion.canExpand && (
          <Pressable
            accessibilityLabel={`${expansion.isExpanded ? 'Show fewer' : 'See all'} ${title.toLocaleLowerCase()}`}
            accessibilityRole="button"
            hitSlop={8}
            onPress={expansion.toggle}
            style={seeAllPressableStyle}
          >
            <Text style={styles.seeAllText}>{expansion.isExpanded ? 'Show less' : 'See all'}</Text>
          </Pressable>
        )}
      </View>

      {visibleItems.length > 0 ? (
        <ScrollView
          contentContainerStyle={styles.content}
          decelerationRate="fast"
          horizontal
          nestedScrollEnabled
          showsHorizontalScrollIndicator={false}
          snapToAlignment="start"
          snapToInterval={CARD_SNAP_INTERVAL}
        >
          {visibleItems}
        </ScrollView>
      ) : (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>{emptyText}</Text>
        </View>
      )}
    </View>
  );
}

function useCarouselExpansion(total: number, previewCount: number) {
  const [isExpanded, setIsExpanded] = useState(false);
  const safePreviewCount = Math.max(1, Math.floor(previewCount));
  const toggle = useCallback(() => {
    setIsExpanded((current) => !current);
  }, []);

  return {
    canExpand: total > safePreviewCount,
    isExpanded,
    toggle,
    visibleCount: isExpanded ? total : safePreviewCount,
  };
}

function seeAllPressableStyle({ pressed }: { pressed: boolean }) {
  return [styles.seeAll, pressed && styles.seeAllPressed];
}

const styles = StyleSheet.create({
  section: { gap: 12 },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  titleRow: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: 8 },
  title: {
    color: colors.ink,
    fontFamily: fonts.black,
    fontSize: 20,
    fontWeight: '900',
  },
  countBadge: {
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderRadius: 99,
    justifyContent: 'center',
    minWidth: 25,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  countText: {
    color: colors.primaryDark,
    fontFamily: fonts.black,
    fontSize: 11,
    fontWeight: '900',
  },
  seeAll: { borderRadius: 99, paddingHorizontal: 4, paddingVertical: 6 },
  seeAllPressed: { opacity: 0.55 },
  seeAllText: {
    color: colors.primary,
    fontFamily: fonts.black,
    fontSize: 13,
    fontWeight: '900',
  },
  content: { gap: 12, paddingRight: 20 },
  emptyCard: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: 18,
    borderStyle: 'dashed',
    borderWidth: 1,
    minHeight: 88,
    padding: 18,
    width: '100%',
  },
  emptyText: {
    color: colors.muted,
    fontFamily: fonts.bold,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
});
