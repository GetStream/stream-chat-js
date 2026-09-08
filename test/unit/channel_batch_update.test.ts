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

  it('forwards a custom patch from channelBatchUpdater().updateData to the root', async () => {
    await client
      .channelBatchUpdater()
      .updateData({ cids: { $eq: 'messaging:a' } }, undefined, {
        custom_set: { group: 'new' },
        custom_unset: ['location_id'],
      });

    const body = putSpy.mock.calls[0][1] as UpdateChannelsBatchOptions;
    expect(body.operation).toBe('updateData');
    expect(body.custom_set).toEqual({ group: 'new' });
    expect(body.custom_unset).toEqual(['location_id']);
    expect(body.data).toBeUndefined();
  });

  it('sends only a custom patch from channelBatchUpdater().updateCustom', async () => {
    await client
      .channelBatchUpdater()
      .updateCustom(
        { cids: { $in: ['messaging:a', 'messaging:b'] } },
        { group: 'new', 'expiration.value': 3 },
        ['location_id'],
      );

    expect(putSpy).toHaveBeenCalledWith(`${client.baseURL}/channels/batch`, {
      operation: 'updateData',
      filter: { cids: { $in: ['messaging:a', 'messaging:b'] } },
      custom_set: { group: 'new', 'expiration.value': 3 },
      custom_unset: ['location_id'],
    });

    // Both fields are siblings of `operation` and `filter`, and no `data` key
    // is sent at all — a `data.custom` next to a patch is a 400, and `data` is
    // the extra-fields sink that would swallow a misplaced `custom_set`.
    const body = putSpy.mock.calls[0][1] as UpdateChannelsBatchOptions;
    expect(Object.keys(body)).toContain('custom_set');
    expect(Object.keys(body)).toContain('custom_unset');
    expect(Object.keys(body)).not.toContain('data');
  });

  it('sends updateCustom with only the keys it was given', async () => {
    await client
      .channelBatchUpdater()
      .updateCustom({ types: { $eq: 'messaging' } }, { group: 'new' });

    const body = putSpy.mock.calls[0][1] as UpdateChannelsBatchOptions;
    expect(body.operation).toBe('updateData');
    expect(body.filter).toEqual({ types: { $eq: 'messaging' } });
    expect(body.custom_set).toEqual({ group: 'new' });
    expect(body.custom_unset).toBeUndefined();
    expect(Object.keys(body)).not.toContain('data');
  });
});
