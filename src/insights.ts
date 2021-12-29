import axios from 'axios';
import { StableWSConnection } from './connection';
import { randomId, sleep } from './utils';

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

/**
 * postInsights is not supposed to be used by end users directly within chat application, and thus is kept isolated
 * from all the client/connection code/logic.
 *
 * @param insightType
 * @param insights
 */
export const postInsights = async (insightType: InsightTypes, insights: Record<string, unknown>) => {
  const maxAttempts = 3;
  for (let i = 0; i < maxAttempts; i++) {
    try {
      await axios.post(`https://chat-insights.getstream.io/insights/${insightType}`, insights);
    } catch (e) {
      await sleep((i + 1) * 3000);
      continue;
    }
    break;
  }
};

export function buildWsFatalInsight(connection: StableWSConnection, event: Record<string, unknown>) {
  return {
    ...event,
    ...buildWsBaseInsight(connection),
  };
}

function buildWsBaseInsight(connection: StableWSConnection) {
  const { client } = connection;
  return {
    ready_state: connection.ws?.readyState,
    url: connection._buildUrl(),
    api_key: client.key,
    start_ts: client.insightMetrics.connectionStartTimestamp,
    end_ts: new Date().getTime(),
    auth_type: client.getAuthType(),
    token: client.tokenManager.token,
    user_id: client.userID,
    user_details: client._user,
    device: client.options.device,
    client_id: connection.connectionID,
    ws_details: connection.ws,
    ws_consecutive_failures: client.insightMetrics.wsConsecutiveFailures,
    ws_total_failures: client.insightMetrics.wsTotalFailures,
    request_id: connection.requestID,
    online: typeof navigator !== 'undefined' ? navigator?.onLine : null,
    user_agent: typeof navigator !== 'undefined' ? navigator?.userAgent : null,
    instance_client_id: client.insightMetrics.instanceClientId,
  };
}

export function buildWsSuccessAfterFailureInsight(connection: StableWSConnection) {
  return buildWsBaseInsight(connection);
}
