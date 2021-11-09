export type InsightsWsEvent = {
  api_key: string;
  auth_type: string;
  // eslint-disable-next-line
  end_ts: number;
  request_id: string;
  start_ts: number;
  token: string | undefined;
  // eslint-disable-next-line
  user_details: any;
  user_id: string;
  ws_consecutive_failures: number;
  ws_total_failures: number;
  // eslint-disable-next-line
  browser?: string;
  client_id?: string;
  device?: any;
  err?: any;
  ws_details?: any;
};

export class Metrics {
  wsConsecutiveFailures: number;
  wsTotalFailures: number;
  constructor() {
    this.wsTotalFailures = 0;
    this.wsConsecutiveFailures = 0;
  }
}
