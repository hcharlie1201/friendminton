import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import {
  getApiGatheringsByGatheringIdParticipants,
  postApiGatheringsByGatheringIdCancel,
  postApiGatheringsByGatheringIdInvite,
  postApiGatheringsByGatheringIdLeave,
  postApiGatheringsByGatheringIdParticipantsByUserIdApprove,
  postApiGatheringsByGatheringIdParticipantsByUserIdReject,
  postApiGatheringsByGatheringIdParticipantsByUserIdRemove,
  type GatheringParticipantView,
  type GatheringViewerState,
} from '../../api/generated';
import { apiData, authHeaders } from '../../api/runtime';
import { errorMessage } from '../../common/errors';
import { Button, colors, textSizes, textWeights } from '../ui';
import { PlayerInviteSearch } from './PlayerInviteSearch';

type ParticipantAction = { kind: 'approve' | 'reject' | 'remove'; userId: string };

export function GatheringParticipantsPanel({
  cancelled,
  gatheringId,
  userId,
  viewerState,
}: {
  cancelled: boolean;
  gatheringId: string;
  userId: string;
  viewerState?: GatheringViewerState;
}) {
  const controls = useGatheringParticipantControls(gatheringId, userId);
  const excluded = useMemo(
    () => new Set(controls.participants.data?.map((participant) => participant.user_id) ?? []),
    [controls.participants.data],
  );
  return (
    <View style={styles.panel}>
      <Text style={styles.title}>{cancelled ? 'Gathering cancelled' : 'Guest list'}</Text>
      {controls.participants.data?.map((participant) => (
        <ParticipantRow
          canManage={(viewerState?.can_manage ?? false) && participant.user_id !== userId}
          key={participant.user_id}
          onAction={controls.act}
          participant={participant}
        />
      ))}
      {!viewerState?.can_manage && viewerState?.participant_status && (
        <Button loading={controls.leave.isPending} onPress={controls.requestLeave} variant="danger">
          {viewerState.participant_status === 'going' ? 'Leave gathering' : 'Withdraw'}
        </Button>
      )}
      {viewerState?.can_manage && !cancelled && (
        <>
          <PlayerInviteSearch excludedUserIds={excluded} onInvite={controls.invite} userId={userId} />
          <Button loading={controls.cancel.isPending} onPress={controls.requestCancel} variant="danger">
            Cancel gathering
          </Button>
        </>
      )}
    </View>
  );
}

function ParticipantRow({
  canManage,
  onAction,
  participant,
}: {
  canManage: boolean;
  onAction: (action: ParticipantAction) => void;
  participant: GatheringParticipantView;
}) {
  const actions = useParticipantActions(participant.user_id, onAction);
  return (
    <View style={styles.row}>
      <View style={styles.copy}>
        <Text style={styles.name}>{participant.display_name}</Text>
        <Text style={styles.meta}>
          {[participant.status, participant.city, participant.skill_level].filter(Boolean).join(' · ')}
        </Text>
      </View>
      {canManage && participant.status === 'pending' && (
        <View style={styles.actions}>
          <Button onPress={actions.approve} size="compact">Approve</Button>
          <Button onPress={actions.reject} size="compact" variant="quiet">Reject</Button>
        </View>
      )}
      {canManage && participant.status !== 'pending' && (
        <Button onPress={actions.remove} size="compact" variant="danger">Remove</Button>
      )}
    </View>
  );
}

function useParticipantActions(userId: string, onAction: (action: ParticipantAction) => void) {
  const approve = useCallback(() => onAction({ kind: 'approve', userId }), [onAction, userId]);
  const reject = useCallback(() => onAction({ kind: 'reject', userId }), [onAction, userId]);
  const remove = useCallback(() => onAction({ kind: 'remove', userId }), [onAction, userId]);
  return { approve, reject, remove };
}

function useGatheringParticipantControls(gatheringId: string, userId: string) {
  const queryClient = useQueryClient();
  const headers = authHeaders(userId);
  const refresh = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['gatherings', 'participants', gatheringId, userId] }),
      queryClient.invalidateQueries({ queryKey: ['gatherings', 'viewer', gatheringId, userId] }),
      queryClient.invalidateQueries({ queryKey: ['gatherings', 'detail', gatheringId, userId] }),
      queryClient.invalidateQueries({ queryKey: ['gatherings'] }),
    ]);
  }, [gatheringId, queryClient, userId]);
  const options = { onError: showParticipantError, onSuccess: refresh };
  const participants = useQuery({
    enabled: Boolean(gatheringId && userId),
    queryFn: () => apiData<GatheringParticipantView[]>(getApiGatheringsByGatheringIdParticipants({
      headers, path: { gathering_id: gatheringId },
    })),
    queryKey: ['gatherings', 'participants', gatheringId, userId],
  });
  const leave = useMutation({
    mutationFn: () => apiData(postApiGatheringsByGatheringIdLeave({ headers, path: { gathering_id: gatheringId } })),
    ...options,
  });
  const cancel = useMutation({
    mutationFn: () => apiData(postApiGatheringsByGatheringIdCancel({ headers, path: { gathering_id: gatheringId } })),
    ...options,
  });
  const inviteMutation = useMutation({
    mutationFn: (targetId: string) => apiData(postApiGatheringsByGatheringIdInvite({
      body: { user_id: targetId }, headers, path: { gathering_id: gatheringId },
    })),
    ...options,
  });
  const actionMutation = useMutation({
    mutationFn: (action: ParticipantAction) => {
      const request = { headers, path: { gathering_id: gatheringId, user_id: action.userId } };
      if (action.kind === 'approve') return apiData(postApiGatheringsByGatheringIdParticipantsByUserIdApprove(request));
      if (action.kind === 'reject') return apiData(postApiGatheringsByGatheringIdParticipantsByUserIdReject(request));
      return apiData(postApiGatheringsByGatheringIdParticipantsByUserIdRemove(request));
    },
    ...options,
  });
  const leaveNow = useCallback(() => leave.mutate(), [leave]);
  const cancelNow = useCallback(() => cancel.mutate(), [cancel]);
  const requestLeave = useCallback(() => {
    Alert.alert('Leave this gathering?', 'Your spot will be released.', [
      { style: 'cancel', text: 'Stay' },
      { onPress: leaveNow, style: 'destructive', text: 'Leave' },
    ]);
  }, [leaveNow]);
  const requestCancel = useCallback(() => {
    Alert.alert('Cancel this gathering?', 'Players will no longer be able to join.', [
      { style: 'cancel', text: 'Keep it' },
      { onPress: cancelNow, style: 'destructive', text: 'Cancel gathering' },
    ]);
  }, [cancelNow]);
  const invite = useCallback((targetId: string) => inviteMutation.mutate(targetId), [inviteMutation]);
  const act = useCallback((action: ParticipantAction) => actionMutation.mutate(action), [actionMutation]);
  return { act, cancel, invite, leave, participants, requestCancel, requestLeave };
}

function showParticipantError(error: unknown) {
  Alert.alert('Friendminton', errorMessage(error));
}

const styles = StyleSheet.create({
  panel: { backgroundColor: colors.surface, borderBottomColor: colors.border, borderBottomWidth: 8, gap: 12, padding: 20 },
  title: { ...textSizes.large, ...textWeights.heavy, color: colors.text },
  row: { alignItems: 'center', borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 10, paddingTop: 12 },
  copy: { flex: 1 },
  name: { ...textSizes.small, ...textWeights.strong, color: colors.text },
  meta: { ...textSizes.caption, ...textWeights.regular, color: colors.textMuted, textTransform: 'capitalize' },
  actions: { flexDirection: 'row', gap: 6 },
});
