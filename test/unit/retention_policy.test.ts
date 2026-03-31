import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StreamChat } from '../../src/client';
import type {
  GetRetentionPolicyRunsOptions,
  GetRetentionPolicyRunsResponse,
} from '../../src/types';

describe('Retention Policy Runs', () => {
  let client: StreamChat;

  beforeEach(() => {
    client = new StreamChat('api_key', 'api_secret');
  });

  describe('getRetentionPolicyRuns', () => {
    it('should query runs with default options', async () => {
      const mockResponse: GetRetentionPolicyRunsResponse = {
        duration: '0.05s',
        runs: [
          {
            app_pk: 1,
            policy: 'old-messages',
            date: '2026-03-30',
            stats: { messages_deleted: 150 },
          },
        ],
      };

      const postSpy = vi.spyOn(client, 'post').mockResolvedValue(mockResponse);

      const result = await client.getRetentionPolicyRuns();

      expect(postSpy).toHaveBeenCalledWith(`${client.baseURL}/retention_policy/runs`, {});
      expect(result.runs).toHaveLength(1);
      expect(result.runs[0].policy).toBe('old-messages');
      expect(result.runs[0].stats.messages_deleted).toBe(150);
    });

    it('should query runs with filter_conditions on policy', async () => {
      const mockResponse: GetRetentionPolicyRunsResponse = {
        duration: '0.03s',
        runs: [
          {
            app_pk: 1,
            policy: 'inactive-channels',
            date: '2026-03-29',
            stats: { channels_deleted: 42 },
          },
          {
            app_pk: 1,
            policy: 'inactive-channels',
            date: '2026-03-28',
            stats: { channels_deleted: 38 },
          },
        ],
      };

      const postSpy = vi.spyOn(client, 'post').mockResolvedValue(mockResponse);

      const options: GetRetentionPolicyRunsOptions = {
        filter_conditions: { policy: { $eq: 'inactive-channels' } },
      };

      const result = await client.getRetentionPolicyRuns(options);

      expect(postSpy).toHaveBeenCalledWith(`${client.baseURL}/retention_policy/runs`, {
        filter_conditions: { policy: { $eq: 'inactive-channels' } },
      });
      expect(result.runs).toHaveLength(2);
      expect(result.runs.every((r) => r.policy === 'inactive-channels')).toBe(true);
    });

    it('should query runs with filter_conditions on date range', async () => {
      const mockResponse: GetRetentionPolicyRunsResponse = {
        duration: '0.04s',
        runs: [
          {
            app_pk: 1,
            policy: 'old-messages',
            date: '2026-03-15',
            stats: { messages_deleted: 200 },
          },
        ],
      };

      const postSpy = vi.spyOn(client, 'post').mockResolvedValue(mockResponse);

      const options: GetRetentionPolicyRunsOptions = {
        filter_conditions: {
          $and: [
            { date: { $gte: '2026-03-01T00:00:00Z' } },
            { date: { $lte: '2026-03-31T00:00:00Z' } },
          ],
        },
      };

      const result = await client.getRetentionPolicyRuns(options);

      expect(postSpy).toHaveBeenCalledWith(`${client.baseURL}/retention_policy/runs`, {
        filter_conditions: {
          $and: [
            { date: { $gte: '2026-03-01T00:00:00Z' } },
            { date: { $lte: '2026-03-31T00:00:00Z' } },
          ],
        },
      });
      expect(result.runs).toHaveLength(1);
      expect(result.runs[0].date).toBe('2026-03-15');
    });

    it('should query runs with sort', async () => {
      const mockResponse: GetRetentionPolicyRunsResponse = {
        duration: '0.03s',
        runs: [
          {
            app_pk: 1,
            policy: 'old-messages',
            date: '2026-03-30',
            stats: { messages_deleted: 100 },
          },
          {
            app_pk: 1,
            policy: 'old-messages',
            date: '2026-03-29',
            stats: { messages_deleted: 120 },
          },
        ],
      };

      const postSpy = vi.spyOn(client, 'post').mockResolvedValue(mockResponse);

      const options: GetRetentionPolicyRunsOptions = {
        sort: [{ field: 'date', direction: -1 }],
      };

      const result = await client.getRetentionPolicyRuns(options);

      expect(postSpy).toHaveBeenCalledWith(`${client.baseURL}/retention_policy/runs`, {
        sort: [{ field: 'date', direction: -1 }],
      });
      expect(result.runs).toHaveLength(2);
    });

    it('should query runs with pagination using next cursor', async () => {
      const mockResponse: GetRetentionPolicyRunsResponse = {
        duration: '0.02s',
        runs: [
          {
            app_pk: 1,
            policy: 'old-messages',
            date: '2026-03-20',
            stats: { messages_deleted: 80 },
          },
        ],
        next: 'next_cursor_value',
      };

      const postSpy = vi.spyOn(client, 'post').mockResolvedValue(mockResponse);

      const options: GetRetentionPolicyRunsOptions = {
        limit: 1,
      };

      const result = await client.getRetentionPolicyRuns(options);

      expect(postSpy).toHaveBeenCalledWith(`${client.baseURL}/retention_policy/runs`, {
        limit: 1,
      });
      expect(result.runs).toHaveLength(1);
      expect(result.next).toBe('next_cursor_value');
    });

    it('should paginate using next cursor from previous response', async () => {
      const mockResponse: GetRetentionPolicyRunsResponse = {
        duration: '0.02s',
        runs: [
          {
            app_pk: 1,
            policy: 'old-messages',
            date: '2026-03-19',
            stats: { messages_deleted: 60 },
          },
        ],
        prev: 'prev_cursor_value',
      };

      const postSpy = vi.spyOn(client, 'post').mockResolvedValue(mockResponse);

      const options: GetRetentionPolicyRunsOptions = {
        limit: 1,
        next: 'next_cursor_value',
      };

      const result = await client.getRetentionPolicyRuns(options);

      expect(postSpy).toHaveBeenCalledWith(`${client.baseURL}/retention_policy/runs`, {
        limit: 1,
        next: 'next_cursor_value',
      });
      expect(result.runs).toHaveLength(1);
      expect(result.prev).toBe('prev_cursor_value');
    });

    it('should combine filter_conditions, sort, and pagination', async () => {
      const mockResponse: GetRetentionPolicyRunsResponse = {
        duration: '0.04s',
        runs: [
          {
            app_pk: 1,
            policy: 'old-messages',
            date: '2026-03-30',
            stats: { messages_deleted: 300 },
          },
        ],
        next: 'abc123',
      };

      const postSpy = vi.spyOn(client, 'post').mockResolvedValue(mockResponse);

      const options: GetRetentionPolicyRunsOptions = {
        filter_conditions: { policy: { $eq: 'old-messages' } },
        sort: [{ field: 'date', direction: -1 }],
        limit: 5,
      };

      const result = await client.getRetentionPolicyRuns(options);

      expect(postSpy).toHaveBeenCalledWith(`${client.baseURL}/retention_policy/runs`, {
        filter_conditions: { policy: { $eq: 'old-messages' } },
        sort: [{ field: 'date', direction: -1 }],
        limit: 5,
      });
      expect(result.runs).toHaveLength(1);
      expect(result.next).toBe('abc123');
    });

    it('should handle empty runs response', async () => {
      const mockResponse: GetRetentionPolicyRunsResponse = {
        duration: '0.01s',
        runs: [],
      };

      const postSpy = vi.spyOn(client, 'post').mockResolvedValue(mockResponse);

      const options: GetRetentionPolicyRunsOptions = {
        filter_conditions: { policy: { $eq: 'old-messages' } },
      };

      const result = await client.getRetentionPolicyRuns(options);

      expect(postSpy).toHaveBeenCalledWith(`${client.baseURL}/retention_policy/runs`, {
        filter_conditions: { policy: { $eq: 'old-messages' } },
      });
      expect(result.runs).toHaveLength(0);
      expect(result.next).toBeUndefined();
      expect(result.prev).toBeUndefined();
    });

    it('should throw error if called without server-side auth', async () => {
      const clientWithoutSecret = new StreamChat('api_key');
      clientWithoutSecret.user = { id: 'test-user' };

      await expect(clientWithoutSecret.getRetentionPolicyRuns()).rejects.toThrow();
    });
  });
});
