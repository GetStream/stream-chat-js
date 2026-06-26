import * as scopedLogger from '@stream-io/logger';

export type ChatLoggerScope =
  | 'api-client'
  | 'channel'
  | 'channel-manager'
  | 'client'
  | 'connection'
  | 'connection-fallback'
  | 'message-composer'
  | 'offline-db'
  | 'state-store'
  | 'text-composer'
  | 'thread'
  | 'thread-manager'
  | 'token-manager'
  | 'upload-manager'
  | 'utils';

/**
 * @internal
 */
export type ScopedLogger = scopedLogger.Logger<ChatLoggerScope>;

export { LogLevelEnum } from '@stream-io/logger';
export type { ConfigureLoggersOptions, LogLevel, Sink } from '@stream-io/logger';

export const chatLoggerSystem = scopedLogger.createLoggerSystem<ChatLoggerScope>();
