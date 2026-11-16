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

  // Only Query Channels returns the count, so between queries shift the last known value
  // by the change in member_count (an estimate, clamped to [0, member_count]).
  const memberCount = nextMemberCount ?? previousMemberCount;
  const delta =
    typeof nextMemberCount === 'number' && typeof previousMemberCount === 'number'
      ? nextMemberCount - previousMemberCount
      : 0;
  const shifted = Math.max(0, previousActiveMemberCount + delta);
  const carriedActiveMemberCount =
    typeof memberCount === 'number' ? Math.min(shifted, memberCount) : shifted;

  return { ...next, active_member_count: carriedActiveMemberCount };
};
