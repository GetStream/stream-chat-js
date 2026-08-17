import type { NotificationManagerConfig } from './types';
import { deepFreezeConfig } from '../configuration/deepFreezeConfig';

const DURATION_MS = 3000 as const;

export const DEFAULT_NOTIFICATION_MANAGER_CONFIG: NotificationManagerConfig =
  deepFreezeConfig({
    durations: {
      error: DURATION_MS,
      info: DURATION_MS,
      success: DURATION_MS,
      warning: DURATION_MS,
    },
  });
