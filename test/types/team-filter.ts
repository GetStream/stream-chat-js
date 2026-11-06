/**
 * Compile-time contract for the channel `team` filter. Type-checked, never executed.
 *
 * With multi-tenancy, an empty `team` filter queries across all teams, so `team: {}` must be
 * accepted alongside the usual operators. Other keys must keep rejecting an empty object.
 */
import type { ChannelFilters } from 'stream-chat';

export const allTeams: ChannelFilters = { team: {} };
export const noTeam: ChannelFilters = { team: { $eq: null } };
export const oneTeam: ChannelFilters = { team: 'red' };
export const someTeams: ChannelFilters = { team: { $in: ['red', 'blue'] } };

// @ts-expect-error -- only `team` gives `{}` a meaning
export const emptyType: ChannelFilters = { type: {} };
