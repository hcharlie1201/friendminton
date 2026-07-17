import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors } from '../ui';
import type { Tab } from './types';

type Props = {
  activeTab: Tab;
  notificationCount?: number;
  onOpenSettings: () => void;
};

export function AppHeader({ activeTab, notificationCount = 7, onOpenSettings }: Props) {
  return (
    <View style={styles.header}>
      <View style={styles.leftActions}>
        <Pressable accessibilityRole="button" onPress={onOpenSettings} style={styles.avatar}>
          <Text style={styles.avatarText}>F</Text>
        </Pressable>
        <Ionicons color="#050505" name="search" size={34} />
      </View>

      <Text style={styles.title}>{titleForTab(activeTab)}</Text>

      <View style={styles.rightActions}>
        <Ionicons color="#050505" name="chatbubbles-outline" size={31} />
        <View>
          <Ionicons color="#050505" name="notifications" size={33} />
          {notificationCount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{notificationCount}</Text>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

function titleForTab(tab: Tab) {
  if (tab === 'discover') return 'Discover';
  if (tab === 'record') return 'Record';
  if (tab === 'groups') return 'Groups';
  if (tab === 'you') return 'You';
  return 'Home';
}

const styles = StyleSheet.create({
  header: {
    alignItems: 'center',
    backgroundColor: colors.card,
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
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '900',
  },
  title: {
    color: colors.ink,
    fontSize: 22,
    fontWeight: '900',
  },
  badge: {
    alignItems: 'center',
    backgroundColor: '#EF3340',
    borderRadius: 13,
    height: 26,
    justifyContent: 'center',
    minWidth: 26,
    position: 'absolute',
    right: -10,
    top: -8,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
  },
});
