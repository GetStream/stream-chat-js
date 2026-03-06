Stream applies rate limits to protect both your application and our infrastructure. Rate limits prevent:

- Integration issues or abuse from degrading your app's performance (excessive API calls trigger client-side events)
- Resource consumption beyond what is provisioned for your plan
- Common integration mistakes, such as opening multiple WebSocket connections per user

Rate limits are applied per **API endpoint** and **platform** on a 1-minute window. Different platforms (iOS, Android, Web, Server) have independent counters for each endpoint.

> [!NOTE]
> If 6,000 iOS users and 6,000 Android users connect within one minute, no rate limit is triggered. The 10,000/minute connect limit applies independently to each platform.


> [!NOTE]
> **Dynamic Rate Limiting**: Rate limits may be adjusted based on overall platform load and your application's individual usage patterns for query endpoints. During periods of high demand, the platform may temporarily reduce rate limits to ensure stability and fair resource allocation for all users. Monitor the `X-RateLimit-*` headers in API responses to track your current limits.


## Inspecting Rate Limits

Check your current rate limit quotas and usage in the [dashboard](https://dashboard.getstream.io) or via the API.

```js
// Server-side platform only
const limits = await client.getRateLimits({ serverSide: true });

// All platforms
const limits = await client.getRateLimits();

// Specific platforms
const limits = await client.getRateLimits({ ios: true, android: true });

// Specific endpoints
const limits = await client.getRateLimits({
  endpoints: ["QueryChannels", "SendMessage"],
});
```

The response includes the 1-minute limit, remaining quota, and window reset timestamp.

## Rate Limit Headers

All API responses include rate limit information in headers.

| Header                | Description                                        |
| --------------------- | -------------------------------------------------- |
| X-RateLimit-Limit     | Total limit for the requested resource (e.g. 5000) |
| X-RateLimit-Remaining | Remaining requests in current window (e.g. 4999)   |
| X-RateLimit-Reset     | When the current window resets (Unix timestamp)    |

## Types of Rate Limits

### User Rate Limits

Each user is limited to **60 requests per minute** per endpoint and platform. This prevents a single user from consuming your entire application quota. Your server is not subject to user rate limits.

### App Rate Limits

App rate limits apply per endpoint and platform combination. Stream supports four platforms:

| Platform | SDKs                                  |
| -------- | ------------------------------------- |
| Server   | Node, Python, Ruby, Go, C#, PHP, Java |
| Android  | Kotlin, Java, Flutter, React Native   |
| iOS      | Swift, Flutter, React Native          |
| Web      | React, Angular, JavaScript            |

Rate limits are not shared across platforms. If a server-side script hits a rate limit, your mobile and web applications are unaffected.

App rate limits are enforced both per minute and per second. The per-second limit equals the per-minute limit divided by 30 to allow for bursts.

When a rate limit is exceeded, all calls from the same app, platform, and endpoint return HTTP status `429`.

## Handling Rate Limit Errors

When you receive a `429` status code, implement exponential back-off retry logic. Use the `X-RateLimit-Reset` header to determine when to retry.

### Avoiding Rate Limits

1. **Add delays to scripts** - The most common cause of rate limits. Add timeouts between successive API calls in batch scripts or cronjobs.

2. **Use batch endpoints** - Instead of 100 individual calls, use [batch endpoints](</chat/docs/%3Cframework%3E/update_users/#server-side-user-updates-(batch/)>) to update multiple users in one request.

3. **Check client-side rendering logic** - Infinite pagination bugs or other client-side issues can trigger excessive API calls.

4. **Avoid redundant queries** - Channel creation is an upsert operation. Do not call `QueryChannels` to check if a channel exists before creating it. See [Query Channels](/chat/docs/node/query_channels/).

5. **Use one WebSocket per user** - Multiple WebSocket connections per user cause performance issues, billing problems, and unexpected behavior. See [Initialization & Users](/chat/docs/node/init_and_users/).

6. **Follow livestream best practices** - High-volume messaging scenarios require additional optimization. See [Livestream Best Practices](/chat/docs/node/livestream_best_practices/).

### Requesting Higher Limits

- **Standard plans** - Stream may increase limits after reviewing your integration to confirm optimal usage of default limits.
- **Enterprise plans** - Stream reviews your architecture and sets appropriate limits for your production application.

## Rate Limits by Endpoint

Default rate limits for self-serve plans (per minute, per platform).

| API Request            | Limit/min |
| ---------------------- | --------- |
| Connect                | 10,000    |
| Get or Create Channel  | 10,000    |
| Get App                | 10,000    |
| Mark All Read          | 10,000    |
| Mark Read              | 10,000    |
| Query Channels         | 10,000    |
| Send Event             | 10,000    |
| Create Guest           | 1,000     |
| Delete Message         | 1,000     |
| Delete Reaction        | 1,000     |
| Get Message            | 1,000     |
| Get Reactions          | 1,000     |
| Get Replies            | 1,000     |
| Query Users            | 1,000     |
| Run Message Action     | 1,000     |
| Send Message           | 1,000     |
| Send Reaction          | 1,000     |
| Stop Watching Channel  | 1,000     |
| Update Message         | 1,000     |
| Upload File            | 1,000     |
| Upload Image           | 1,000     |
| Ban                    | 300       |
| Create Device          | 300       |
| Edit Users             | 300       |
| Flag                   | 300       |
| Hide Channel           | 300       |
| Mute                   | 300       |
| Query Members          | 300       |
| Search                 | 300       |
| Show Channel           | 300       |
| Unban                  | 300       |
| Unflag                 | 300       |
| Unmute                 | 300       |
| Update Channel         | 300       |
| Update Users           | 300       |
| Update Users (Partial) | 300       |
| Activate User          | 60        |
| Check Push             | 60        |
| Create Channel Type    | 60        |
| Deactivate User        | 60        |
| Delete Channel         | 60        |
| Delete Channel Type    | 60        |
| Delete Device          | 60        |
| Delete File            | 60        |
| Delete User            | 60        |
| Export Channel         | 60        |
| Export User            | 60        |
| Get Channel Type       | 60        |
| List Channel Types     | 60        |
| List Devices           | 60        |
| Truncate Channel       | 60        |
| Update App             | 60        |
| Update Channel Type    | 60        |

> [!NOTE]
> All endpoints also enforce the user rate limit of 60 requests per minute per user. Rate limits can be adjusted based on your use case and plan.
