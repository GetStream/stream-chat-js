import type { ChannelResponse } from '../types';

type MemberCounts = Pick<ChannelResponse, 'active_member_count' | 'member_count'>;

export const withCarriedActiveMemberCount = <TData extends MemberCounts>({
  next,
  previous,
}: {
  next: TData;
  previous?: MemberCounts;
}) => {
  const { active_member_count: nextActiveMemberCount, member_count: nextMemberCount } =
    next;
  const {
    active_member_count: previousActiveMemberCount,
    member_count: previousMemberCount,
  } = previous ?? {};
  const hasOwnActiveMemberCount = typeof nextActiveMemberCount === 'number';
  const hasPreviousActiveMemberCount = typeof previousActiveMemberCount === 'number';
  if (hasOwnActiveMemberCount || !hasPreviousActiveMemberCount) return next;

  const memberCount = nextMemberCount ?? previousMemberCount;
  const carriedActiveMemberCount =
    typeof memberCount === 'number'
      ? Math.min(previousActiveMemberCount, memberCount)
      : previousActiveMemberCount;

  return { ...next, active_member_count: carriedActiveMemberCount };
};
