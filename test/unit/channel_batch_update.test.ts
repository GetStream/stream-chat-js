import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StreamChat } from '../../src/client';
import type {
  APIResponse,
  UpdateChannelsBatchOptions,
  UpdateChannelsBatchResponse,
} from '../../src/types';

describe('updateChannelsBatch', () => {
  let client: StreamChat;
  let putSpy: ReturnType<typeof vi.spyOn>;

  const mockResponse: APIResponse & UpdateChannelsBatchResponse = {
    duration: '0.01s',
    result: {},
    task_id: 'task-id',
  };

  beforeEach(() => {
    client = new StreamChat('api_key', 'api_secret');
    putSpy = vi.spyOn(client, 'put').mockResolvedValue(mockResponse);
  });

  it('sends custom_set and custom_unset at the request root', async () => {
    const options: UpdateChannelsBatchOptions = {
      operation: 'updateData',
      filter: { cids: { $in: ['messaging:a', 'messaging:b'] } },
      custom_set: { group: 'old', 'expiration.value': 3 },
      custom_unset: ['location_id'],
    };

    await client.updateChannelsBatch(options);

    expect(putSpy).toHaveBeenCalledWith(`${client.baseURL}/channels/batch`, {
      operation: 'updateData',
      filter: { cids: { $in: ['messaging:a', 'messaging:b'] } },
      custom_set: { group: 'old', 'expiration.value': 3 },
      custom_unset: ['location_id'],
    });

    // The two fields are siblings of `operation` and `filter`. `data` is an
    // extra-fields sink on the v1 routes, so a `custom_set` key sent inside it
    // would mean "replace custom with a key named custom_set" instead.
    const body = putSpy.mock.calls[0][1] as UpdateChannelsBatchOptions;
    expect(Object.keys(body)).toContain('custom_set');
    expect(Object.keys(body)).toContain('custom_unset');
    expect(body.data).toBeUndefined();
  });

  it('omits custom_set and custom_unset when they are not provided', async () => {
    const options: UpdateChannelsBatchOptions = {
      operation: 'updateData',
      filter: { types: { $eq: 'messaging' } },
      data: { frozen: true },
    };

    await client.updateChannelsBatch(options);

    const body = putSpy.mock.calls[0][1] as UpdateChannelsBatchOptions;
    expect(body).not.toHaveProperty('custom_set');
    expect(body).not.toHaveProperty('custom_unset');
  });

  it('keeps the existing channelBatchUpdater().updateData data argument', async () => {
    await client
      .channelBatchUpdater()
      .updateData({ cids: { $eq: 'messaging:a' } }, { frozen: true });

    expect(putSpy).toHaveBeenCalledWith(`${client.baseURL}/channels/batch`, {
      operation: 'updateData',
      filter: { cids: { $eq: 'messaging:a' } },
      data: { frozen: true },
    });
  });

  it('forwards a custom patch from channelBatchUpdater().updateData to the root', async () => {
    await client.channelBatchUpdater().updateData(
      { cids: { $eq: 'messaging:a' } },
      {
        custom_set: { group: 'new' },
        custom_unset: ['location_id'],
      },
    );

    const body = putSpy.mock.calls[0][1] as UpdateChannelsBatchOptions;
    expect(body.operation).toBe('updateData');
    expect(body.custom_set).toEqual({ group: 'new' });
    expect(body.custom_unset).toEqual(['location_id']);
    expect(body).not.toHaveProperty('data');
  });

  it('updates channel data and custom fields in one updateData call', async () => {
    await client.channelBatchUpdater().updateData(
      { cids: { $in: ['messaging:a', 'messaging:b'] } },
      {
        data: { frozen: true },
        custom_set: { group: 'new', 'expiration.value': 3 },
        custom_unset: ['location_id'],
      },
    );

    expect(putSpy).toHaveBeenCalledWith(`${client.baseURL}/channels/batch`, {
      operation: 'updateData',
      filter: { cids: { $in: ['messaging:a', 'messaging:b'] } },
      data: { frozen: true },
      custom_set: { group: 'new', 'expiration.value': 3 },
      custom_unset: ['location_id'],
    });
  });

  it('does not let update options override the operation or filter', async () => {
    const filter = { cids: { $eq: 'messaging:a' } } as const;
    const options = {
      operation: 'hide' as const,
      filter: { cids: { $eq: 'messaging:b' } } as const,
      data: { frozen: true },
    };

    await client.channelBatchUpdater().updateData(filter, options);

    expect(putSpy).toHaveBeenCalledWith(`${client.baseURL}/channels/batch`, {
      operation: 'updateData',
      filter,
      data: { frozen: true },
    });
  });
});
