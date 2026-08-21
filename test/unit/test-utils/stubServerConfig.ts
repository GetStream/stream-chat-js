import type { Channel } from '../../../src/channel';

/**
 * Sets a channel's server configuration in tests.
 *
 * Writes through `client.channelServerConfigsStore` — the real place — rather than stubbing the
 * accessor, because the flags no longer reach consumers directly. They are reconciled into
 * `channel.config` by the entity's `applyAuthority`, and the store write is what triggers that
 * derivation. Faking `serverConfig` alone would leave every resolved value untouched, so tests that
 * looked like they were disabling a feature would silently assert nothing.
 *
 * Falls back to defining both accessors for plain object mocks with no client behind them.
 *
 * Returns a setter for the cases that need the value to change mid-test.
 */
export const stubServerConfig = (
  channel: Partial<Channel> | Record<string, unknown>,
  initial: Record<string, unknown> | undefined,
) => {
  const client = (channel as Channel).getClient?.();
  const cid = (channel as Channel).cid;

  if (client && cid) {
    const write = (next: Record<string, unknown> | undefined) => {
      client.channelServerConfigsStore.partialNext({
        configs: { ...client.channelServerConfigs, [cid]: next } as never,
      });
    };
    write(initial);
    return write;
  }

  let current = initial;
  for (const key of ['serverConfig', 'config']) {
    Object.defineProperty(channel, key, { configurable: true, get: () => current });
  }
  return (next: Record<string, unknown> | undefined) => {
    current = next;
  };
};
