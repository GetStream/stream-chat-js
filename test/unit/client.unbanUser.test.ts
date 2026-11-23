import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getClientWithUser } from './test-utils/getClient';
import type { StreamChat } from '../../src';

describe('unbanUser', () => {
  let client: StreamChat;
  let sendRequest: ReturnType<typeof vi.spyOn>;
  let legacyDelete: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    client = getClientWithUser({ id: 'mod' });
    sendRequest = vi
      .spyOn(client.api, 'sendRequest')
      .mockResolvedValue({ duration: '1ms', metadata: {} } as never);
    legacyDelete = vi
      .spyOn(client.api, 'delete')
      .mockResolvedValue({ duration: '1ms' } as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const unbanCall = () => {
    expect(sendRequest).toHaveBeenCalledTimes(1);
    const [method, path, pathParams, queryParams, body] = sendRequest.mock.calls[0];
    return { method, path, pathParams, queryParams, body };
  };

  describe('client.unbanUser', () => {
    it('lifts a global ban through the V2 unban endpoint', async () => {
      const result = await client.unbanUser('bob');

      expect(unbanCall()).toEqual({
        method: 'POST',
        path: '/api/v2/moderation/unban',
        pathParams: undefined,
        queryParams: { target_user_id: 'bob', channel_cid: undefined },
        body: {},
      });
      expect(legacyDelete).not.toHaveBeenCalled();
      expect(result.duration).toBe('1ms');
    });

    it('maps type and id to channel_cid', async () => {
      await client.unbanUser('bob', { type: 'messaging', id: 'general' });

      expect(unbanCall().queryParams).toEqual({
        target_user_id: 'bob',
        channel_cid: 'messaging:general',
      });
    });

    it('ignores options the V2 endpoint has no field for', async () => {
      await client.unbanUser('bob', {
        shadow: true,
        client_id: 'c',
        connection_id: 'x',
        remove_future_channels_ban: false,
      });

      expect(unbanCall()).toMatchObject({
        queryParams: { target_user_id: 'bob', channel_cid: undefined },
        body: {},
      });
    });

    it('keeps options.target_user_id taking precedence, as before', async () => {
      await client.unbanUser('bob', { target_user_id: 'alice' });

      expect(unbanCall().queryParams).toMatchObject({ target_user_id: 'alice' });
    });

    it('falls back to v1 for remove_future_channels_ban, which V2 does not accept', async () => {
      await client.unbanUser('bob', { remove_future_channels_ban: true });

      expect(sendRequest).not.toHaveBeenCalled();
      expect(legacyDelete).toHaveBeenCalledWith(`${client.baseURL}/moderation/ban`, {
        remove_future_channels_ban: true,
        target_user_id: 'bob',
      });
    });
  });

  describe('channel.unbanUser', () => {
    it('lifts the ban on that channel', async () => {
      const channel = client.channel('messaging', 'general');

      await channel.unbanUser('bob');

      expect(unbanCall().queryParams).toEqual({
        target_user_id: 'bob',
        channel_cid: 'messaging:general',
      });
    });

    it('lets the channel win over a type and id passed in options', async () => {
      const channel = client.channel('messaging', 'general');

      await channel.unbanUser('bob', { type: 'team', id: 'other' });

      expect(unbanCall().queryParams).toMatchObject({ channel_cid: 'messaging:general' });
    });
  });
});
