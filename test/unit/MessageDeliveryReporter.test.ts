import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getClientWithUser } from './test-utils/getClient';
import type { Channel, Event, EventAPIResponse, StreamChat } from '../../src';

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
  ({ id, created_at: new Date(at) }) as any;

describe('MessageDeliveryReporter', () => {
  let client: StreamChat;
  let channel: Channel;

  beforeEach(async () => {
    vi.useFakeTimers();
    client = getClientWithUser(ownUser);
    (client as any).user.privacy_settings.delivery_receipts.enabled = undefined;

    channel = client.channel(channelType, channelId);
    channel.initialized = true;
    client.configs[channel.cid] = {
      created_at: '',
      read_events: true,
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
    const markChannelsDeliveredSpy = vi
      .spyOn(client, 'markChannelsDelivered')
      .mockResolvedValue({ ok: true } as any);

    // last_read < last message
    channel.state.latestMessages = [mkMsg('m1', '2025-01-01T10:00:00Z')];
    (channel.state as any).read['me'] = { last_read: new Date('2025-01-01T09:00:00Z') };

    client.syncDeliveredCandidates([channel]);
    expect(markChannelsDeliveredSpy).not.toHaveBeenCalled();

    // throttle window (MessageDeliveryReporter uses 1000ms)
    vi.advanceTimersByTime(1000);
    // trailing request is not triggered as there are no delivery candidates to report
    expect(markChannelsDeliveredSpy).toHaveBeenCalledTimes(1);
    expect(markChannelsDeliveredSpy).toHaveBeenCalledWith({
      latest_delivered_messages: [
        {
          cid: channel.cid,
          id: 'm1',
        },
      ],
    });
  });

  it('announces at max 100 candidates per request', async () => {
    const markChannelsDeliveredSpy = vi
      .spyOn(client, 'markChannelsDelivered')
      .mockResolvedValue({ ok: true } as any);

    // last_read < last message
    const channels = Array.from({ length: 110 }, (_, i) => {
      const channel = client.channel(channelType, i.toString());
      channel.initialized = true;
      channel.state.latestMessages = [mkMsg('m1', '2025-01-01T10:00:00Z')];
      (channel.state as any).read['me'] = { last_read: new Date('2025-01-01T09:00:00Z') };
      return channel;
    });
    channels.forEach((ch) => {
      client.configs[ch.cid] = {
        created_at: '',
        read_events: true,
        reminders: false,
        updated_at: '',
      };
    });

    client.syncDeliveredCandidates(channels);
    vi.advanceTimersByTime(1000);
    // trailing request is not triggered as there are no delivery candidates to report
    expect(markChannelsDeliveredSpy).toHaveBeenCalledTimes(1);
    expect(
      markChannelsDeliveredSpy.mock.calls[0][0].latest_delivered_messages.length,
    ).toBe(100);
    // @ts-expect-error accessing protected property deliveryReportCandidates
    expect(client.messageDeliveryReporter.deliveryReportCandidates.size).toBe(10);
    expect(
      // @ts-expect-error accessing protected property deliveryReportCandidates
      Array.from(client.messageDeliveryReporter.deliveryReportCandidates.keys()),
    ).toEqual(channels.slice(100).map((channel) => channel.cid));

    await Promise.resolve();
    vi.advanceTimersByTime(1000);
    expect(markChannelsDeliveredSpy).toHaveBeenCalledTimes(2);
    expect(
      markChannelsDeliveredSpy.mock.calls[1][0].latest_delivered_messages.length,
    ).toBe(10);
    // @ts-expect-error accessing protected property deliveryReportCandidates
    expect(client.messageDeliveryReporter.deliveryReportCandidates.size).toBe(0);
  });

  it('does nothing when delivery receipts are disabled', async () => {
    (client as any).user.privacy_settings.delivery_receipts.enabled = false;
    const markChannelsDeliveredSpy = vi
      .spyOn(client, 'markChannelsDelivered')
      .mockResolvedValue({ ok: true } as any);

    channel.state.latestMessages = [mkMsg('m1', '2025-01-01T10:00:00Z')];
    (channel.state as any).read['me'] = { last_read: new Date('2025-01-01T09:00:00Z') };

    client.syncDeliveredCandidates([channel]);
    vi.advanceTimersByTime(1000);

    expect(markChannelsDeliveredSpy).not.toHaveBeenCalled();
  });

  it('does nothing when read events are disabled in channel config', async () => {
    client.configs[channel.cid] = {
      created_at: '',
      read_events: false,
      reminders: false,
      updated_at: '',
    };
    const markChannelsDeliveredSpy = vi
      .spyOn(client, 'markChannelsDelivered')
      .mockResolvedValue({ ok: true } as any);

    channel.state.latestMessages = [mkMsg('m1', '2025-01-01T10:00:00Z')];
    (channel.state as any).read['me'] = { last_read: new Date('2025-01-01T09:00:00Z') };

    client.syncDeliveredCandidates([channel]);
    vi.advanceTimersByTime(1000);

    expect(markChannelsDeliveredSpy).not.toHaveBeenCalled();
  });

  it('does not report if latest message is older than last_delivered_at in read state', async () => {
    const markChannelsDeliveredSpy = vi
      .spyOn(client, 'markChannelsDelivered')
      .mockResolvedValue({ ok: true } as any);

    (channel.state as any).latestMessages = [mkMsg('m1', '2025-01-01T10:00:00Z')];
    (channel.state as any).read['me'] = {
      last_read: new Date('2025-01-01T09:00:00Z'),
      last_delivered_at: new Date('2025-01-01T11:00:00Z'),
    };

    client.syncDeliveredCandidates([channel]);

    vi.advanceTimersByTime(1000);
    expect(markChannelsDeliveredSpy).not.toHaveBeenCalled();
  });

  it('coalesces multiple announceDeliveryBuffered calls into a single request', async () => {
    const markChannelsDeliveredSpy = vi
      .spyOn(client, 'markChannelsDelivered')
      .mockResolvedValue({} as any);

    channel.state.latestMessages = [mkMsg('m1', 1000)];
    (channel.state as any).read['me'] = { last_read: new Date(0) };

    client.syncDeliveredCandidates([channel]);

    client.messageDeliveryReporter.announceDeliveryBuffered();
    client.messageDeliveryReporter.announceDeliveryBuffered();
    client.messageDeliveryReporter.announceDeliveryBuffered();

    vi.advanceTimersByTime(1000);
    expect(markChannelsDeliveredSpy).toHaveBeenCalledTimes(1);
  });

  it('updates the candidate to the newest message before the throttle fires', async () => {
    const markChannelsDeliveredSpy = vi
      .spyOn(client, 'markChannelsDelivered')
      .mockResolvedValue({} as any);

    (channel.state as any).read['me'] = { last_read: new Date('2025-01-01T09:00:00Z') };
    channel.state.latestMessages = [mkMsg('m1', '2025-01-01T10:00:00Z')];

    client.syncDeliveredCandidates([channel]);

    // newer message arrives before throttle fires
    channel.state.latestMessages.push(mkMsg('m2', '2025-01-01T10:05:00Z'));
    client.syncDeliveredCandidates([channel]);

    vi.advanceTimersByTime(1000);

    expect(markChannelsDeliveredSpy).toHaveBeenCalledWith({
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
      value: EventAPIResponse | PromiseLike<EventAPIResponse | undefined> | undefined,
    ) => void;
    const markChannelsDeliveredSpy = vi
      .spyOn(client, 'markChannelsDelivered')
      .mockImplementationOnce(() => new Promise((r) => (resolveFirstMarkDelivered = r)))
      .mockResolvedValueOnce({ ok: true } as any); // second request

    const ch1 = client.channel('messaging', 'ch1');
    ch1.initialized = true;
    (ch1.state as any).read['me'] = { last_read: new Date(0) };
    (ch1.state as any).latestMessages = [mkMsg('m1', 1000)];

    const ch2 = client.channel('messaging', 'ch2');
    ch2.initialized = true;

    client.configs[ch1.cid] = {
      created_at: '',
      read_events: true,
      reminders: false,
      updated_at: '',
    };

    client.configs[ch2.cid] = {
      created_at: '',
      read_events: true,
      reminders: false,
      updated_at: '',
    };
    client.syncDeliveredCandidates([ch1]);
    vi.advanceTimersByTime(1000);

    expect(markChannelsDeliveredSpy).toHaveBeenCalledTimes(1);
    expect(markChannelsDeliveredSpy).toHaveBeenCalledWith({
      latest_delivered_messages: [
        {
          cid: 'messaging:ch1',
          id: 'm1',
        },
      ],
    });

    // While request is in-flight, a new candidate (different channel) arrives.
    (ch2.state as any).read['me'] = { last_read: new Date(0) };
    (ch2.state as any).latestMessages = [mkMsg('n1', 2000)];
    client.syncDeliveredCandidates([ch2]);

    // Trying to announce during in-flight should be a no-op for sending
    vi.advanceTimersByTime(1000);
    expect(markChannelsDeliveredSpy).toHaveBeenCalledTimes(1);

    // Settle the first request
    resolveFirstMarkDelivered({ ok: true } as any);
    await Promise.resolve();

    // Now announce again; the queued candidate should be sent
    client.messageDeliveryReporter.announceDeliveryBuffered();
    vi.advanceTimersByTime(1000);

    expect(markChannelsDeliveredSpy).toHaveBeenCalledTimes(2);
    expect(markChannelsDeliveredSpy).toHaveBeenCalledWith({
      latest_delivered_messages: [
        {
          cid: 'messaging:ch2',
          id: 'n1',
        },
      ],
    });
  });

  it('removes the pending delivery candidate upon channel.markRead', async () => {
    const markChannelsDeliveredSpy = vi
      .spyOn(client, 'markChannelsDelivered')
      .mockResolvedValue({} as any);
    vi.spyOn(channel, 'markAsReadRequest').mockResolvedValue({} as any);

    (channel.state as any).read['me'] = { last_read: new Date(0) };
    channel.state.latestMessages = [mkMsg('m1', 1000)];

    client.syncDeliveredCandidates([channel]);

    await channel.markRead();

    vi.advanceTimersByTime(1000);
    expect(markChannelsDeliveredSpy).not.toHaveBeenCalled();
  });

  it('does not remove the pending delivery candidate after failed markRead request', async () => {
    const markChannelsDeliveredSpy = vi.spyOn(client, 'markChannelsDelivered');
    vi.spyOn(channel, 'markAsReadRequest').mockRejectedValue({} as any);

    (channel.state as any).read['me'] = { last_read: new Date(0) };
    channel.state.latestMessages = [mkMsg('m1', 1000)];

    client.syncDeliveredCandidates([channel]);

    try {
      await channel.markRead();
    } catch (error) {}

    vi.advanceTimersByTime(1000);
    expect(markChannelsDeliveredSpy).toHaveBeenCalledWith({
      latest_delivered_messages: [
        {
          cid: channel.cid,
          id: 'm1',
        },
      ],
    });
  });

  it('handles message.new via channel event: schedules and sends delivered for newest', async () => {
    const markChannelsDeliveredSpy = vi
      .spyOn(client, 'markChannelsDelivered')
      .mockResolvedValue({} as any);

    (channel.state as any).read['me'] = { last_read: new Date(0) };
    channel.state.latestMessages = [];

    // simulate incoming message.new event
    const ev: Event = {
      type: 'message.new',
      created_at: new Date('2025-01-01T10:00:00Z').toISOString(),
      user: otherUser,
      message: mkMsg('m1', '2025-01-01T10:00:00Z') as any,
    };

    channel._handleChannelEvent(ev);

    vi.advanceTimersByTime(1000);

    expect(markChannelsDeliveredSpy).toHaveBeenCalledTimes(1);
    expect(markChannelsDeliveredSpy).toHaveBeenCalledWith({
      latest_delivered_messages: [
        {
          cid: channel.cid,
          id: 'm1',
        },
      ],
    });
  });

  it('prevents tracking own new messages', async () => {
    const markChannelsDeliveredSpy = vi
      .spyOn(client, 'markChannelsDelivered')
      .mockResolvedValue({} as any);

    (channel.state as any).read['me'] = { last_read: new Date(0) };
    channel.state.latestMessages = [];

    // simulate incoming message.new event
    const ev: Event = {
      type: 'message.new',
      created_at: new Date('2025-01-01T10:00:00Z').toISOString(),
      user: ownUser,
      message: mkMsg('m1', '2025-01-01T10:00:00Z') as any,
    };

    channel._handleChannelEvent(ev);

    vi.advanceTimersByTime(1000);

    expect(markChannelsDeliveredSpy).not.toHaveBeenCalled();
  });

  it('syncs delivery candidates upon own message.read event and prevents reporting delivery', async () => {
    const markChannelsDeliveredSpy = vi
      .spyOn(client, 'markChannelsDelivered')
      .mockResolvedValue({} as any);

    (channel.state as any).read['me'] = { last_read: new Date(0) };
    channel.state.latestMessages = [mkMsg('m1', '2025-01-01T10:00:00Z') as any];

    client.syncDeliveredCandidates([channel]);

    const ev: Event = {
      type: 'message.read',
      created_at: new Date('2025-01-01T10:00:00Z').toISOString(),
      last_read_message_id: 'm1',
      message: mkMsg('m1', '2025-01-01T10:00:00Z') as any,
      user: ownUser,
    };

    channel._handleChannelEvent(ev);

    vi.advanceTimersByTime(1000);

    expect(markChannelsDeliveredSpy).not.toHaveBeenCalled();
  });

  it('does not sync delivery candidates upon other user message.read event and reports delivery', async () => {
    const markChannelsDeliveredSpy = vi
      .spyOn(client, 'markChannelsDelivered')
      .mockResolvedValue({} as any);

    (channel.state as any).read['me'] = { last_read: new Date(0) };
    channel.state.latestMessages = [mkMsg('m1', '2025-01-01T10:00:00Z') as any];

    client.syncDeliveredCandidates([channel]);

    const ev: Event = {
      type: 'message.read',
      created_at: new Date('2025-01-01T10:00:00Z').toISOString(),
      last_read_message_id: 'm1',
      message: mkMsg('m1', '2025-01-01T10:00:00Z') as any,
      user: otherUser,
    };

    channel._handleChannelEvent(ev);

    vi.advanceTimersByTime(1000);

    expect(markChannelsDeliveredSpy).toHaveBeenCalledTimes(1);
    expect(markChannelsDeliveredSpy).toHaveBeenCalledWith({
      latest_delivered_messages: [
        {
          cid: channel.cid,
          id: 'm1',
        },
      ],
    });
  });

  it('throttles markRead (burst collapses to one underlying request)', async () => {
    const spy = vi.spyOn(channel, 'markAsReadRequest').mockResolvedValue({} as any);

    // burst
    client.messageDeliveryReporter.throttledMarkRead(channel);
    client.messageDeliveryReporter.throttledMarkRead(channel);
    client.messageDeliveryReporter.throttledMarkRead(channel);

    expect(spy).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
