import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getClientWithUser } from '../test-utils/getClient';
import { generateChannel } from '../test-utils/generateChannel';
import { generateThreadResponse } from '../test-utils/generateThreadResponse';
import {
  type APIError,
  Channel,
  type CustomMarkReadRequestFn,
  Event,
  MarkDeliveredResponse,
  MarkReadResponse,
  StreamAPIError,
  StreamChat,
  StreamResponse,
  Thread,
} from '../../../src';
import type { AxiosResponse } from 'axios';
import { stubServerConfig } from '../test-utils/stubServerConfig';
import { convertDateToTimestamp } from '../test-utils/time';

const channelType = 'messaging';
const channelId = 'channelId';
const ownUser = {
  id: 'me',
  privacy_settings: { delivery_receipts: { enabled: true } },
};

const otherUser = {
  id: 'otherUser',
};
const mkMsg = (id: string, at: string | number | Date) =>
  ({ id, created_at: convertDateToTimestamp(new Date(at)) }) as any;

// The delivery reporter now derives the latest message from `channel.messagePaginator.headItems`,
// so tests seed the paginator's latest (head) window instead of assigning `channel.state.latestMessages`.
const setLatest = (channel: Channel, msgs: ReturnType<typeof mkMsg>[]) => {
  channel.messagePaginator.clearStateAndCache();
  if (msgs.length) {
    channel.messagePaginator.ingestPage({
      page: msgs,
      isHead: true,
      isTail: true,
      setActive: true,
    });
  }
};

describe('MessageDeliveryReporter', () => {
  let client: StreamChat;
  let channel: Channel;

  beforeEach(async () => {
    vi.useFakeTimers();
    client = getClientWithUser(ownUser);
    // Rebuild privacy_settings on each run — `client.user` is the shared `ownUser` reference, so a
    // fresh object keeps tests isolated (e.g. read_receipts set in one test can't leak into others).
    (client as any).user.privacy_settings = { delivery_receipts: { enabled: undefined } };

    channel = client.channel(channelType, channelId);
    channel.initialized = true;
    client.channelServerConfigs[channel.cid] = {
      created_at: '',
      delivery_events: true,
      read_events: false,
      reminders: false,
      updated_at: '',
    };
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('announces delivery after the buffer window', async () => {
    const markDeliveredSpy = vi
      .spyOn(client, 'markDelivered')
      .mockResolvedValue({ ok: true } as any);

    // last_read < last message
    setLatest(channel, [mkMsg('m1', '2025-01-01T10:00:00Z')]);
    (channel.state as any).read['me'] = {
      last_read: convertDateToTimestamp(new Date('2025-01-01T09:00:00Z')),
    };

    client.syncDeliveredCandidates([channel]);
    expect(markDeliveredSpy).not.toHaveBeenCalled();

    // throttle window (MessageDeliveryReporter uses 1000ms)
    vi.advanceTimersByTime(1000);
    // trailing request is not triggered as there are no delivery candidates to report
    expect(markDeliveredSpy).toHaveBeenCalledTimes(1);
    expect(markDeliveredSpy).toHaveBeenCalledWith({
      latest_delivered_messages: [
        {
          cid: channel.cid,
          id: 'm1',
        },
      ],
    });
  });

  it('announces at max 100 candidates per request', async () => {
    const markDeliveredSpy = vi
      .spyOn(client, 'markDelivered')
      .mockResolvedValue({ ok: true } as any);

    // last_read < last message
    const channels = Array.from({ length: 110 }, (_, i) => {
      const channel = client.channel(channelType, i.toString());
      channel.initialized = true;
      setLatest(channel, [mkMsg('m1', '2025-01-01T10:00:00Z')]);
      (channel.state as any).read['me'] = {
        last_read: convertDateToTimestamp(new Date('2025-01-01T09:00:00Z')),
      };
      return channel;
    });
    channels.forEach((ch) => {
      client.channelServerConfigs[ch.cid] = {
        created_at: '',
        delivery_events: true,
        read_events: false,
        reminders: false,
        updated_at: '',
      };
    });

    client.syncDeliveredCandidates(channels);
    vi.advanceTimersByTime(1000);
    // trailing request is not triggered as there are no delivery candidates to report
    expect(markDeliveredSpy).toHaveBeenCalledTimes(1);
    expect(markDeliveredSpy.mock.calls[0][0].latest_delivered_messages.length).toBe(100);
    // @ts-expect-error accessing protected property deliveryReportCandidates
    expect(client.messageDeliveryReporter.deliveryReportCandidates.size).toBe(10);
    expect(
      // @ts-expect-error accessing protected property deliveryReportCandidates
      Array.from(client.messageDeliveryReporter.deliveryReportCandidates.keys()),
    ).toEqual(channels.slice(100).map((channel) => channel.cid));

    await Promise.resolve();
    vi.advanceTimersByTime(1000);
    expect(markDeliveredSpy).toHaveBeenCalledTimes(2);
    expect(markDeliveredSpy.mock.calls[1][0].latest_delivered_messages.length).toBe(10);
    // @ts-expect-error accessing protected property deliveryReportCandidates
    expect(client.messageDeliveryReporter.deliveryReportCandidates.size).toBe(0);
  });

  it('does nothing when delivery receipts are disabled', async () => {
    (client as any).user.privacy_settings.delivery_receipts.enabled = false;
    const markDeliveredSpy = vi
      .spyOn(client, 'markDelivered')
      .mockResolvedValue({ ok: true } as any);

    setLatest(channel, [mkMsg('m1', '2025-01-01T10:00:00Z')]);
    (channel.state as any).read['me'] = {
      last_read: convertDateToTimestamp(new Date('2025-01-01T09:00:00Z')),
    };

    client.syncDeliveredCandidates([channel]);
    vi.advanceTimersByTime(1000);

    expect(markDeliveredSpy).not.toHaveBeenCalled();
  });

  it('does nothing when delievry events are disabled in channel config', async () => {
    // Through the store, not by mutating `channelServerConfigs`: the flag is reconciled into
    // `channel.config.deliveryEvents` by the channel's own derivation, and the store write is what
    // triggers it. A direct mutation changes the raw record and nothing else.
    stubServerConfig(channel, {
      created_at: '',
      delivery_events: false,
      read_events: false,
      reminders: false,
      updated_at: '',
    });
    const markDeliveredSpy = vi
      .spyOn(client, 'markDelivered')
      .mockResolvedValue({ ok: true } as any);

    setLatest(channel, [mkMsg('m1', '2025-01-01T10:00:00Z')]);
    (channel.state as any).read['me'] = {
      last_read: convertDateToTimestamp(new Date('2025-01-01T09:00:00Z')),
    };

    client.syncDeliveredCandidates([channel]);
    vi.advanceTimersByTime(1000);

    expect(markDeliveredSpy).not.toHaveBeenCalled();
  });

  it('does not report if latest message is older than last_delivered_at in read state', async () => {
    const markDeliveredSpy = vi
      .spyOn(client, 'markDelivered')
      .mockResolvedValue({ ok: true } as any);

    setLatest(channel, [mkMsg('m1', '2025-01-01T10:00:00Z')]);
    (channel.state as any).read['me'] = {
      last_read: convertDateToTimestamp(new Date('2025-01-01T09:00:00Z')),
      last_delivered_at: convertDateToTimestamp(new Date('2025-01-01T11:00:00Z')),
    };

    client.syncDeliveredCandidates([channel]);

    vi.advanceTimersByTime(1000);
    expect(markDeliveredSpy).not.toHaveBeenCalled();
  });

  it('does not report delivery for threads (unsupported; branch early-returns)', () => {
    const markDeliveredSpy = vi
      .spyOn(client, 'markDelivered')
      .mockResolvedValue({ ok: true } as any);

    const parent = mkMsg('parent', '2025-01-01T10:00:00Z');
    const channelResponse = generateChannel({
      channel: { id: 'thread-channel', members: [] },
    }).channel;
    const thread = new Thread({
      client,
      threadData: generateThreadResponse(channelResponse, parent),
    });
    thread.channel.initialized = true;
    // Grant delivery permission so we exercise the thread branch of
    // `getNextDeliveryReportCandidate`, not the earlier permission gate.
    client.channelServerConfigs[thread.channel.cid] = {
      created_at: '',
      delivery_events: true,
      read_events: false,
      reminders: false,
      updated_at: '',
    };
    // Seed the thread's head window with a newest reply that — on a channel — would be reported as a
    // delivery candidate (see the channel tests above).
    thread.messagePaginator.ingestPage({
      page: [mkMsg('t1', '2025-01-01T11:00:00Z')],
      isHead: true,
      isTail: true,
      setActive: true,
    });

    client.messageDeliveryReporter.syncDeliveredCandidates([thread]);
    vi.advanceTimersByTime(1000);

    // Thread delivery reporting is not yet supported: the thread branch returns before producing a
    // candidate, so nothing is announced. (When enabled, it reads `messagePaginator.headItems` — the
    // newest-loaded window — mirroring the channel branch.)
    expect(markDeliveredSpy).not.toHaveBeenCalled();
  });

  it('coalesces multiple announceDeliveryBuffered calls into a single request', async () => {
    const markDeliveredSpy = vi
      .spyOn(client, 'markDelivered')
      .mockResolvedValue({} as any);

    setLatest(channel, [mkMsg('m1', 1000)]);
    (channel.state as any).read['me'] = {
      last_read: convertDateToTimestamp(new Date(0)),
    };

    client.syncDeliveredCandidates([channel]);

    client.messageDeliveryReporter.announceDeliveryBuffered();
    client.messageDeliveryReporter.announceDeliveryBuffered();
    client.messageDeliveryReporter.announceDeliveryBuffered();

    vi.advanceTimersByTime(1000);
    expect(markDeliveredSpy).toHaveBeenCalledTimes(1);
  });

  it('updates the candidate to the newest message before the throttle fires', async () => {
    const markDeliveredSpy = vi
      .spyOn(client, 'markDelivered')
      .mockResolvedValue({} as any);

    (channel.state as any).read['me'] = {
      last_read: convertDateToTimestamp(new Date('2025-01-01T09:00:00Z')),
    };
    setLatest(channel, [mkMsg('m1', '2025-01-01T10:00:00Z')]);

    client.syncDeliveredCandidates([channel]);

    // newer message arrives before throttle fires
    setLatest(channel, [
      mkMsg('m1', '2025-01-01T10:00:00Z'),
      mkMsg('m2', '2025-01-01T10:05:00Z'),
    ]);
    client.syncDeliveredCandidates([channel]);

    vi.advanceTimersByTime(1000);

    expect(markDeliveredSpy).toHaveBeenCalledWith({
      latest_delivered_messages: [
        {
          cid: channel.cid,
          id: 'm2',
        },
      ],
    });
  });

  it('does not start a second request while one is in-flight; queues new candidate for after', async () => {
    // first call stays in-flight until we resolve it
    let resolveFirstMarkDelivered!: (
      value:
        | StreamResponse<MarkDeliveredResponse>
        | PromiseLike<StreamResponse<MarkDeliveredResponse> | undefined>
        | undefined,
    ) => void;
    const markDeliveredSpy = vi
      .spyOn(client, 'markDelivered')
      .mockImplementationOnce(() => new Promise((r) => (resolveFirstMarkDelivered = r)))
      .mockResolvedValueOnce({ ok: true } as any); // second request

    const ch1 = client.channel('messaging', 'ch1');
    ch1.initialized = true;
    (ch1.state as any).read['me'] = { last_read: convertDateToTimestamp(new Date(0)) };
    setLatest(ch1, [mkMsg('m1', 1000)]);

    const ch2 = client.channel('messaging', 'ch2');
    ch2.initialized = true;

    client.channelServerConfigs[ch1.cid] = {
      created_at: '',
      delivery_events: true,
      read_events: false,
      reminders: false,
      updated_at: '',
    };

    client.channelServerConfigs[ch2.cid] = {
      created_at: '',
      delivery_events: true,
      read_events: false,
      reminders: false,
      updated_at: '',
    };
    client.syncDeliveredCandidates([ch1]);
    vi.advanceTimersByTime(1000);

    expect(markDeliveredSpy).toHaveBeenCalledTimes(1);
    expect(markDeliveredSpy).toHaveBeenCalledWith({
      latest_delivered_messages: [
        {
          cid: 'messaging:ch1',
          id: 'm1',
        },
      ],
    });

    // While request is in-flight, a new candidate (different channel) arrives.
    (ch2.state as any).read['me'] = { last_read: convertDateToTimestamp(new Date(0)) };
    setLatest(ch2, [mkMsg('n1', 2000)]);
    client.syncDeliveredCandidates([ch2]);

    // Trying to announce during in-flight should be a no-op for sending
    vi.advanceTimersByTime(1000);
    expect(markDeliveredSpy).toHaveBeenCalledTimes(1);

    // Settle the first request
    resolveFirstMarkDelivered({ ok: true } as any);
    await Promise.resolve();

    // Now announce again; the queued candidate should be sent
    client.messageDeliveryReporter.announceDeliveryBuffered();
    vi.advanceTimersByTime(1000);

    expect(markDeliveredSpy).toHaveBeenCalledTimes(2);
    expect(markDeliveredSpy).toHaveBeenCalledWith({
      latest_delivered_messages: [
        {
          cid: 'messaging:ch2',
          id: 'n1',
        },
      ],
    });
  });

  it('does not send a read when the user disabled read receipts', async () => {
    (client as any).user.privacy_settings = { read_receipts: { enabled: false } };
    const markAsReadRequestSpy = vi
      .spyOn(channel, 'markRead')
      .mockResolvedValue({} as any);

    const result = await channel.markReadViaReporter();

    expect(markAsReadRequestSpy).not.toHaveBeenCalled();
    expect(result).toBeNull();
  });

  it('removes the pending delivery candidate upon channel.markReadViaReporter', async () => {
    const markDeliveredSpy = vi
      .spyOn(client, 'markDelivered')
      .mockResolvedValue({} as any);
    vi.spyOn(channel, 'markRead').mockResolvedValue({} as any);

    (channel.state as any).read['me'] = {
      last_read: convertDateToTimestamp(new Date(0)),
    };
    setLatest(channel, [mkMsg('m1', 1000)]);

    client.syncDeliveredCandidates([channel]);

    await channel.markReadViaReporter();

    vi.advanceTimersByTime(1000);
    expect(markDeliveredSpy).not.toHaveBeenCalled();
  });

  // `CustomMarkReadRequestFn` returns `Promise<Partial<StreamResponse<MarkReadResponse>> | null>`.
  // The `Partial<>` is what lets a handler delegate straight to `channel.markRead` — that resolves
  // to `StreamResponse<MarkReadResponse>` whose `event` is optional, so a stricter
  // `{ event: MarkReadResponseEvent }` return type would reject the delegation at compile time.
  describe('custom markReadRequest handler', () => {
    const markReadEvent = {
      channel_id: channelId,
      channel_type: channelType,
      cid: `${channelType}:${channelId}`,
      created_at: convertDateToTimestamp(new Date()),
      type: 'message.read',
    };

    it('accepts a handler that delegates straight to channel.markRead', async () => {
      const response = {
        duration: '0.1ms',
        event: markReadEvent,
      } as StreamResponse<MarkReadResponse>;
      const markReadSpy = vi.spyOn(channel, 'markRead').mockResolvedValue(response);

      const markReadRequest: CustomMarkReadRequestFn = ({ channel, options }) =>
        channel.markRead(options);
      const handler = vi.fn(markReadRequest);
      channel.configState.partialNext({ requestHandlers: { markReadRequest: handler } });

      const result = await channel.markReadViaReporter({ thread_id: 'threadId' });

      expect(handler).toHaveBeenCalledWith({
        channel,
        options: { thread_id: 'threadId' },
      });
      expect(markReadSpy).toHaveBeenCalledWith({ thread_id: 'threadId' });
      expect(result).toBe(response);
    });

    it('accepts a handler that returns only an event, without a duration', async () => {
      const markReadSpy = vi.spyOn(channel, 'markRead');
      const handler = vi.fn(async () => ({ event: markReadEvent }));
      channel.configState.partialNext({ requestHandlers: { markReadRequest: handler } });

      const result = await channel.markReadViaReporter();

      expect(handler).toHaveBeenCalled();
      // the handler replaces the request entirely — the SDK must not also issue one
      expect(markReadSpy).not.toHaveBeenCalled();
      expect(result).toEqual({ event: markReadEvent });
    });

    it('normalizes a nullish handler result to null', async () => {
      const handler = vi.fn(async () => undefined);
      channel.configState.partialNext({ requestHandlers: { markReadRequest: handler } });

      await expect(channel.markReadViaReporter()).resolves.toBeNull();
    });
  });

  const receiveMessages = (count: number, startId = 0) => {
    // last_read < last message
    const channels = Array.from({ length: count }, (_, i) => {
      const channel = client.channel(channelType, (i + startId).toString());
      channel.initialized = true;
      setLatest(channel, [mkMsg('m1', '2025-01-01T10:00:00Z')]);
      (channel.state as any).read['me'] = {
        last_read: convertDateToTimestamp(new Date('2025-01-01T09:00:00Z')),
      };
      return channel;
    });
    channels.forEach((ch) => {
      client.channelServerConfigs[ch.cid] = {
        created_at: '',
        delivery_events: true,
        read_events: false,
        reminders: false,
        updated_at: '',
      };
    });
    client.syncDeliveredCandidates(channels);
    return channels;
  };

  const retryableError = new StreamAPIError<APIError>('X', {
    code: -1,
    response: {} as AxiosResponse,
    status: 400,
  });

  const notRetryableError = new StreamAPIError<APIError>('X', {
    code: 2,
    response: {} as AxiosResponse,
    status: 400,
  });

  it('re-queues failed markChannelsDelivered request payloads', async () => {
    const markDeliveredSpy = vi.spyOn(client, 'markDelivered');

    markDeliveredSpy.mockRejectedValue(retryableError);
    const channels1 = receiveMessages(110);
    // @ts-expect-error accessing protected property deliveryReportCandidates
    expect(client.messageDeliveryReporter.deliveryReportCandidates.size).toBe(110);
    // @ts-expect-error accessing protected property nextDeliveryReportCandidates
    expect(client.messageDeliveryReporter.nextDeliveryReportCandidates.size).toBe(0);

    // =======================================================//
    // trigger mark delivered request that will fail
    vi.advanceTimersByTime(1000);
    await Promise.resolve();
    expect(markDeliveredSpy).toHaveBeenCalledTimes(1);
    // all the candidates have been returned back to deliveryReportCandidates
    // @ts-expect-error accessing protected property deliveryReportCandidates
    expect(client.messageDeliveryReporter.deliveryReportCandidates.size).toBe(110);
    // @ts-expect-error accessing protected property nextDeliveryReportCandidates
    expect(client.messageDeliveryReporter.nextDeliveryReportCandidates.size).toBe(0);

    // =======================================================//
    // retry - start mark delivered request that will again fail
    vi.advanceTimersByTime(2000);
    // receive new channels during the request
    const channels2 = receiveMessages(110, channels1.length);

    // the first 100 retried channels are in a sendBuffer - local scope
    // @ts-expect-error accessing protected property deliveryReportCandidates
    expect(client.messageDeliveryReporter.deliveryReportCandidates.size).toBe(10);
    expect(
      // @ts-expect-error accessing protected property deliveryReportCandidates
      Array.from(client.messageDeliveryReporter.deliveryReportCandidates.keys()),
    ).toEqual(channels1.slice(100).map((channel) => channel.cid));

    // newly arrived channels2 present in nextDeliveryReportCandidates
    // @ts-expect-error accessing protected property nextDeliveryReportCandidates
    expect(client.messageDeliveryReporter.nextDeliveryReportCandidates.size).toBe(110);
    expect(
      // @ts-expect-error accessing protected property deliveryReportCandidates
      Array.from(client.messageDeliveryReporter.nextDeliveryReportCandidates.keys()),
    ).toEqual(channels2.slice(0).map((channel) => channel.cid));

    // finish mark delivered request
    await Promise.resolve();
    expect(markDeliveredSpy).toHaveBeenCalledTimes(2);
    // all the candidates together now
    // @ts-expect-error accessing protected property deliveryReportCandidates
    expect(client.messageDeliveryReporter.deliveryReportCandidates.size).toBe(220);
    expect(
      // @ts-expect-error accessing protected property deliveryReportCandidates
      Array.from(client.messageDeliveryReporter.deliveryReportCandidates.keys()),
    ).toEqual([
      ...channels1.slice(0).map((channel) => channel.cid),
      ...channels2.slice(0).map((channel) => channel.cid),
    ]);

    // @ts-expect-error accessing protected property nextDeliveryReportCandidates
    expect(client.messageDeliveryReporter.nextDeliveryReportCandidates.size).toBe(0);

    // =======================================================//
    // retry - start mark delivered request that will again fail
    vi.advanceTimersByTime(4000);

    // the first 100 retried channels are in a sendBuffer - local scope
    // @ts-expect-error accessing protected property deliveryReportCandidates
    expect(client.messageDeliveryReporter.deliveryReportCandidates.size).toBe(120);
    expect(
      // @ts-expect-error accessing protected property deliveryReportCandidates
      Array.from(client.messageDeliveryReporter.deliveryReportCandidates.keys()),
    ).toEqual([
      ...channels1.slice(100).map((channel) => channel.cid),
      ...channels2.slice(0).map((channel) => channel.cid),
    ]);

    // newly arrived channels2 present in nextDeliveryReportCandidates
    // @ts-expect-error accessing protected property nextDeliveryReportCandidates
    expect(client.messageDeliveryReporter.nextDeliveryReportCandidates.size).toBe(0);

    // finish mark delivered request
    await Promise.resolve();
    // all the candidates together now
    // @ts-expect-error accessing protected property deliveryReportCandidates
    expect(client.messageDeliveryReporter.deliveryReportCandidates.size).toBe(220);
    expect(
      // @ts-expect-error accessing protected property deliveryReportCandidates
      Array.from(client.messageDeliveryReporter.deliveryReportCandidates.keys()),
    ).toEqual([
      ...channels1.slice(0).map((channel) => channel.cid),
      ...channels2.slice(0).map((channel) => channel.cid),
    ]);

    // @ts-expect-error accessing protected property nextDeliveryReportCandidates
    expect(client.messageDeliveryReporter.nextDeliveryReportCandidates.size).toBe(0);

    vi.advanceTimersByTime(8000);
    // finish mark delivered request
    await Promise.resolve();
    expect(markDeliveredSpy).toHaveBeenCalledTimes(4);

    // success resets the interval
    markDeliveredSpy.mockResolvedValueOnce({ ok: true } as any);
    // the timeout does not increase anymore from the fourth failed retry
    vi.advanceTimersByTime(8000);
    // finish mark delivered request
    await Promise.resolve();
    expect(markDeliveredSpy).toHaveBeenCalledTimes(5);

    // after the previous success we are back to the base timeout
    vi.advanceTimersByTime(1000);
    // finish mark delivered request
    await Promise.resolve();
    expect(markDeliveredSpy).toHaveBeenCalledTimes(6);

    // @ts-expect-error accessing protected property deliveryReportCandidates
    expect(client.messageDeliveryReporter.deliveryReportCandidates.size).toBe(120);
    expect(
      // @ts-expect-error accessing protected property deliveryReportCandidates
      Array.from(client.messageDeliveryReporter.deliveryReportCandidates.keys()),
    ).toEqual([
      ...channels1.slice(100).map((channel) => channel.cid),
      ...channels2.slice(0).map((channel) => channel.cid),
    ]);

    // @ts-expect-error accessing protected property nextDeliveryReportCandidates
    expect(client.messageDeliveryReporter.nextDeliveryReportCandidates.size).toBe(0);
  });

  it('non retryable error does not schedule retry', async () => {
    const markDeliveredSpy = vi.spyOn(client, 'markDelivered');

    markDeliveredSpy.mockRejectedValue(notRetryableError);
    const channels1 = receiveMessages(110);
    // @ts-expect-error accessing protected property deliveryReportCandidates
    expect(client.messageDeliveryReporter.deliveryReportCandidates.size).toBe(110);
    // @ts-expect-error accessing protected property nextDeliveryReportCandidates
    expect(client.messageDeliveryReporter.nextDeliveryReportCandidates.size).toBe(0);

    // =======================================================//
    // trigger mark delivered request that will fail
    vi.advanceTimersByTime(1000);
    await Promise.resolve();
    expect(markDeliveredSpy).toHaveBeenCalledTimes(1);

    // will not retry
    vi.advanceTimersByTime(2000);
    await Promise.resolve();
    expect(markDeliveredSpy).toHaveBeenCalledTimes(1);
  });

  it('does not remove the pending delivery candidate after failed markRead request', async () => {
    const markDeliveredSpy = vi.spyOn(client, 'markDelivered');
    vi.spyOn(channel, 'markRead').mockRejectedValue({} as any);

    (channel.state as any).read['me'] = {
      last_read: convertDateToTimestamp(new Date(0)),
    };
    setLatest(channel, [mkMsg('m1', 1000)]);

    client.syncDeliveredCandidates([channel]);

    try {
      await channel.markRead();
    } catch (error) {}

    vi.advanceTimersByTime(1000);
    expect(markDeliveredSpy).toHaveBeenCalledWith({
      latest_delivered_messages: [
        {
          cid: channel.cid,
          id: 'm1',
        },
      ],
    });
  });

  it('swallows rejections from the throttled (auto) markRead so they do not leak as unhandled rejections', async () => {
    // Reproduces the fire-and-forget path: an active thread/channel auto-marks-read via
    // `throttledMarkRead`, but `channel.markRead` rejects (e.g. read events disabled). The throttled
    // wrapper must absorb it — otherwise it surfaces as an unhandled rejection and fails the run.
    const markReadSpy = vi
      .spyOn(channel, 'markRead')
      .mockRejectedValue(new Error('Read events are disabled for this application'));

    expect(() => client.messageDeliveryReporter.throttledMarkRead(channel)).not.toThrow();

    // Let the rejected markRead settle; the `.catch` in the throttled wrapper absorbs it.
    // (1000ms === the reporter's MARK_AS_READ_THROTTLE_TIMEOUT.)
    await vi.advanceTimersByTimeAsync(1000);
    expect(markReadSpy).toHaveBeenCalledTimes(1);
  });

  it('handles message.new via channel event: schedules and sends delivered for newest', async () => {
    const markDeliveredSpy = vi
      .spyOn(client, 'markDelivered')
      .mockResolvedValue({} as any);

    (channel.state as any).read['me'] = {
      last_read: convertDateToTimestamp(new Date(0)),
    };
    setLatest(channel, []);

    // simulate incoming message.new event
    const ev: Event = {
      type: 'message.new',
      created_at: convertDateToTimestamp(new Date('2025-01-01T10:00:00Z')),
      user: otherUser,
      // cid must match the paginator filter so message.new ingests into an interval
      message: { ...mkMsg('m1', '2025-01-01T10:00:00Z'), cid: channel.cid } as any,
    };

    channel._handleChannelEvent(ev);

    vi.advanceTimersByTime(1000);

    expect(markDeliveredSpy).toHaveBeenCalledTimes(1);
    expect(markDeliveredSpy).toHaveBeenCalledWith({
      latest_delivered_messages: [
        {
          cid: channel.cid,
          id: 'm1',
        },
      ],
    });
  });

  it('prevents tracking own new messages', async () => {
    const markDeliveredSpy = vi
      .spyOn(client, 'markDelivered')
      .mockResolvedValue({} as any);

    (channel.state as any).read['me'] = {
      last_read: convertDateToTimestamp(new Date(0)),
    };
    setLatest(channel, []);

    // simulate incoming message.new event
    const ev: Event = {
      type: 'message.new',
      created_at: convertDateToTimestamp(new Date('2025-01-01T10:00:00Z')),
      user: ownUser,
      message: mkMsg('m1', '2025-01-01T10:00:00Z') as any,
    };

    channel._handleChannelEvent(ev);

    vi.advanceTimersByTime(1000);

    expect(markDeliveredSpy).not.toHaveBeenCalled();
  });

  it('syncs delivery candidates upon own message.read event and prevents reporting delivery', async () => {
    const markDeliveredSpy = vi
      .spyOn(client, 'markDelivered')
      .mockResolvedValue({} as any);

    (channel.state as any).read['me'] = {
      last_read: convertDateToTimestamp(new Date(0)),
    };
    setLatest(channel, [mkMsg('m1', '2025-01-01T10:00:00Z')]);

    client.syncDeliveredCandidates([channel]);

    const ev: Event = {
      type: 'message.read',
      created_at: convertDateToTimestamp(new Date('2025-01-01T10:00:00Z')),
      last_read_message_id: 'm1',
      message: mkMsg('m1', '2025-01-01T10:00:00Z') as any,
      user: ownUser,
    };

    channel._handleChannelEvent(ev);

    vi.advanceTimersByTime(1000);

    expect(markDeliveredSpy).not.toHaveBeenCalled();
  });

  it('does not sync delivery candidates upon other user message.read event and reports delivery', async () => {
    const markDeliveredSpy = vi
      .spyOn(client, 'markDelivered')
      .mockResolvedValue({} as any);

    (channel.state as any).read['me'] = {
      last_read: convertDateToTimestamp(new Date(0)),
    };
    setLatest(channel, [mkMsg('m1', '2025-01-01T10:00:00Z')]);

    client.syncDeliveredCandidates([channel]);

    const ev: Event = {
      type: 'message.read',
      created_at: convertDateToTimestamp(new Date('2025-01-01T10:00:00Z')),
      last_read_message_id: 'm1',
      message: mkMsg('m1', '2025-01-01T10:00:00Z') as any,
      user: otherUser,
    };

    channel._handleChannelEvent(ev);

    vi.advanceTimersByTime(1000);

    expect(markDeliveredSpy).toHaveBeenCalledTimes(1);
    expect(markDeliveredSpy).toHaveBeenCalledWith({
      latest_delivered_messages: [
        {
          cid: channel.cid,
          id: 'm1',
        },
      ],
    });
  });

  it('throttles markRead (leading + trailing: fires immediately, then once more on the trailing edge)', async () => {
    const spy = vi.spyOn(channel, 'markRead').mockResolvedValue({} as any);

    // burst
    client.messageDeliveryReporter.throttledMarkRead(channel);
    client.messageDeliveryReporter.throttledMarkRead(channel);
    client.messageDeliveryReporter.throttledMarkRead(channel);

    expect(spy).toHaveBeenCalledTimes(1); // leading edge fires immediately
    vi.advanceTimersByTime(1000);
    expect(spy).toHaveBeenCalledTimes(2); // trailing edge coalesces the remaining calls into one more
  });

  it('marks read immediately on a single throttledMarkRead call (leading edge)', async () => {
    const spy = vi.spyOn(channel, 'markRead').mockResolvedValue({} as any);

    // A single call is the common case (e.g. scrolling to the bottom once). With `leading: true` it
    // fires immediately on the leading edge — no delay — and a lone call schedules no extra trailing
    // invocation. (The lone-call-drop regression for `leading: false` is covered by the `throttle`
    // unit tests in utils.test.ts.)
    client.messageDeliveryReporter.throttledMarkRead(channel);

    expect(spy).toHaveBeenCalledTimes(1); // leading edge fires immediately
    vi.advanceTimersByTime(1000);
    expect(spy).toHaveBeenCalledTimes(1); // no extra trailing for a solitary call
  });
});
