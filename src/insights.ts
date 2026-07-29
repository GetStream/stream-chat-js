import axios from 'axios';
import type { StableWSConnection } from './connection';
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
 * Posts internal insights telemetry to the Stream insights endpoint. Not intended for end-user use;
 * kept isolated from the client/connection code/logic.
 *
 * @internal
 * @param insightType - The category of insight being reported (e.g. `'ws_fatal'`).
 * @param insights - The insight payload to send.
 */
export const postInsights = async (
  insightType: InsightTypes,
  insights: Record<string, unknown>,
) => {
  const maxAttempts = 3;
  for (let i = 0; i < maxAttempts; i++) {
    try {
      await axios.post(
        `https://chat-insights.getstream.io/insights/${insightType}`,
        insights,
      );
    } catch (e) {
      await sleep((i + 1) * 3000);
      continue;
    }
    break;
  }
};

export function buildWsFatalInsight(
  connection: StableWSConnection,
  event: Record<string, unknown>,
) {
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
    user_id: client.userId,
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
