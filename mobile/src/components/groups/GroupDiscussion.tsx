import { Ionicons } from '@expo/vector-icons';
import { randomUUID } from 'expo-crypto';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter, type Href } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';

import {
  getApiGroupsByGroupIdMe,
  getApiGroupsByGroupIdMessages,
  postApiGroupsByGroupIdMessages,
  putApiGroupsByGroupIdMessagesByMessageIdReaction,
  type GroupMessage,
  type GroupMessagePage,
  type GroupMessageReaction,
  type GroupViewerState,
} from '../../api/generated';
import { apiData } from '../../api/runtime';
import { errorMessage } from '../../common/errors';
import { profileImageUrl } from '../../features/profile/profileImage';
import { formatDate } from '../../lib/dates';
import { Button, TextField, colors, fonts } from '../ui';

const reactions = ['👍', '❤️', '🔥', '👏', '😂'] as const;
const pageSize = 30;

export function GroupDiscussion({ groupId, userId }: { groupId: string; userId: string }) {
  const viewer = useQuery({
    enabled: Boolean(groupId && userId),
    queryKey: ['groups', 'viewer', groupId, userId],
    queryFn: () => apiData<GroupViewerState>(getApiGroupsByGroupIdMe({ path: { group_id: groupId } })),
  });
  const isMember = viewer.data?.membership_status === 'member';
  return (
    <View style={styles.section}>
      <View style={styles.heading}>
        <View style={styles.headingIcon}><Ionicons color={colors.primaryStrong} name="chatbubbles-outline" size={22} /></View>
        <View style={styles.headingCopy}><Text style={styles.title}>Club discussion</Text><Text style={styles.subtitle}>Share updates, plans, and post-game energy.</Text></View>
      </View>
      {isMember ? <MemberDiscussion groupId={groupId} userId={userId} /> : (
        <View style={styles.joinPrompt}><Text style={styles.joinTitle}>Join the group to participate</Text><Text style={styles.subtitle}>Member conversations stay inside the club.</Text></View>
      )}
    </View>
  );
}

function MemberDiscussion({ groupId, userId }: { groupId: string; userId: string }) {
  const discussion = useDiscussion(groupId);
  return <>
    {discussion.hasOlder && <Button loading={discussion.isLoadingOlder} onPress={discussion.loadOlder} size="compact" variant="quiet">Load earlier posts</Button>}
    {discussion.messages.length === 0 && !discussion.isLoading ? <View style={styles.empty}><Text style={styles.emptyTitle}>Start the conversation</Text><Text style={styles.subtitle}>Ask who’s playing, celebrate a match, or share a club update.</Text></View> : null}
    <View style={styles.messages}>{discussion.messages.map((message) => <DiscussionPost groupId={groupId} key={message.id} message={message} userId={userId} />)}</View>
    {discussion.error ? <Text style={styles.error}>{discussion.error}</Text> : null}
    <DiscussionComposer isSending={discussion.isSending} onChangeText={discussion.setDraft} onSend={discussion.send} value={discussion.draft} />
  </>;
}

function DiscussionPost({ groupId, message, userId }: { groupId: string; message: GroupMessage; userId: string }) {
  const avatar = profileImageUrl(message.avatar_url);
  const actions = useMessageActions(groupId, message);
  return <View style={styles.post}>
    <View style={styles.postHeader}>
      {avatar ? <Image source={{ uri: avatar }} style={styles.avatarImage} /> : <View style={styles.avatar}><Text style={styles.avatarText}>{initials(message.display_name)}</Text></View>}
      <View style={styles.authorCopy}><Text style={styles.author}>{message.display_name}</Text><Text style={styles.time}>{formatDate(message.created_at)}</Text></View>
      {message.user_id !== userId && <Pressable accessibilityLabel="Message options" hitSlop={10} onPress={actions.openMenu} style={styles.more}><Ionicons color={colors.textMuted} name="ellipsis-horizontal" size={20} /></Pressable>}
    </View>
    <Text style={styles.body}>{message.body}</Text>
    <View style={styles.reactions}>{reactions.map((emoji) => <ReactionButton emoji={emoji} groupId={groupId} key={emoji} message={message} />)}</View>
  </View>;
}

function ReactionButton({ emoji, groupId, message }: { emoji: typeof reactions[number]; groupId: string; message: GroupMessage }) {
  const summary = message.reactions.find((reaction) => reaction.emoji === emoji);
  const reaction = useReaction(groupId, message, emoji, summary);
  return <Pressable accessibilityLabel={`${summary?.reacted_by_viewer ? 'Remove' : 'Add'} ${emoji} reaction`} onPress={reaction.toggle} style={[styles.reaction, summary?.reacted_by_viewer && styles.reactionActive]}><Text style={styles.emoji}>{emoji}</Text>{summary && summary.count > 0 ? <Text style={[styles.reactionCount, summary.reacted_by_viewer && styles.reactionCountActive]}>{summary.count}</Text> : null}</Pressable>;
}

function DiscussionComposer({ isSending, onChangeText, onSend, value }: { isSending: boolean; onChangeText: (value: string) => void; onSend: () => void; value: string }) {
  return <View style={styles.composer}><TextField maxLength={2000} multiline onChangeText={onChangeText} placeholder="Post to the club…" style={styles.input} value={value} variant="compact" /><Pressable accessibilityLabel="Post message" accessibilityRole="button" disabled={isSending || !value.trim()} onPress={onSend} style={[styles.send, (!value.trim() || isSending) && styles.sendDisabled]}><Ionicons color={colors.textOnPrimary} name="arrow-up" size={21} /></Pressable></View>;
}

function useDiscussion(groupId: string) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState('');
  const query = useInfiniteQuery({
    queryKey: ['groups', 'messages', groupId],
    queryFn: ({ pageParam }) => apiData<GroupMessagePage>(getApiGroupsByGroupIdMessages({ path: { group_id: groupId }, query: { cursor: pageParam, limit: pageSize } })),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.next_cursor ?? undefined,
    refetchInterval: 10_000,
  });
  const mutation = useMutation({
    mutationFn: (request: { body: string; clientMessageId: string }) => apiData<GroupMessage>(postApiGroupsByGroupIdMessages({ body: { body: request.body, client_message_id: request.clientMessageId }, path: { group_id: groupId } })),
    onError: (error) => Alert.alert('Could not post', errorMessage(error)),
    onSuccess: async () => { setDraft(''); await queryClient.invalidateQueries({ queryKey: ['groups', 'messages', groupId] }); },
    retry: 1,
  });
  const messages = useMemo(() => {
    const unique = new Map((query.data?.pages.flatMap((page) => page.items) ?? []).map((message) => [message.id, message]));
    return [...unique.values()].sort((a, b) => a.created_at.localeCompare(b.created_at));
  }, [query.data]);
  const send = useCallback(() => { const body = draft.trim(); if (body) mutation.mutate({ body, clientMessageId: randomUUID() }); }, [draft, mutation]);
  const loadOlder = useCallback(() => { void query.fetchNextPage(); }, [query]);
  return { draft, error: query.isError ? errorMessage(query.error) : null, hasOlder: query.hasNextPage, isLoading: query.isPending, isLoadingOlder: query.isFetchingNextPage, isSending: mutation.isPending, loadOlder, messages, send, setDraft };
}

function useReaction(groupId: string, message: GroupMessage, emoji: string, summary?: GroupMessageReaction) {
  const queryClient = useQueryClient();
  const mutation = useMutation({ mutationFn: () => apiData<GroupMessage>(putApiGroupsByGroupIdMessagesByMessageIdReaction({ body: { active: !summary?.reacted_by_viewer, emoji }, path: { group_id: groupId, message_id: message.id } })), onError: (error) => Alert.alert('Could not react', errorMessage(error)), onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['groups', 'messages', groupId] }); } });
  const toggle = useCallback(() => mutation.mutate(), [mutation]);
  return { toggle };
}

function useMessageActions(groupId: string, message: GroupMessage) {
  const router = useRouter();
  const report = useCallback(() => router.push(`/report?targetId=${encodeURIComponent(message.id)}&targetType=group_message&label=${encodeURIComponent(`${message.display_name}'s group post`)}` as Href), [message.display_name, message.id, router]);
  const openMenu = useCallback(() => Alert.alert('Group post', undefined, [{ text: 'Report post', onPress: report }, { text: 'Cancel', style: 'cancel' }]), [report]);
  return { openMenu };
}

function initials(name: string) { return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join(''); }

const styles = StyleSheet.create({
  section: { backgroundColor: colors.surface, borderTopColor: colors.border, borderTopWidth: 8, gap: 18, paddingHorizontal: 20, paddingVertical: 24 },
  heading: { alignItems: 'center', flexDirection: 'row', gap: 12 }, headingIcon: { alignItems: 'center', backgroundColor: colors.primarySurface, borderRadius: 16, height: 48, justifyContent: 'center', width: 48 }, headingCopy: { flex: 1, gap: 2 },
  title: { color: colors.text, fontFamily: fonts.black, fontSize: 20, fontWeight: '900' }, subtitle: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 13, lineHeight: 19 },
  joinPrompt: { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth, gap: 4, paddingVertical: 18 }, joinTitle: { color: colors.text, fontFamily: fonts.bold, fontSize: 15, fontWeight: '700' },
  messages: { gap: 0 }, post: { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth, gap: 11, paddingVertical: 18 }, postHeader: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  avatar: { alignItems: 'center', backgroundColor: colors.primary, borderRadius: 18, height: 36, justifyContent: 'center', width: 36 }, avatarImage: { borderRadius: 18, height: 36, width: 36 }, avatarText: { color: colors.textOnPrimary, fontFamily: fonts.black, fontSize: 11, fontWeight: '900' },
  authorCopy: { flex: 1, gap: 1 }, author: { color: colors.text, fontFamily: fonts.black, fontSize: 14, fontWeight: '900' }, time: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 10 }, more: { alignItems: 'center', height: 34, justifyContent: 'center', width: 34 },
  body: { color: colors.text, fontFamily: fonts.regular, fontSize: 16, lineHeight: 23 }, reactions: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 }, reaction: { alignItems: 'center', backgroundColor: colors.surfaceMuted, borderColor: colors.border, borderRadius: 99, borderWidth: 1, flexDirection: 'row', gap: 4, minHeight: 34, paddingHorizontal: 9 }, reactionActive: { backgroundColor: colors.primarySurface, borderColor: colors.primary }, emoji: { fontSize: 15 }, reactionCount: { color: colors.textMuted, fontFamily: fonts.bold, fontSize: 11, fontWeight: '700' }, reactionCountActive: { color: colors.primaryStrong },
  composer: { alignItems: 'flex-end', borderTopColor: colors.border, borderTopWidth: 1, flexDirection: 'row', gap: 10, paddingTop: 16 }, input: { flex: 1, maxHeight: 110, minHeight: 46, paddingTop: 12 }, send: { alignItems: 'center', backgroundColor: colors.primary, borderRadius: 23, height: 46, justifyContent: 'center', width: 46 }, sendDisabled: { opacity: 0.4 },
  empty: { gap: 4, paddingVertical: 20 }, emptyTitle: { color: colors.text, fontFamily: fonts.bold, fontSize: 15, fontWeight: '700' }, error: { color: colors.danger, fontFamily: fonts.regular, fontSize: 12 },
});
