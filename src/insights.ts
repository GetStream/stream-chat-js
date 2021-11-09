export type InsightsWsEvent = {
  auth_type: string;
  // eslint-disable-next-line
  device: any;
  end_ts: number;
  error: any;
  request_id: string;
  start_ts: number;
  token: string | undefined;
  // eslint-disable-next-line
  user_details: any;
  user_id: string;
  // eslint-disable-next-line
  ws_details: any;
  browser?: string;
  client_id?: string;
};
