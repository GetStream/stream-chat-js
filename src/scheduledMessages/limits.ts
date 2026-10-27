import type { Channel } from '../channel';
import type { ScheduledMessageLimits } from '../types';

export const DEFAULT_SCHEDULED_MESSAGE_LIMITS: ScheduledMessageLimits = {
  maxLeadTimeSeconds: 120 * 24 * 60 * 60,
  maxPerChannel: 10,
  maxPerUser: 100,
  minLeadTimeSeconds: 60,
};

export const getScheduledMessageLimits = (channel: Channel): ScheduledMessageLimits => {
  const config = channel.getConfig();
  return {
    maxLeadTimeSeconds:
      config?.scheduled_messages_max_lead_time_seconds ??
      DEFAULT_SCHEDULED_MESSAGE_LIMITS.maxLeadTimeSeconds,
    maxPerChannel:
      config?.scheduled_messages_max_per_channel ??
      DEFAULT_SCHEDULED_MESSAGE_LIMITS.maxPerChannel,
    maxPerUser:
      config?.scheduled_messages_max_per_user ??
      DEFAULT_SCHEDULED_MESSAGE_LIMITS.maxPerUser,
    minLeadTimeSeconds:
      config?.scheduled_messages_min_lead_time_seconds ??
      DEFAULT_SCHEDULED_MESSAGE_LIMITS.minLeadTimeSeconds,
  };
};
