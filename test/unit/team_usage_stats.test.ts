import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StreamChat } from '../../src/client';
import type {
  QueryTeamUsageStatsOptions,
  QueryTeamUsageStatsResponse,
} from '../../src/types';

describe('Team Usage Stats', () => {
  let client: StreamChat;

  beforeEach(() => {
    client = new StreamChat('api_key', 'api_secret');
  });

  describe('queryTeamUsageStats', () => {
    it('should query team usage stats with default options', async () => {
      const mockResponse: QueryTeamUsageStatsResponse = {
        duration: '0.05s',
        teams: [
          {
            team: 'team-1',
            users_daily: { total: 100 },
            messages_daily: { total: 500 },
            translations_daily: { total: 10 },
            image_moderations_daily: { total: 5 },
            concurrent_users: { total: 25 },
            concurrent_connections: { total: 30 },
            users_total: { total: 1000 },
            users_last_24_hours: { total: 50 },
            users_last_30_days: { total: 200 },
            users_month_to_date: { total: 150 },
            users_engaged_last_30_days: { total: 180 },
            users_engaged_month_to_date: { total: 120 },
            messages_total: { total: 50000 },
            messages_last_24_hours: { total: 250 },
            messages_last_30_days: { total: 5000 },
            messages_month_to_date: { total: 3500 },
          },
        ],
      };

      const postSpy = vi.spyOn(client, 'post').mockResolvedValue(mockResponse);

      const result = await client.queryTeamUsageStats();

      expect(postSpy).toHaveBeenCalledWith(`${client.baseURL}/stats/team_usage`, {});
      expect(result.teams).toHaveLength(1);
      expect(result.teams[0].team).toBe('team-1');
      expect(result.teams[0].users_daily.total).toBe(100);
    });

    it('should query team usage stats with month option', async () => {
      const mockResponse: QueryTeamUsageStatsResponse = {
        duration: '0.05s',
        teams: [
          {
            team: 'team-1',
            users_daily: { total: 100 },
            messages_daily: { total: 500 },
            translations_daily: { total: 10 },
            image_moderations_daily: { total: 5 },
            concurrent_users: { total: 25 },
            concurrent_connections: { total: 30 },
            users_total: { total: 1000 },
            users_last_24_hours: { total: 50 },
            users_last_30_days: { total: 200 },
            users_month_to_date: { total: 150 },
            users_engaged_last_30_days: { total: 180 },
            users_engaged_month_to_date: { total: 120 },
            messages_total: { total: 50000 },
            messages_last_24_hours: { total: 250 },
            messages_last_30_days: { total: 5000 },
            messages_month_to_date: { total: 3500 },
          },
        ],
      };

      const postSpy = vi.spyOn(client, 'post').mockResolvedValue(mockResponse);

      const options: QueryTeamUsageStatsOptions = {
        month: '2026-01',
      };

      const result = await client.queryTeamUsageStats(options);

      expect(postSpy).toHaveBeenCalledWith(`${client.baseURL}/stats/team_usage`, {
        month: '2026-01',
      });
      expect(result.teams).toHaveLength(1);
    });

    it('should query team usage stats with date range for daily breakdown', async () => {
      const mockResponse: QueryTeamUsageStatsResponse = {
        duration: '0.05s',
        teams: [
          {
            team: 'team-1',
            users_daily: {
              daily: [
                { date: '2026-01-03', value: 35 },
                { date: '2026-01-02', value: 32 },
                { date: '2026-01-01', value: 30 },
              ],
              total: 97,
            },
            messages_daily: {
              daily: [
                { date: '2026-01-03', value: 180 },
                { date: '2026-01-02', value: 170 },
                { date: '2026-01-01', value: 150 },
              ],
              total: 500,
            },
            translations_daily: { total: 10 },
            image_moderations_daily: { total: 5 },
            concurrent_users: { total: 25 },
            concurrent_connections: { total: 30 },
            users_total: { total: 1000 },
            users_last_24_hours: { total: 50 },
            users_last_30_days: { total: 200 },
            users_month_to_date: { total: 150 },
            users_engaged_last_30_days: { total: 180 },
            users_engaged_month_to_date: { total: 120 },
            messages_total: { total: 50000 },
            messages_last_24_hours: { total: 250 },
            messages_last_30_days: { total: 5000 },
            messages_month_to_date: { total: 3500 },
          },
        ],
      };

      const postSpy = vi.spyOn(client, 'post').mockResolvedValue(mockResponse);

      const options: QueryTeamUsageStatsOptions = {
        start_date: '2026-01-01',
        end_date: '2026-01-03',
      };

      const result = await client.queryTeamUsageStats(options);

      expect(postSpy).toHaveBeenCalledWith(`${client.baseURL}/stats/team_usage`, {
        start_date: '2026-01-01',
        end_date: '2026-01-03',
      });
      expect(result.teams).toHaveLength(1);
      expect(result.teams[0].users_daily.daily).toHaveLength(3);
      expect(result.teams[0].users_daily.daily![0].date).toBe('2026-01-03');
      expect(result.teams[0].users_daily.daily![0].value).toBe(35);
    });

    it('should query team usage stats with pagination options', async () => {
      const mockResponse: QueryTeamUsageStatsResponse = {
        duration: '0.05s',
        teams: [
          {
            team: 'team-2',
            users_daily: { total: 50 },
            messages_daily: { total: 250 },
            translations_daily: { total: 5 },
            image_moderations_daily: { total: 2 },
            concurrent_users: { total: 10 },
            concurrent_connections: { total: 15 },
            users_total: { total: 500 },
            users_last_24_hours: { total: 25 },
            users_last_30_days: { total: 100 },
            users_month_to_date: { total: 75 },
            users_engaged_last_30_days: { total: 90 },
            users_engaged_month_to_date: { total: 60 },
            messages_total: { total: 25000 },
            messages_last_24_hours: { total: 125 },
            messages_last_30_days: { total: 2500 },
            messages_month_to_date: { total: 1750 },
          },
        ],
        next: 'next_cursor_value',
      };

      const postSpy = vi.spyOn(client, 'post').mockResolvedValue(mockResponse);

      const options: QueryTeamUsageStatsOptions = {
        limit: 10,
        next: 'cursor_value',
      };

      const result = await client.queryTeamUsageStats(options);

      expect(postSpy).toHaveBeenCalledWith(`${client.baseURL}/stats/team_usage`, {
        limit: 10,
        next: 'cursor_value',
      });
      expect(result.teams).toHaveLength(1);
      expect(result.next).toBe('next_cursor_value');
    });

    it('should handle multiple teams in response', async () => {
      const mockResponse: QueryTeamUsageStatsResponse = {
        duration: '0.05s',
        teams: [
          {
            team: 'team-1',
            users_daily: { total: 100 },
            messages_daily: { total: 500 },
            translations_daily: { total: 10 },
            image_moderations_daily: { total: 5 },
            concurrent_users: { total: 25 },
            concurrent_connections: { total: 30 },
            users_total: { total: 1000 },
            users_last_24_hours: { total: 50 },
            users_last_30_days: { total: 200 },
            users_month_to_date: { total: 150 },
            users_engaged_last_30_days: { total: 180 },
            users_engaged_month_to_date: { total: 120 },
            messages_total: { total: 50000 },
            messages_last_24_hours: { total: 250 },
            messages_last_30_days: { total: 5000 },
            messages_month_to_date: { total: 3500 },
          },
          {
            team: 'team-2',
            users_daily: { total: 50 },
            messages_daily: { total: 250 },
            translations_daily: { total: 5 },
            image_moderations_daily: { total: 2 },
            concurrent_users: { total: 10 },
            concurrent_connections: { total: 15 },
            users_total: { total: 500 },
            users_last_24_hours: { total: 25 },
            users_last_30_days: { total: 100 },
            users_month_to_date: { total: 75 },
            users_engaged_last_30_days: { total: 90 },
            users_engaged_month_to_date: { total: 60 },
            messages_total: { total: 25000 },
            messages_last_24_hours: { total: 125 },
            messages_last_30_days: { total: 2500 },
            messages_month_to_date: { total: 1750 },
          },
          {
            team: '', // Users not assigned to any team
            users_daily: { total: 20 },
            messages_daily: { total: 100 },
            translations_daily: { total: 1 },
            image_moderations_daily: { total: 0 },
            concurrent_users: { total: 5 },
            concurrent_connections: { total: 5 },
            users_total: { total: 100 },
            users_last_24_hours: { total: 10 },
            users_last_30_days: { total: 40 },
            users_month_to_date: { total: 30 },
            users_engaged_last_30_days: { total: 35 },
            users_engaged_month_to_date: { total: 25 },
            messages_total: { total: 5000 },
            messages_last_24_hours: { total: 50 },
            messages_last_30_days: { total: 500 },
            messages_month_to_date: { total: 350 },
          },
        ],
        next: 'next_page_cursor',
      };

      const postSpy = vi.spyOn(client, 'post').mockResolvedValue(mockResponse);

      const result = await client.queryTeamUsageStats({ limit: 30 });

      expect(postSpy).toHaveBeenCalledWith(`${client.baseURL}/stats/team_usage`, {
        limit: 30,
      });
      expect(result.teams).toHaveLength(3);
      expect(result.teams[0].team).toBe('team-1');
      expect(result.teams[1].team).toBe('team-2');
      expect(result.teams[2].team).toBe(''); // Empty string for unassigned users
      expect(result.next).toBe('next_page_cursor');
    });

    it('should handle empty teams response', async () => {
      const mockResponse: QueryTeamUsageStatsResponse = {
        duration: '0.01s',
        teams: [],
      };

      const postSpy = vi.spyOn(client, 'post').mockResolvedValue(mockResponse);

      const result = await client.queryTeamUsageStats({ month: '2020-01' });

      expect(postSpy).toHaveBeenCalledWith(`${client.baseURL}/stats/team_usage`, {
        month: '2020-01',
      });
      expect(result.teams).toHaveLength(0);
      expect(result.next).toBeUndefined();
    });

    it('should throw error if called without server-side auth', async () => {
      const clientWithoutSecret = new StreamChat('api_key');
      clientWithoutSecret.user = { id: 'test-user' };

      await expect(clientWithoutSecret.queryTeamUsageStats()).rejects.toThrow();
    });
  });
});
