import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts } from '../ui';
import { tabs, type Tab } from './types';

type Props = {
  activeTab: Tab;
  notificationCount: number;
  onTabChange: (tab: Tab) => void;
};

export function BottomTabBar({ activeTab, notificationCount, onTabChange }: Props) {
  return (
    <View style={styles.tabs}>
      {tabs.map((tab) => {
        const isActive = activeTab === tab.key;
        return (
          <Pressable
            accessibilityRole="button"
            key={tab.key}
            onPress={() => onTabChange(tab.key)}
            style={styles.tab}
          >
            <View>
              <TabIcon color={isActive ? colors.primary : '#050505'} tab={tab.key} />
              {tab.key === 'home' && notificationCount > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{notificationCount}</Text>
                </View>
              )}
            </View>
            <Text style={[styles.label, isActive && styles.activeText]}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function TabIcon({ color, tab }: { color: string; tab: Tab }) {
  if (tab === 'discover') return <Ionicons color={color} name="search" size={30} />;
  if (tab === 'record') return <Ionicons color={color} name="radio-button-on-outline" size={33} />;
  if (tab === 'groups') return <MaterialCommunityIcons color={color} name="cards-diamond-outline" size={33} />;
  if (tab === 'you') return <Ionicons color={color} name="stats-chart-outline" size={31} />;
  return <Ionicons color={color} name="home" size={30} />;
}

const styles = StyleSheet.create({
  tabs: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderTopColor: colors.border,
    borderTopWidth: 1,
    flexDirection: 'row',
    minHeight: 82,
    paddingBottom: 10,
    paddingHorizontal: 10,
    paddingTop: 8,
  },
  tab: {
    alignItems: 'center',
    flex: 1,
    gap: 3,
    justifyContent: 'center',
  },
  label: {
    color: '#050505',
    fontFamily: fonts.black,
    fontSize: 13,
    fontWeight: '900',
  },
  activeText: {
    color: colors.primary,
  },
  badge: {
    alignItems: 'center',
    backgroundColor: '#EF3340',
    borderRadius: 13,
    height: 26,
    justifyContent: 'center',
    minWidth: 26,
    position: 'absolute',
    right: -13,
    top: -8,
  },
  badgeText: {
    color: '#FFFFFF',
    fontFamily: fonts.black,
    fontSize: 13,
    fontWeight: '900',
  },
});
