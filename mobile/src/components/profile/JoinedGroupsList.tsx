import type { BadmintonGroup } from '../../api/generated';
import { GroupListSection } from '../groups';

type Props = {
  groups: readonly BadmintonGroup[];
  onOpenGroup: (groupId: string) => void;
};

export function JoinedGroupsList({ groups, onOpenGroup }: Props) {
  return (
    <GroupListSection
      emptyBody="Groups you join will stay together here for quick access."
      emptyTitle="No groups joined yet"
      groups={groups}
      onOpenGroup={onOpenGroup}
      subtitle="Your local clubs, communities, and regular badminton crews."
      title="Groups you joined"
    />
  );
}
