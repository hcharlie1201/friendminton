import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type PressableStateCallbackType } from 'react-native';

import type { BadmintonGroup, Gathering } from '../../api/generated';
import { colors, fonts } from '../ui';
import { GroupEventsPanel } from './GroupEventsPanel';
import { GroupListSection } from './GroupListSection';

type GroupsSection = 'groups' | 'events';

type Props = {
  city: string;
  discoveredGroups: readonly BadmintonGroup[];
  gatherings: readonly Gathering[];
  joinedGroups: readonly BadmintonGroup[];
  onOpenGathering: (gatheringId: string) => void;
  onOpenGroup: (groupId: string) => void;
};

export function GroupsHub({
  city,
  discoveredGroups,
  gatherings,
  joinedGroups,
  onOpenGathering,
  onOpenGroup,
}: Props) {
  const [section, setSection] = useState<GroupsSection>('groups');
  const showGroups = useShowGroups(setSection);
  const showEvents = useShowEvents(setSection);
  const joinedIds = new Set(joinedGroups.map((group) => group.id));
  const newGroups = discoveredGroups.filter((group) => !joinedIds.has(group.id));
  const allGroups = [...joinedGroups, ...newGroups];

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[colors.playAccentSurface, colors.primarySurface, colors.socialAccentSurface]}
        end={{ x: 1, y: 1 }}
        start={{ x: 0, y: 0 }}
        style={styles.hero}
      >
        <Text style={styles.eyebrow}>YOUR BADMINTON COMMUNITY</Text>
        <Text accessibilityRole="header" style={styles.title}>Find your regular crew</Text>
        <Text style={styles.body}>Keep up with groups you joined and discover welcoming communities around {city}.</Text>
      </LinearGradient>

      <View style={styles.tabs}>
        <Pressable onPress={showGroups} style={tabStyle(section === 'groups')}>
          <Text style={tabTextStyle(section === 'groups')}>Groups</Text>
        </Pressable>
        <Pressable onPress={showEvents} style={tabStyle(section === 'events')}>
          <Text style={tabTextStyle(section === 'events')}>Events</Text>
        </Pressable>
      </View>

      {section === 'groups' ? (
        <>
          <GroupListSection
            emptyBody="Groups you join will stay together here for quick access."
            emptyTitle="No groups joined yet"
            groups={joinedGroups}
            onOpenGroup={onOpenGroup}
            subtitle="Your clubs, communities, and regular badminton crews."
            title="Your groups"
          />
          <GroupListSection
            emptyBody="Try refreshing or changing your discovery location from your profile settings."
            emptyTitle={`No new groups around ${city}`}
            groups={newGroups}
            onOpenGroup={onOpenGroup}
            subtitle={`Public badminton communities around ${city}.`}
            title="Discover groups"
          />
        </>
      ) : (
        <GroupEventsPanel gatherings={gatherings} groups={allGroups} onOpenGathering={onOpenGathering} />
      )}
    </View>
  );
}

function useShowGroups(setSection: (section: GroupsSection) => void) {
  return useCallback(() => setSection('groups'), [setSection]);
}

function useShowEvents(setSection: (section: GroupsSection) => void) {
  return useCallback(() => setSection('events'), [setSection]);
}

function tabStyle(isActive: boolean) {
  return ({ pressed }: PressableStateCallbackType) => [
    styles.tab,
    isActive && styles.activeTab,
    pressed && styles.pressedTab,
  ];
}

function tabTextStyle(isActive: boolean) {
  return [styles.tabText, isActive && styles.activeTabText];
}

const styles = StyleSheet.create({
  container: { backgroundColor: colors.background },
  hero: { gap: 9, paddingHorizontal: 20, paddingBottom: 26, paddingTop: 30 },
  eyebrow: { color: colors.playAccentStrong, fontFamily: fonts.black, fontSize: 10, fontWeight: '900', letterSpacing: 1.1 },
  title: { color: colors.text, fontFamily: fonts.black, fontSize: 29, fontWeight: '900', lineHeight: 35 },
  body: { color: colors.textMuted, fontFamily: fonts.medium, fontSize: 14, lineHeight: 21, maxWidth: 350 },
  tabs: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 15,
    flexDirection: 'row',
    gap: 4,
    marginHorizontal: 20,
    marginVertical: 16,
    padding: 4,
  },
  tab: { alignItems: 'center', borderRadius: 12, flex: 1, paddingHorizontal: 12, paddingVertical: 11 },
  activeTab: { backgroundColor: colors.surface },
  pressedTab: { opacity: 0.68 },
  tabText: { color: colors.textMuted, fontFamily: fonts.black, fontSize: 14, fontWeight: '900' },
  activeTabText: { color: colors.primaryStrong },
});
