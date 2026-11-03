import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SCHEDULED_MESSAGE_LIMITS,
  getScheduledMessageLimits,
} from '../../../src';
import { getClientWithUser } from '../test-utils/getClient';
import { stubServerConfig } from '../test-utils/stubServerConfig';

const createChannel = () => {
  const client = getClientWithUser({ id: 'user' });
  client.connectUser();

  return client.channel('messaging', 'limits');
};

describe('getScheduledMessageLimits', () => {
  it('reads the limits from the channel server config', () => {
    const channel = createChannel();
    stubServerConfig(channel, {
      scheduled_messages_max_lead_time_seconds: 3600,
      scheduled_messages_max_per_channel: 3,
      scheduled_messages_max_per_user: 7,
      scheduled_messages_min_lead_time_seconds: 120,
    });

    expect(getScheduledMessageLimits(channel)).toEqual({
      maxLeadTimeSeconds: 3600,
      maxPerChannel: 3,
      maxPerUser: 7,
      minLeadTimeSeconds: 120,
    });
  });

  it('falls back to the default limits for missing fields', () => {
    const channel = createChannel();
    stubServerConfig(channel, { scheduled_messages_max_per_channel: 3 });

    expect(getScheduledMessageLimits(channel)).toEqual({
      ...DEFAULT_SCHEDULED_MESSAGE_LIMITS,
      maxPerChannel: 3,
    });
  });

  it('uses the default limits without a server config', () => {
    expect(getScheduledMessageLimits(createChannel())).toEqual(
      DEFAULT_SCHEDULED_MESSAGE_LIMITS,
    );
  });
});
