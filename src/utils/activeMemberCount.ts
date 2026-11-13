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

  const memberCount = next.member_count ?? previousMemberCount;

  return typeof memberCount === 'number'
    ? Math.min(previousActiveMemberCount, memberCount)
    : previousActiveMemberCount;
};
