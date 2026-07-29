import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import {
  getApiGroupsByGroupIdMe,
  getApiGroupsByGroupIdMembers,
  postApiGroupsByGroupIdInvite,
  postApiGroupsByGroupIdJoin,
  postApiGroupsByGroupIdLeave,
  postApiGroupsByGroupIdMembersByUserIdApprove,
  postApiGroupsByGroupIdMembersByUserIdReject,
  postApiGroupsByGroupIdMembersByUserIdRemove,
  type GroupJoinPolicy,
  type GroupMember,
  type GroupViewerState,
} from '../../api/generated';
import { apiData, authHeaders } from '../../api/runtime';
import { errorMessage } from '../../common/errors';
import { Button, colors, textSizes, textWeights } from '../ui';
import { PlayerInviteSearch } from './PlayerInviteSearch';

type MemberAction = { kind: 'approve' | 'reject' | 'remove'; userId: string };

export function GroupMembershipPanel({
  groupId,
  joinPolicy,
  userId,
}: {
  groupId: string;
  joinPolicy: GroupJoinPolicy;
  userId: string;
}) {
  const membership = useGroupMembership(groupId, userId);
  const state = membership.viewer.data;
  const excluded = useMemo(
    () => new Set(membership.members.data?.map((member) => member.user_id) ?? []),
    [membership.members.data],
  );

  return (
    <View style={styles.panel}>
      <Text style={styles.title}>Members</Text>
      <Text style={styles.body}>{membershipSummary(state, joinPolicy)}</Text>
      {!state?.membership_status && (
        <Button loading={membership.join.isPending} onPress={membership.joinNow}>
          {joinPolicy === 'approval_required' ? 'Request to join' : 'Join group'}
        </Button>
      )}
      {state?.membership_status === 'invited' && (
        <Button loading={membership.join.isPending} onPress={membership.joinNow}>Accept invitation</Button>
      )}
      {state?.membership_status && state.role !== 'owner' && (
        <Button loading={membership.leave.isPending} onPress={membership.requestLeave} variant="danger">
          {state.membership_status === 'member' ? 'Leave group' : 'Withdraw'}
        </Button>
      )}
      {membership.members.data?.map((member) => (
        <GroupMemberRow
          canManage={state?.can_manage ?? false}
          key={member.user_id}
          member={member}
          onAction={membership.actOnMember}
        />
      ))}
      {state?.can_manage && (
        <PlayerInviteSearch excludedUserIds={excluded} onInvite={membership.invitePlayer} userId={userId} />
      )}
    </View>
  );
}

function GroupMemberRow({
  canManage,
  member,
  onAction,
}: {
  canManage: boolean;
  member: GroupMember;
  onAction: (action: MemberAction) => void;
}) {
  const actions = useGroupMemberRowActions(member.user_id, onAction);
  return (
    <View style={styles.member}>
      <View style={styles.memberCopy}>
        <Text style={styles.memberName}>{member.display_name}</Text>
        <Text style={styles.memberMeta}>
          {[member.role, member.status, member.city, member.skill_level].filter(Boolean).join(' · ')}
        </Text>
      </View>
      {canManage && member.status === 'pending' && (
        <View style={styles.actions}>
          <Button onPress={actions.approve} size="compact">Approve</Button>
          <Button onPress={actions.reject} size="compact" variant="quiet">Reject</Button>
        </View>
      )}
      {canManage && member.role !== 'owner' && member.status !== 'pending' && (
        <Button onPress={actions.remove} size="compact" variant="danger">Remove</Button>
      )}
    </View>
  );
}

function useGroupMemberRowActions(userId: string, onAction: (action: MemberAction) => void) {
  const approve = useCallback(() => onAction({ kind: 'approve', userId }), [onAction, userId]);
  const reject = useCallback(() => onAction({ kind: 'reject', userId }), [onAction, userId]);
  const remove = useCallback(() => onAction({ kind: 'remove', userId }), [onAction, userId]);
  return { approve, reject, remove };
}

function useGroupMembership(groupId: string, userId: string) {
  const queryClient = useQueryClient();
  const headers = authHeaders(userId);
  const refresh = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['groups', 'viewer', groupId, userId] }),
      queryClient.invalidateQueries({ queryKey: ['groups', 'members', groupId, userId] }),
      queryClient.invalidateQueries({ queryKey: ['groups'] }),
    ]);
  }, [groupId, queryClient, userId]);
  const viewer = useQuery({
    enabled: Boolean(groupId && userId),
    queryFn: () => apiData<GroupViewerState>(getApiGroupsByGroupIdMe({ headers, path: { group_id: groupId } })),
    queryKey: ['groups', 'viewer', groupId, userId],
  });
  const members = useQuery({
    enabled: Boolean(groupId && userId),
    queryFn: () => apiData<GroupMember[]>(getApiGroupsByGroupIdMembers({ headers, path: { group_id: groupId } })),
    queryKey: ['groups', 'members', groupId, userId],
  });
  const mutationOptions = { onError: showMembershipError, onSuccess: refresh };
  const join = useMutation({
    mutationFn: () => apiData(postApiGroupsByGroupIdJoin({ headers, path: { group_id: groupId } })),
    ...mutationOptions,
  });
  const leave = useMutation({
    mutationFn: () => apiData(postApiGroupsByGroupIdLeave({ headers, path: { group_id: groupId } })),
    ...mutationOptions,
  });
  const invite = useMutation({
    mutationFn: (targetId: string) => apiData(postApiGroupsByGroupIdInvite({
      body: { user_id: targetId }, headers, path: { group_id: groupId },
    })),
    ...mutationOptions,
  });
  const memberAction = useMutation({
    mutationFn: (action: MemberAction) => {
      const options = { headers, path: { group_id: groupId, user_id: action.userId } };
      if (action.kind === 'approve') return apiData(postApiGroupsByGroupIdMembersByUserIdApprove(options));
      if (action.kind === 'reject') return apiData(postApiGroupsByGroupIdMembersByUserIdReject(options));
      return apiData(postApiGroupsByGroupIdMembersByUserIdRemove(options));
    },
    ...mutationOptions,
  });
  const joinNow = useCallback(() => join.mutate(), [join]);
  const leaveNow = useCallback(() => leave.mutate(), [leave]);
  const requestLeave = useCallback(() => {
    Alert.alert('Leave this group?', 'You can request to join again later.', [
      { style: 'cancel', text: 'Stay' },
      { onPress: leaveNow, style: 'destructive', text: 'Leave' },
    ]);
  }, [leaveNow]);
  const invitePlayer = useCallback((targetId: string) => invite.mutate(targetId), [invite]);
  const actOnMember = useCallback((action: MemberAction) => memberAction.mutate(action), [memberAction]);
  return { actOnMember, invitePlayer, join, joinNow, leave, members, requestLeave, viewer };
}

function membershipSummary(state: GroupViewerState | undefined, joinPolicy: GroupJoinPolicy) {
  if (state?.role === 'owner') return 'You own this group and can manage membership.';
  if (state?.membership_status === 'member') return 'You are a member of this group.';
  if (state?.membership_status === 'pending') return 'Your request is waiting for approval.';
  if (state?.membership_status === 'invited') return 'You have an invitation to this group.';
  if (joinPolicy === 'approval_required') return 'Send a request to the group managers.';
  if (joinPolicy === 'invite_only') return 'This group is invite only.';
  return 'Join to attend members-only gatherings.';
}

function showMembershipError(error: unknown) {
  Alert.alert('Friendminton', errorMessage(error));
}

const styles = StyleSheet.create({
  panel: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 18, borderWidth: 1, gap: 12, padding: 18 },
  title: { ...textSizes.large, ...textWeights.heavy, color: colors.text },
  body: { ...textSizes.small, ...textWeights.regular, color: colors.textMuted },
  member: { alignItems: 'center', borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 10, paddingTop: 12 },
  memberCopy: { flex: 1 },
  memberName: { ...textSizes.small, ...textWeights.strong, color: colors.text },
  memberMeta: { ...textSizes.caption, ...textWeights.regular, color: colors.textMuted, textTransform: 'capitalize' },
  actions: { flexDirection: 'row', gap: 6 },
});
