import { StableWSConnection } from './connection';
import { LiteralStringForUnion, UnknownType } from './types';
import { randomId } from './utils';

export type InsightTypes = 'ws_fatal' | 'ws_success_after_failure' | 'http_hi_failed';
export class InsightMetrics {
  connectionStartTimestamp: number | null;
  wsConsecutiveFailures: number;
  wsTotalFailures: number;
  instanceClientId: string;

  constructor() {
    this.connectionStartTimestamp = null;
    this.wsTotalFailures = 0;
    this.wsConsecutiveFailures = 0;
    this.instanceClientId = randomId();
  }
}

export function buildWsFatalInsight<
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  UserType extends UnknownType = UnknownType
>(
  connection: StableWSConnection<ChannelType, CommandType, UserType>,
  event: Record<string, unknown>,
) {
  return {
    ...event,
    ...buildWsBaseInsight(connection),
  };
}

function buildWsBaseInsight<
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  UserType extends UnknownType = UnknownType
>(connection: StableWSConnection<ChannelType, CommandType, UserType>) {
  return {
    ready_state: connection.ws?.readyState,
    url: connection._buildUrl(connection.requestID),
    api_key: connection.apiKey,
    start_ts: connection.insightMetrics.connectionStartTimestamp,
    end_ts: new Date().getTime(),
    auth_type: connection.authType,
    token: connection.tokenManager.token,
    user_id: connection.userID,
    user_details: connection.user,
    device: connection.device,
    client_id: connection.connectionID,
    ws_details: connection.ws,
    ws_consecutive_failures: connection.insightMetrics.wsConsecutiveFailures,
    ws_total_failures: connection.insightMetrics.wsTotalFailures,
    request_id: connection.requestID,
    online: typeof navigator !== 'undefined' ? navigator?.onLine : null,
    user_agent: typeof navigator !== 'undefined' ? navigator?.userAgent : null,
    instance_client_id: connection.insightMetrics.instanceClientId,
  };
}

export function buildWsSuccessAfterFailureInsight<
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  UserType extends UnknownType = UnknownType
>(connection: StableWSConnection<ChannelType, CommandType, UserType>) {
  return buildWsBaseInsight(connection);
}
