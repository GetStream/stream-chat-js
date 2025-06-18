import type { NotificationManagerConfig } from './types';

const DURATION_MS = 3000 as const;

export const DEFAULT_NOTIFICATION_MANAGER_CONFIG: NotificationManagerConfig = {
  durations: {
    error: DURATION_MS,
    info: DURATION_MS,
    success: DURATION_MS,
    warning: DURATION_MS,
  },
};
