import { beforeEach, describe, expect, it, vi } from 'vitest';

import axios from 'axios';

import { getClientWithUser } from './test-utils/getClient';
import type { StreamChat } from '../../src';

describe('per-request abort signal', () => {
  let client: StreamChat;
  let signal: AbortSignal;

  beforeEach(() => {
    client = getClientWithUser({ id: 'user-1' });
    signal = new AbortController().signal;
  });

  describe('verb wrappers', () => {
    beforeEach(() => {
      // these reach _enrichAxiosOptions, which needs a token
      vi.spyOn(client, '_getToken').mockReturnValue('token');
    });

    it('forwards a config from get() to axios', async () => {
      const axiosGet = vi
        .spyOn(client.axiosInstance, 'get')
        .mockResolvedValue({ data: {}, status: 200 } as never);

      await client.get('https://example.com/x', { payload: {} }, { signal });

      expect(axiosGet.mock.calls[0][1]).toMatchObject({ signal });
    });

    it('forwards a config from post() to axios', async () => {
      const axiosPost = vi
        .spyOn(client.axiosInstance, 'post')
        .mockResolvedValue({ data: {}, status: 200 } as never);

      await client.post('https://example.com/x', {}, { signal });

      expect(axiosPost.mock.calls[0][2]).toMatchObject({ signal });
    });

    it('takes precedence over a client-wide axiosRequestConfig signal', async () => {
      const clientWideSignal = new AbortController().signal;
      client.options.axiosRequestConfig = { signal: clientWideSignal };
      const axiosGet = vi
        .spyOn(client.axiosInstance, 'get')
        .mockResolvedValue({ data: {}, status: 200 } as never);

      await client.get('https://example.com/x', {}, { signal });

      expect(axiosGet.mock.calls[0][1]).toMatchObject({ signal });
    });

    it('falls back to the client-wide signal when no per-request one is given', async () => {
      const clientWideSignal = new AbortController().signal;
      client.options.axiosRequestConfig = { signal: clientWideSignal };
      const axiosGet = vi
        .spyOn(client.axiosInstance, 'get')
        .mockResolvedValue({ data: {}, status: 200 } as never);

      await client.get('https://example.com/x', {});

      expect(axiosGet.mock.calls[0][1]).toMatchObject({ signal: clientWideSignal });
    });
  });

  describe('cancelled requests', () => {
    beforeEach(() => {
      vi.spyOn(client, '_getToken').mockReturnValue('token');
    });

    it('rethrows without logging or counting a failure', async () => {
      const canceled = new axios.Cancel('canceled') as unknown as Error;
      vi.spyOn(client.axiosInstance, 'get').mockRejectedValue(canceled);
      const logApiError = vi.spyOn(client, '_logApiError');
      client.consecutiveFailures = 0;

      await expect(client.get('https://example.com/x', {})).rejects.toBe(canceled);

      // a deliberate cancellation is not an API failure
      expect(logApiError).not.toHaveBeenCalled();
      expect(client.consecutiveFailures).toBe(0);
    });

    it('still logs and counts a genuine network failure', async () => {
      vi.spyOn(client.axiosInstance, 'get').mockRejectedValue(new Error('ECONNRESET'));
      const logApiError = vi.spyOn(client, '_logApiError');
      client.consecutiveFailures = 0;

      await expect(client.get('https://example.com/x', {})).rejects.toThrow('ECONNRESET');

      expect(logApiError).toHaveBeenCalled();
      expect(client.consecutiveFailures).toBe(1);
    });
  });

  describe('query endpoints', () => {
    it('passes the signal through search()', async () => {
      const get = vi.spyOn(client, 'get').mockResolvedValue({ results: [] } as never);

      await client.search({}, 'hello', {}, { signal });

      expect(get.mock.calls[0][2]).toEqual({ signal });
    });

    it('passes the signal through queryUsers()', async () => {
      const get = vi.spyOn(client, 'get').mockResolvedValue({ users: [] } as never);

      await client.queryUsers({}, [], {}, { signal });

      expect(get.mock.calls[0][2]).toEqual({ signal });
    });

    it('passes the signal through queryChannels()', async () => {
      const post = vi.spyOn(client, 'post').mockResolvedValue({ channels: [] } as never);

      await client.queryChannels({}, [], {}, { signal });

      expect(post.mock.calls[0][2]).toEqual({ signal });
    });

    it('passes the signal through channel.queryMembers()', async () => {
      const get = vi.spyOn(client, 'get').mockResolvedValue({ members: [] } as never);
      const channel = client.channel('messaging', 'channel-1');

      await channel.queryMembers({}, [], {}, { signal });

      expect(get.mock.calls[0][2]).toEqual({ signal });
    });
  });
});
