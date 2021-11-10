import { StableWSConnection } from './connection';
import WebSocket from 'isomorphic-ws';

export class Metrics {
  wsConsecutiveFailures: number;
  wsTotalFailures: number;
  constructor() {
    this.wsTotalFailures = 0;
    this.wsConsecutiveFailures = 0;
  }
}

export function generateWsFatalEvent(
  connection: StableWSConnection,
  event: WebSocket.CloseEvent,
) {
  return {
    url: connection._buildUrl(connection.requestID),
    api_key: connection.apiKey,
    start_ts: connection.connectionStartTs,
    end_ts: new Date().getTime(),
    err: {
      wasClean: event.wasClean,
      code: event.code,
      reason: event.reason,
    },
    auth_type: connection.authType,
    token: connection.tokenManager.token,
    user_id: connection.userID,
    user_details: connection.user,
    device: connection.device,
    client_id: connection.connectionID,
    ws_details: connection.ws,
    ws_consecutive_failures: connection.metrics.wsConsecutiveFailures,
    ws_total_failures: connection.metrics.wsTotalFailures,
    // @ts-ignore
    request_id: connection.requestID,
  };
}

export function generateWsSuccessAfterFailureEvent(connection: StableWSConnection) {
  return {
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
  };
}
