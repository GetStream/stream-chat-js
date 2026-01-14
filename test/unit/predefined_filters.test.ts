import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StreamChat } from '../../src/client';
import type {
  CreatePredefinedFilterOptions,
  UpdatePredefinedFilterOptions,
  ListPredefinedFiltersOptions,
  ChannelOptions,
  PredefinedFilterResponse,
  ListPredefinedFiltersResponse,
  APIResponse,
  QueryChannelsAPIResponse,
} from '../../src/types';

describe('Predefined Filters', () => {
  let client: StreamChat;

  beforeEach(() => {
    client = new StreamChat('api_key', 'api_secret');
  });

  describe('createPredefinedFilter', () => {
    it('should create a predefined filter', async () => {
      const mockResponse: PredefinedFilterResponse = {
        duration: '0.01s',
        predefined_filter: {
          name: 'user_messaging',
          operation: 'QueryChannels',
          filter: {
            type: 'messaging',
            members: { $in: ['{{user_id}}'] },
          },
          sort: [{ field: 'last_message_at', direction: -1 }],
          query_id: 12345678901234567890,
          created_at: '2024-01-15T10:30:00Z',
          updated_at: '2024-01-15T10:30:00Z',
        },
      };

      const postSpy = vi.spyOn(client, 'post').mockResolvedValue(mockResponse);

      const options: CreatePredefinedFilterOptions = {
        name: 'user_messaging',
        operation: 'QueryChannels',
        filter: {
          type: 'messaging',
          members: { $in: ['{{user_id}}'] },
        },
        sort: [{ field: 'last_message_at', direction: -1 }],
      };

      const result = await client.createPredefinedFilter(options);

      expect(postSpy).toHaveBeenCalledWith(
        `${client.baseURL}/predefined_filters`,
        options,
      );
      expect(result.predefined_filter.name).toBe('user_messaging');
      expect(result.predefined_filter.operation).toBe('QueryChannels');
    });

    it('should throw error if called without server-side auth', async () => {
      const clientWithoutSecret = new StreamChat('api_key');
      clientWithoutSecret.user = { id: 'test-user' };

      const options: CreatePredefinedFilterOptions = {
        name: 'test_filter',
        operation: 'QueryChannels',
        filter: { type: 'messaging' },
      };

      await expect(clientWithoutSecret.createPredefinedFilter(options)).rejects.toThrow();
    });
  });

  describe('getPredefinedFilter', () => {
    it('should get a predefined filter by name', async () => {
      const mockResponse: PredefinedFilterResponse = {
        duration: '0.01s',
        predefined_filter: {
          name: 'user_messaging',
          operation: 'QueryChannels',
          filter: { type: 'messaging' },
          created_at: '2024-01-15T10:30:00Z',
          updated_at: '2024-01-15T10:30:00Z',
        },
      };

      const getSpy = vi.spyOn(client, 'get').mockResolvedValue(mockResponse);

      const result = await client.getPredefinedFilter('user_messaging');

      expect(getSpy).toHaveBeenCalledWith(
        `${client.baseURL}/predefined_filters/user_messaging`,
      );
      expect(result.predefined_filter.name).toBe('user_messaging');
    });

    it('should properly encode filter names with special characters', async () => {
      const mockResponse: PredefinedFilterResponse = {
        duration: '0.01s',
        predefined_filter: {
          name: 'filter-with-dash',
          operation: 'QueryChannels',
          filter: { type: 'messaging' },
          created_at: '2024-01-15T10:30:00Z',
          updated_at: '2024-01-15T10:30:00Z',
        },
      };

      const getSpy = vi.spyOn(client, 'get').mockResolvedValue(mockResponse);

      await client.getPredefinedFilter('filter-with-dash');

      expect(getSpy).toHaveBeenCalledWith(
        `${client.baseURL}/predefined_filters/filter-with-dash`,
      );
    });
  });

  describe('updatePredefinedFilter', () => {
    it('should update a predefined filter', async () => {
      const mockResponse: PredefinedFilterResponse = {
        duration: '0.01s',
        predefined_filter: {
          name: 'user_messaging',
          operation: 'QueryChannels',
          filter: { type: 'team' },
          description: 'Updated description',
          created_at: '2024-01-15T10:30:00Z',
          updated_at: '2024-01-16T10:30:00Z',
        },
      };

      const putSpy = vi.spyOn(client, 'put').mockResolvedValue(mockResponse);

      const options: UpdatePredefinedFilterOptions = {
        operation: 'QueryChannels',
        filter: { type: 'team' },
        description: 'Updated description',
      };

      const result = await client.updatePredefinedFilter('user_messaging', options);

      expect(putSpy).toHaveBeenCalledWith(
        `${client.baseURL}/predefined_filters/user_messaging`,
        options,
      );
      expect(result.predefined_filter.description).toBe('Updated description');
    });
  });

  describe('deletePredefinedFilter', () => {
    it('should delete a predefined filter', async () => {
      const mockResponse: APIResponse = {
        duration: '0.01s',
      };

      const deleteSpy = vi.spyOn(client, 'delete').mockResolvedValue(mockResponse);

      const result = await client.deletePredefinedFilter('user_messaging');

      expect(deleteSpy).toHaveBeenCalledWith(
        `${client.baseURL}/predefined_filters/user_messaging`,
      );
      expect(result.duration).toBe('0.01s');
    });
  });

  describe('listPredefinedFilters', () => {
    it('should list all predefined filters', async () => {
      const mockResponse: ListPredefinedFiltersResponse = {
        duration: '0.01s',
        predefined_filters: [
          {
            name: 'filter1',
            operation: 'QueryChannels',
            filter: { type: 'messaging' },
            created_at: '2024-01-15T10:30:00Z',
            updated_at: '2024-01-15T10:30:00Z',
          },
          {
            name: 'filter2',
            operation: 'QueryChannels',
            filter: { type: 'team' },
            created_at: '2024-01-15T11:30:00Z',
            updated_at: '2024-01-15T11:30:00Z',
          },
        ],
      };

      const getSpy = vi.spyOn(client, 'get').mockResolvedValue(mockResponse);

      const result = await client.listPredefinedFilters();

      expect(getSpy).toHaveBeenCalledWith(`${client.baseURL}/predefined_filters`, {});
      expect(result.predefined_filters).toHaveLength(2);
    });

    it('should pass pagination options', async () => {
      const mockResponse: ListPredefinedFiltersResponse = {
        duration: '0.01s',
        predefined_filters: [],
        next: 'next_cursor',
      };

      const getSpy = vi.spyOn(client, 'get').mockResolvedValue(mockResponse);

      const options: ListPredefinedFiltersOptions = {
        limit: 10,
        next: 'cursor',
      };

      await client.listPredefinedFilters(options);

      expect(getSpy).toHaveBeenCalledWith(`${client.baseURL}/predefined_filters`, {
        limit: 10,
        next: 'cursor',
      });
    });

    it('should serialize sort options as JSON', async () => {
      const mockResponse: ListPredefinedFiltersResponse = {
        duration: '0.01s',
        predefined_filters: [],
      };

      const getSpy = vi.spyOn(client, 'get').mockResolvedValue(mockResponse);

      const options: ListPredefinedFiltersOptions = {
        sort: [{ field: 'created_at', direction: -1 }],
        limit: 20,
      };

      await client.listPredefinedFilters(options);

      expect(getSpy).toHaveBeenCalledWith(`${client.baseURL}/predefined_filters`, {
        limit: 20,
        sort: JSON.stringify([{ field: 'created_at', direction: -1 }]),
      });
    });
  });

  describe('queryChannels with predefined filter', () => {
    beforeEach(() => {
      // Mock wsPromise and connection
      client.wsPromise = Promise.resolve();
      client.wsConnection = { connectionID: 'test-connection-id' } as never;
    });

    it('should query channels with a predefined filter using options', async () => {
      const mockResponse: QueryChannelsAPIResponse = {
        duration: '0.01s',
        channels: [
          {
            channel: {
              id: 'channel1',
              type: 'messaging',
              cid: 'messaging:channel1',
              created_at: '2024-01-15T10:30:00Z',
              updated_at: '2024-01-15T10:30:00Z',
              frozen: false,
              disabled: false,
            },
            members: [],
            messages: [],
            pinned_messages: [],
          },
        ],
      };

      const postSpy = vi.spyOn(client, 'post').mockResolvedValue(mockResponse);

      const options: ChannelOptions = {
        predefined_filter: 'user_messaging',
        filter_values: { user_id: 'user123' },
        limit: 20,
      };

      // When using predefined filter, filterConditions can be empty
      await client.queryChannels({}, [], options);

      expect(postSpy).toHaveBeenCalledWith(
        `${client.baseURL}/channels`,
        expect.objectContaining({
          predefined_filter: 'user_messaging',
          filter_values: { user_id: 'user123' },
          limit: 20,
          state: true,
          watch: true,
          presence: false,
        }),
      );
      // Should NOT include filter_conditions when using predefined filter
      expect(postSpy).toHaveBeenCalledWith(
        `${client.baseURL}/channels`,
        expect.not.objectContaining({
          filter_conditions: expect.anything(),
        }),
      );
    });

    it('should include sort_values in the request', async () => {
      const mockResponse: QueryChannelsAPIResponse = {
        duration: '0.01s',
        channels: [],
      };

      const postSpy = vi.spyOn(client, 'post').mockResolvedValue(mockResponse);

      const options: ChannelOptions = {
        predefined_filter: 'team_channels',
        filter_values: { channel_type: 'messaging', team_name: 'engineering' },
        sort_values: { sort_field: 'last_message_at' },
        limit: 50,
      };

      await client.queryChannels({}, [], options);

      expect(postSpy).toHaveBeenCalledWith(
        `${client.baseURL}/channels`,
        expect.objectContaining({
          predefined_filter: 'team_channels',
          filter_values: { channel_type: 'messaging', team_name: 'engineering' },
          sort_values: { sort_field: 'last_message_at' },
          limit: 50,
        }),
      );
    });

    it('should use traditional filter_conditions when no predefined_filter is provided', async () => {
      const mockResponse: QueryChannelsAPIResponse = {
        duration: '0.01s',
        channels: [],
      };

      const postSpy = vi.spyOn(client, 'post').mockResolvedValue(mockResponse);

      await client.queryChannels(
        { type: 'messaging', members: { $in: ['user123'] } },
        [{ last_message_at: -1 }],
        { limit: 20 },
      );

      expect(postSpy).toHaveBeenCalledWith(
        `${client.baseURL}/channels`,
        expect.objectContaining({
          filter_conditions: { type: 'messaging', members: { $in: ['user123'] } },
          sort: [{ field: 'last_message_at', direction: -1 }],
          limit: 20,
        }),
      );
      // Should NOT include predefined_filter fields
      expect(postSpy).toHaveBeenCalledWith(
        `${client.baseURL}/channels`,
        expect.not.objectContaining({
          predefined_filter: expect.anything(),
        }),
      );
    });

    it('should set watch to false when no connection ID', async () => {
      client.wsConnection = null as never;

      const mockResponse: QueryChannelsAPIResponse = {
        duration: '0.01s',
        channels: [],
      };

      const postSpy = vi.spyOn(client, 'post').mockResolvedValue(mockResponse);

      await client.queryChannels({}, [], {
        predefined_filter: 'user_messaging',
      });

      expect(postSpy).toHaveBeenCalledWith(
        `${client.baseURL}/channels`,
        expect.objectContaining({
          watch: false,
        }),
      );
    });

    it('should dispatch channels.queried event', async () => {
      const mockResponse: QueryChannelsAPIResponse = {
        duration: '0.01s',
        channels: [
          {
            channel: {
              id: 'channel1',
              type: 'messaging',
              cid: 'messaging:channel1',
              created_at: '2024-01-15T10:30:00Z',
              updated_at: '2024-01-15T10:30:00Z',
              frozen: false,
              disabled: false,
            },
            members: [],
            messages: [],
            pinned_messages: [],
          },
        ],
      };

      vi.spyOn(client, 'post').mockResolvedValue(mockResponse);
      const dispatchSpy = vi.spyOn(client, 'dispatchEvent');

      await client.queryChannels({}, [], {
        predefined_filter: 'user_messaging',
      });

      expect(dispatchSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'channels.queried',
          queriedChannels: expect.objectContaining({
            isLatestMessageSet: true,
          }),
        }),
      );
    });
  });
});
