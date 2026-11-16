import { describe, expect, it } from 'vitest';

import { withCarriedActiveMemberCount } from '../../../src/utils/activeMemberCount';

describe('withCarriedActiveMemberCount', () => {
  it('returns the next data unchanged when it has its own active member count', () => {
    const next = { active_member_count: 2, member_count: 5 };

    const data = withCarriedActiveMemberCount({
      next,
      previous: { active_member_count: 4, member_count: 5 },
    });

    expect(data).toBe(next);
  });

  it('returns the next data unchanged when there is no previous active member count', () => {
    const next = { member_count: 5 };

    const data = withCarriedActiveMemberCount({ next, previous: { member_count: 5 } });

    expect(data).toBe(next);
  });

  it('carries the previous active member count onto a copy', () => {
    const next = { member_count: 5 };

    const data = withCarriedActiveMemberCount({
      next,
      previous: { active_member_count: 4, member_count: 5 },
    });

    expect(data).toStrictEqual({ active_member_count: 4, member_count: 5 });
    expect(data).not.toBe(next);
    expect(next).toStrictEqual({ member_count: 5 });
  });

  it('moves the carried count by the change in member_count', () => {
    const previous = { active_member_count: 4, member_count: 5 };

    const added = withCarriedActiveMemberCount({ next: { member_count: 6 }, previous });
    const removed = withCarriedActiveMemberCount({ next: { member_count: 3 }, previous });

    expect(added.active_member_count).toBe(5);
    expect(removed.active_member_count).toBe(2);
  });

  it('keeps the carried count when either member_count is unknown', () => {
    const data = withCarriedActiveMemberCount({
      next: {},
      previous: { active_member_count: 4, member_count: 5 },
    });

    expect(data.active_member_count).toBe(4);
  });

  it('never carries a count below zero', () => {
    const data = withCarriedActiveMemberCount({
      next: { member_count: 0 },
      previous: { active_member_count: 1, member_count: 3 },
    });

    expect(data.active_member_count).toBe(0);
  });

  it('never carries a count above member_count', () => {
    const data = withCarriedActiveMemberCount({
      next: { member_count: 2 },
      previous: { active_member_count: 3, member_count: 2 },
    });

    expect(data.active_member_count).toBe(2);
  });
});
