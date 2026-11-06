type MemberCounts = {
  active_member_count?: number;
  member_count?: number;
};

export type CarryActiveMemberCountParams<TData extends MemberCounts> = {
  next: TData;
  previous?: MemberCounts;
};

const getCarriedActiveMemberCount = ({
  next,
  previous,
}: CarryActiveMemberCountParams<MemberCounts>) => {
  if (typeof next.active_member_count === 'number') return undefined;
  if (typeof previous?.active_member_count !== 'number') return undefined;

  const {
    active_member_count: previousActiveMemberCount,
    member_count: previousMemberCount,
  } = previous;
  const { member_count: memberCount } = next;
  const memberCountChange =
    typeof memberCount === 'number' && typeof previousMemberCount === 'number'
      ? memberCount - previousMemberCount
      : 0;
  const shiftedActiveMemberCount = Math.max(
    0,
    previousActiveMemberCount + memberCountChange,
  );
  const carriedActiveMemberCount =
    typeof memberCount === 'number'
      ? Math.min(shiftedActiveMemberCount, memberCount)
      : shiftedActiveMemberCount;

  return carriedActiveMemberCount;
};

export const withCarriedActiveMemberCount = <TData extends MemberCounts>({
  next,
  previous,
}: CarryActiveMemberCountParams<TData>) => {
  const activeMemberCount = getCarriedActiveMemberCount({ next, previous });
  if (activeMemberCount === undefined) return next;

  const data = { ...next, active_member_count: activeMemberCount };
  return data;
};
