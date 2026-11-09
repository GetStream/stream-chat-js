import type { ChannelResponse } from '../types';

type MemberCounts = Pick<ChannelResponse, 'active_member_count' | 'member_count'>;

export type CarryActiveMemberCountParams<TData extends MemberCounts> = {
  next: TData;
  previous?: MemberCounts;
};

const getCarriedActiveMemberCount = ({
  next,
  previous,
}: CarryActiveMemberCountParams<MemberCounts>) => {
  const { active_member_count: nextActiveMemberCount, member_count: memberCount } = next;
  const {
    active_member_count: previousActiveMemberCount,
    member_count: previousMemberCount,
  } = previous ?? {};
  const hasOwnActiveMemberCount = typeof nextActiveMemberCount === 'number';
  const hasPreviousActiveMemberCount = typeof previousActiveMemberCount === 'number';
  if (hasOwnActiveMemberCount || !hasPreviousActiveMemberCount) return undefined;

  const knowsMemberCount = typeof memberCount === 'number';
  const knowsBothMemberCounts =
    knowsMemberCount && typeof previousMemberCount === 'number';
  const memberCountChange = knowsBothMemberCounts ? memberCount - previousMemberCount : 0;
  const shiftedActiveMemberCount = Math.max(
    0,
    previousActiveMemberCount + memberCountChange,
  );

  const carriedActiveMemberCount = knowsMemberCount
    ? Math.min(shiftedActiveMemberCount, memberCount)
    : shiftedActiveMemberCount;
  return carriedActiveMemberCount;
};

export const withCarriedActiveMemberCount = <TData extends MemberCounts>({
  next,
  previous,
}: CarryActiveMemberCountParams<TData>) => {
  const activeMemberCount = getCarriedActiveMemberCount({ next, previous });
  const carriesActiveMemberCount = activeMemberCount !== undefined;
  if (!carriesActiveMemberCount) return next;

  const data = { ...next, active_member_count: activeMemberCount };
  return data;
};
