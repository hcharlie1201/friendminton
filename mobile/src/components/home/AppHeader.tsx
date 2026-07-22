import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts, SearchBar } from '../ui';
import type { Tab } from './types';

type Props = {
  activeTab: Tab;
  notificationCount: number;
  onClearSearch: () => void;
  onCloseSearch: () => void;
  onOpenNotifications: () => void;
  onOpenSearch: () => void;
  onOpenSettings: () => void;
  onSearchChange: (value: string) => void;
  searchOpen: boolean;
  searchIsLoading: boolean;
  searchValue: string;
};

export function AppHeader({
  activeTab,
  notificationCount,
  onClearSearch,
  onCloseSearch,
  onOpenNotifications,
  onOpenSearch,
  onOpenSettings,
  onSearchChange,
  searchOpen,
  searchIsLoading,
  searchValue,
}: Props) {
  if (searchOpen) {
    return (
      <View style={styles.header}>
        <SearchBar
          autoFocus
          isLoading={searchIsLoading}
          onChangeText={onSearchChange}
          onClear={onClearSearch}
          onClose={onCloseSearch}
          value={searchValue}
        />
      </View>
    );
  }

  return (
    <View style={styles.header}>
      <View style={styles.leftActions}>
        <Pressable accessibilityRole="button" onPress={onOpenSettings} style={styles.avatar}>
          <Text style={styles.avatarText}>F</Text>
        </Pressable>
        <Pressable accessibilityLabel="Search players" accessibilityRole="button" hitSlop={8} onPress={onOpenSearch}>
          <Ionicons color={colors.text} name="search" size={32} />
        </Pressable>
      </View>

      <Text style={styles.title}>{titleForTab(activeTab)}</Text>

      <View style={styles.rightActions}>
        <Ionicons color={colors.text} name="chatbubbles-outline" size={31} />
        <Pressable accessibilityRole="button" onPress={onOpenNotifications}>
          <Ionicons color={colors.text} name="notifications" size={33} />
          {notificationCount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{notificationCount}</Text>
            </View>
          )}
        </Pressable>
      </View>
    </View>
  );
}

function titleForTab(tab: Tab) {
  if (tab === 'discover') return 'Discover';
  if (tab === 'groups') return 'Groups';
  if (tab === 'you') return 'You';
  return 'Home';
}

const styles = StyleSheet.create({
  header: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 76,
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  leftActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 18,
    minWidth: 108,
  },
  rightActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 18,
    justifyContent: 'flex-end',
    minWidth: 108,
  },
  avatar: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: 21,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  avatarText: {
    color: colors.textOnPrimary,
    fontFamily: fonts.black,
    fontSize: 20,
    fontWeight: '900',
  },
  title: {
    color: colors.text,
    fontFamily: fonts.black,
    fontSize: 22,
    fontWeight: '900',
  },
  badge: {
    alignItems: 'center',
    backgroundColor: colors.danger,
    borderRadius: 13,
    height: 26,
    justifyContent: 'center',
    minWidth: 26,
    position: 'absolute',
    right: -10,
    top: -8,
  },
  badgeText: {
    color: colors.textInverse,
    fontFamily: fonts.black,
    fontSize: 13,
    fontWeight: '900',
  },
});
