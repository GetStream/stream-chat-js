import type { Channel } from '../channel';
import type { ScheduledMessageLimits, ScheduledMessagesChannelConfig } from '../types';

export const DEFAULT_SCHEDULED_MESSAGE_LIMITS: ScheduledMessageLimits = {
  maxLeadTimeSeconds: 120 * 24 * 60 * 60,
  maxPerChannel: 10,
  maxPerUser: 100,
  minLeadTimeSeconds: 60,
};

export const getScheduledMessageLimits = (channel: Channel): ScheduledMessageLimits => {
  const config: ScheduledMessagesChannelConfig = channel.getConfig() ?? {};
  const {
    scheduled_messages_max_lead_time_seconds:
      maxLeadTimeSeconds = DEFAULT_SCHEDULED_MESSAGE_LIMITS.maxLeadTimeSeconds,
    scheduled_messages_max_per_channel:
      maxPerChannel = DEFAULT_SCHEDULED_MESSAGE_LIMITS.maxPerChannel,
    scheduled_messages_max_per_user:
      maxPerUser = DEFAULT_SCHEDULED_MESSAGE_LIMITS.maxPerUser,
    scheduled_messages_min_lead_time_seconds:
      minLeadTimeSeconds = DEFAULT_SCHEDULED_MESSAGE_LIMITS.minLeadTimeSeconds,
  } = config;

  return { maxLeadTimeSeconds, maxPerChannel, maxPerUser, minLeadTimeSeconds };
};
