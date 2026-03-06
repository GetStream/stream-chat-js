## Enable Integration

To seamlessly integrate Stream metrics with your Datadog account, follow these two essential steps. This feature is included with Stream's Enterprise pricing plans.

1. Identify your Datadog account's DD_SITE and DD_API_KEY:

2. Request the Stream team to enable this feature by [contacting support](https://getstream.io/contact/support/)

Navigate to your [Stream Dashboard](https://dashboard.getstream.io/) and follow these instructions:

1. Go to the left-side menu and select "Chat Messaging" -> "External Integration."

2. Save your personal API_KEY and DD_SITE.

If you are uncertain about your DD_SITE, consult [this](https://docs.datadoghq.com/getting_started/site/#access-the-datadog-site) table in the Datadog documentation to ensure you select the correct value.

## Metrics Explanation

For now, we provide basically two important metrics: hits and latency.

| Name                            | Description                                               | Type  | Tags                        |
| ------------------------------- | --------------------------------------------------------- | ----- | --------------------------- |
| **streamio.chat.hits**          | Number of hit for API for chat/video                      | Count | host, app_id, action,status |
| **streamio.chat.latency.count** | Number of latency value within a sink before push metrics | Rate  | host, app_id, action        |
| streamio.chat.latency.median    | Median value calculated within a sink                     | Gauge | host, app_id, action        |

## Tag Explanation

| Tag    | Description                    | Example                       |
| ------ | ------------------------------ | ----------------------------- |
| host   | Hostname of the server         | stream-dublin-<random-number> |
| app_id | App ID for the customer        | 123456                        |
| action | Action name of the API/Webhook | send_message                  |
| status | Status code of the API/Webhook | 200                           |
