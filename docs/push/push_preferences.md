Push preferences allow users to control how they receive push notifications. You can set preferences at both the user level (global preferences) and channel level (per-channel preferences), giving users fine-grained control over their notification experience.

## How Push Preferences Work

> [!WARNING]
> Users must be channel members to receive push notifications regardless of their preferences.


### Chat push preferences operate on two levels

- **User-level preferences**: These act as global preferences that apply to all channels for a user.
- **Channel-level preferences**: These override the global preferences for specific channels.

### Chat push preferences support three levels of notifications

- **all**: Receive all push notifications **(default)**.
- **mentions**: Receive push notifications only when mentioned.
- **none**: Do not receive push notifications.

Additionally, you can temporarily disable push notifications until a specific time using the `disabled_until` parameter.

### The system evaluates preferences in the following priority order

1. **Channel-level preferences** are checked first (if they exist for the specific channel).
2. If no channel-level preference exists, **user-level (global) preferences** are used.
3. If no preferences are set at all, the default behavior is "all".
4. **Temporary disabling**: If `disabled_until` is set and the current time is before that timestamp, notifications are disabled regardless of other preferences.

## Setting Push Preferences

### User-Level Preferences

Set global push preferences that apply to all channels for a user:

```js
// Set user-level preferences for multiple users
await client.setPushPreferences([
  {
    user_id: "user-1",
    chat_level: "mentions",
  },
  {
    user_id: "user-2",
    chat_level: "all",
  },
  {
    user_id: "user-3",
    chat_level: "none",
  },
]);
```

### Channel-Level Preferences

Set preferences for specific channels, which override user-level preferences:

```js
// Set channel-level preferences
await client.setPushPreferences([
  {
    user_id: "user-1",
    channel_cid: "messaging:general",
    chat_level: "none",
  },
  {
    user_id: "user-1",
    channel_cid: "messaging:announcements",
    chat_level: "all",
  },
  {
    user_id: "user-2",
    channel_cid: "messaging:general",
    chat_level: "mentions",
  },
]);
```

## Client-Side vs Server-Side Usage

### Client-Side Usage

When using client-side authentication, users can only update their own push preferences:

```js
// Client-side - can only update current user's preferences
await client.setPushPreferences([
  {
    // user_id is optional and will be automatically set to current user
    chat_level: "mentions",
  },
  {
    // Set preferences for a specific channel
    channel_cid: "messaging:general",
    chat_level: "all",
  },
]);
```

### Server-Side Usage

Server-side requests can update preferences for any user:

```js
// Server-side - can update preferences for any user
await serverClient.setPushPreferences([
  {
    user_id: "user-1",
    chat_level: "mentions",
  },
  {
    user_id: "user-2",
    chat_level: "all",
  },
]);
```

## Practical Examples

### 1: Creating a "Do Not Disturb" Mode

```js
// Disable all push notifications
await client.setPushPreferences([
  {
    user_id: "user-id",
    chat_level: "none",
  },
]);

// Later, re-enable all push notifications
await client.setPushPreferences([
  {
    user_id: "user-id",
    chat_level: "all",
  },
]);
```

### 2: Channel-Specific Notification Settings

You can set different preferences for each individual channel, allowing users to customize their notification experience on a per-channel basis.

```js
// Set different preferences for different channels
await client.setPushPreferences([
  {
    user_id: "user-id",
    channel_cid: "messaging:general",
    chat_level: "mentions", // Default: mentions only
  },
  {
    user_id: "user-id",
    channel_cid: "messaging:urgent-alerts",
    chat_level: "all", // Always notify for urgent alerts
  },
  {
    user_id: "user-id",
    channel_cid: "messaging:social-chat",
    chat_level: "none", // Never notify for social chat
  },
]);
```

### 3: Temporarily Disabling Push Notifications

You can temporarily disable push notifications until a specific time using the `disabled_until` parameter. This is useful for implementing "Do Not Disturb" periods or scheduled quiet hours.

```js
// Disable push notifications for 2 hours for a specific user
const twoHoursFromNow = new Date(Date.now() + 2 * 60 * 60 * 1000);

await client.setPushPreferences([
  {
    user_id: "user-1",
    chat_level: "all",
    disabled_until: twoHoursFromNow.toISOString(),
  },
]);

// Disable push notifications for a specific channel until tomorrow
const tomorrow = new Date();
tomorrow.setDate(tomorrow.getDate() + 1);
tomorrow.setHours(9, 0, 0, 0); // 9 AM tomorrow

await client.setPushPreferences([
  {
    user_id: "user-1",
    channel_cid: "messaging:general",
    chat_level: "all",
    disabled_until: tomorrow.toISOString(),
  },
]);
```

## Call Push Preferences

You can set preferences for call-related push notifications using the `call_level` field.

### Call push preferences support two levels of notifications

- **all**: Receive all call push notifications **(default)**.
- **none**: Do not receive call push notifications.

### Setting Call Push Preferences

```js
// Set call-level preferences with temporary disabling
const oneHourFromNow = new Date(Date.now() + 60 * 60 * 1000);

await client.setPushPreferences([
  {
    user_id: "user-1",
    call_level: "all",
    disabled_until: oneHourFromNow.toISOString(),
  },
]);
```
