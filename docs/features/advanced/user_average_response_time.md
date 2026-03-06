The User Average Response Time feature enables users to view the average response time of other users in their public profiles. This metric helps set expectations for communication responsiveness, which is particularly valuable in marketplace applications where prompt responses are important for successful transactions.

## Configuration

To enable user response time tracking, set the `user_response_time_enabled` setting to `true`:

```js
// Enable user response time tracking
await client.updateAppSettings({
  user_response_time_enabled: true,
});
```

Once enabled, the `avg_response_time` field will be included in user responses and displayed in user profiles.

## Use Cases

### Marketplace Applications

- Buyers can see how quickly sellers typically respond before initiating contact
- Marketplaces can highlight responsive sellers with badges or sorting options
- Customer support teams can identify and reward highly responsive users

### Service Platforms

- Service providers can demonstrate their responsiveness to potential clients
- Users can select service providers based on communication expectations

### Customer Support Applications

- Display agent responsiveness to help manage customer expectations
- Create internal leaderboards based on response times

## How It Works

- The system tracks the time between replies in a channel and when they respond
- When a user sends a new message that isn't the first in a channel, the system calculates a new average
- This data is then displayed in the user's public profile or returned in the `avg_response_time` field
