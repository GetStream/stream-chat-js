import type { ChannelResponse } from '../gen/models';

export const getCarriedActiveMemberCount = ({
  next,
  previous,
}: {
  next: Partial<ChannelResponse>;
  previous: Partial<ChannelResponse> | undefined;
}) => {
  const { active_member_count: nextActiveMemberCount } = next;

  const {
    active_member_count: previousActiveMemberCount,
    member_count: previousMemberCount,
  } = previous ?? {};

  const hasOwnActiveMemberCount = typeof nextActiveMemberCount === 'number';
  const hasPreviousActiveMemberCount = typeof previousActiveMemberCount === 'number';
  if (hasOwnActiveMemberCount || !hasPreviousActiveMemberCount) return undefined;

  // Only Query Channels returns the count, so between queries shift the last known value
  // by the change in member_count (an estimate, clamped to [0, member_count]).
  const memberCount = next.member_count ?? previousMemberCount;
  const delta =
    typeof next.member_count === 'number' && typeof previousMemberCount === 'number'
      ? next.member_count - previousMemberCount
      : 0;
  const shifted = Math.max(0, previousActiveMemberCount + delta);
  return typeof memberCount === 'number' ? Math.min(shifted, memberCount) : shifted;
};
