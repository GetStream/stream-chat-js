import { StableWSConnection } from './connection';
import WebSocket from 'isomorphic-ws';
import { LiteralStringForUnion, UnknownType } from './types';
export class Metrics {
  wsConsecutiveFailures: number;
  wsTotalFailures: number;
  constructor() {
    this.wsTotalFailures = 0;
    this.wsConsecutiveFailures = 0;
  }
}

export function buildWsFatalEvent<
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  UserType extends UnknownType = UnknownType
>(
  connection: StableWSConnection<ChannelType, CommandType, UserType>,
  event: WebSocket.CloseEvent,
) {
  return {
    err: {
      wasClean: event.wasClean,
      code: event.code,
      reason: event.reason,
    },
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
    start_ts: connection.connectionStartTs,
    end_ts: new Date().getTime(),
    auth_type: connection.authType,
    token: connection.tokenManager.token,
    user_id: connection.userID,
    user_details: connection.user,
    device: connection.device,
    client_id: connection.connectionID,
    ws_details: connection.ws,
    ws_consecutive_failures: connection.metrics.wsConsecutiveFailures,
    ws_total_failures: connection.metrics.wsTotalFailures,
    request_id: connection.requestID,
    online: typeof navigator !== 'undefined' ? navigator?.onLine : null,
    user_agent: typeof navigator !== 'undefined' ? navigator?.userAgent : null,
  };
}

export function buildWsSuccessAfterFailureEvent<
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  UserType extends UnknownType = UnknownType
>(connection: StableWSConnection<ChannelType, CommandType, UserType>) {
  return buildWsBaseInsight(connection);
}
