Message reminders let users schedule notifications for specific messages, making it easier to follow up later. When a reminder includes a timestamp, it's like saying "remind me later about this message," and the user who set it will receive a notification at the designated time. If no timestamp is provided, the reminder functions more like a bookmark, allowing the user to save the message for later reference.

Reminders require Push V3 to be enabled - see details [here](/chat/docs/node/push_template/)

## Enabling Reminders

The Message Reminders feature must be activated at the channel level before it can be used. You have two configuration options: activate it for a single channel using configuration overrides, or enable it globally for all channels of a particular type.

```js
// Enabling it for a channel
await channel.updatePartial({
  config_overrides: {
    user_message_reminders: true,
  },
});

// Enabling it for a channel type
const update = await client.updateChannelType("messaging", {
  user_message_reminders: true,
});
```

Message reminders allow users to:

- schedule a notification after given amount of time has elapsed
- bookmark a message without specifying a deadline

## Limits

- A user cannot have more than 250 reminders scheduled
- A user can only have one reminder created per message

## Creating a Message Reminder

You can create a reminder for any message. When creating a reminder, you can specify a reminder time or save it for later without a specific time.

```js
// Backend SDK
// Create a reminder with a specific due date
const reminder = await client.createReminder(
  "message-id",
  "user-id",
  new Date(Date.now() + 3600000),
);

// Create a "Save for later" reminder without a specific time
const reminder = await client.createReminder("message-id", "user-id");

// JavaScript SDK
// Create a reminder with a specific due date (direct API call)
await client.createReminder({
  messageId: "message-id",
  // Remind in offsetMs
  remind_at: new Date(new Date().getTime() + offsetMs).toISOString(),
});

// Create a reminder with a specific due date (client state optimistic update (no server-side use))
await client.reminders.upsertReminder({
  messageId: "message-id",
  remind_at: new Date(new Date().getTime() + offsetMs).toISOString(),
});

// Create a "Save for later" reminder without a specific time (direct API call)
await client.createReminder({
  messageId: "message-id",
});

// Create a "Save for later" reminder without a specific time (client state optimistic update (no server-side use))
await client.reminders.upsertReminder({
  messageId: "message-id",
});
```

## Updating a Message Reminder

You can update an existing reminder for a message to change the reminder time.

```js
// Backend SDK
// Update a reminder with a new due date
const updatedReminder = await client.updateReminder(
  "message-id",
  "user-id",
  new Date(Date.now() + 7200000),
);

// Convert a timed reminder to "Save for later"
const updatedReminder = await client.updateReminder(
  "message-id",
  "user-id",
  null,
);

// JavaScript SDK
// Update a reminder with a new due date (direct API call)
await client.updateReminder({
  messageId: "message-id",
  // Remind in newOffsetMs
  remind_at: new Date(new Date().getTime() + newOffsetMs).toISOString(),
  // in case of server-side integration, include the id of a user on behalf of which the reminder is created
  //user_id: 'some-user-id'
});

// Update a reminder with a new due date (client state optimistic update (no server-side use))
await client.reminders.upsertReminder({
  messageId: "message-id",
  // Remind in newOffsetMs
  remind_at: new Date(new Date().getTime() + newOffsetMs).toISOString(),
  // in case of server-side integration, include the id of a user on behalf of which the reminder is created
  //user_id: 'some-user-id'
});

// Convert a timed reminder to "Save for later" (direct API call)
await client.updateReminder({
  messageId: "message-id",
  remind_at: null,
  // in case of server-side integration, include the id of a user on behalf of which the reminder is created
  //user_id: 'some-user-id'
});

// Convert a timed reminder to "Save for later" (client state optimistic update (no server-side use))
await client.reminders.upsertReminder({
  messageId: "message-id",
  remind_at: null,
});
```

## Deleting a Message Reminder

You can delete a reminder for a message when it's no longer needed.

```js
// Backend SDK
// Delete the reminder for the message
await client.deleteReminder("message-id", "user-id");

// JavaScript SDK
// Delete a reminder for a message with id 'message-id' (direct API call)
await client.deleteReminder("message-id");

// Delete a reminder for a message with id 'message-id' (client state optimistic update (no server-side use))
await client.reminders.deleteReminder("message-id");
```

## Querying Message Reminders

The SDK allows you to fetch all reminders of the current user. You can filter, sort, and paginate through all the user's reminders.

```js
// Query reminders for a user (server-side)
const reminders = await client.queryReminders({ user_id: "user-id" });

// Query reminders with filters (server-side)
const reminders = await client.queryReminders({
  user_id: "user-id",
  filter: { channel_cid: "messaging:general" },
});

// JavaScript SDK
// Retrieve the first page of reminders for the current user (direct API call).
await client.queryReminders();

// For the client-side pagination there are two methods representing two directions of pagination

// Query the first page (client state optimistic update (no server-side use))
await client.reminders.queryNextReminders();
```

### Filtering Reminders

You can filter the reminders based on different criteria:

- `message_id` - Filter by the message that the reminder is created on.
- `remind_at` - Filter by the reminder time.
- `created_at` - Filter by the creation date.
- `channel_cid` - Filter by the channel ID.

The most common use case would be to filter by the reminder time. Like filtering overdue reminders, upcoming reminders, or reminders with no due date (saved for later).

```js
// Server-side SDK
// Filter overdue reminders
const overdueFilter = { remind_at: { $lt: new Date() } };
const overdueReminders = await client.queryReminders({
  user_id: "user-id",
  filter: overdueFilter,
});

// Filter upcoming reminders
const upcomingFilter = { remind_at: { $gt: new Date() } };
const upcomingReminders = await client.queryReminders({
  user_id: "user-id",
  filter: upcomingFilter,
});

// Filter reminders with no due date (saved for later)
const savedFilter = { remind_at: null };
const savedReminders = await client.queryReminders({
  user_id: "user-id",
  filter: savedFilter,
});

// JavaScript SDK
// Direct API call
// Create filter for overdue reminders
await client.queryReminders({
  filter: {
    remind_at: { $lte: new Date().toISOString() },
  },
  sort: {
    remind_at: -1, // sort from the most recently expired
  },
});

// Create filter for upcoming reminders
await client.queryReminders({
  filter: {
    remind_at: { $gt: new Date().toISOString() },
  },
  sort: {
    remind_at: 1, // sort from the nearest to expire
  },
});

// Create filter for reminders with no due date (saved for later)
await client.queryReminders({
  filter: {
    remind_at: null,
  },
  sort: {
    created_at: -1, // sort from the most recently created
  },
});

// Client-side calls with local state updates before starting the pagination.
// Setting sort or filters resets the pagination state

// Create filter for overdue reminders
client.reminders.paginator.filters = {
  remind_at: { $lte: new Date().toISOString() },
};
client.reminders.paginator.sort = {
  remind_at: -1, // sort from the most recently expired
};

// Create filter for upcoming reminders
client.reminders.paginator.filters = {
  remind_at: { $gt: new Date().toISOString() },
};
client.reminders.paginator.sort = {
  remind_at: 1, // sort from the nearest to expire
};
// Create filter for reminders with no due date (saved for later)

client.reminders.paginator.filters = {
  remind_at: null,
};
client.reminders.paginator.sort = {
  created_at: -1, // sort from the most recently created
};

// adjust the page size
client.reminders.paginator.pageSize = 15;
```

### Pagination

If you have many reminders, you can paginate the results.

```js
// Server-side SDK
// Load reminders with pagination
const reminders = await client.queryReminders({
  user_id: "user-id",
  limit: 10,
  offset: 0,
});

// Load next page
const nextReminders = await client.queryReminders({
  user_id: "user-id",
  limit: 10,
  offset: 10,
});

// JavaScript SDK
// Load the next page (direct API call).
await client.queryReminders({ filter, sort, limit, next }); // limit is the page size

// Load the previous page (direct API call).
await client.queryReminders({ filter, sort, limit, prev }); // limit is the page size

// For the client-side pagination there are two methods representing two directions of pagination

// Set the filter and (or) sort params - this resets the pagination
client.reminders.paginator.filters = filters;
client.reminders.paginator.sort = sort;

// Query the next page of reminders starting from 0 (client state optimistic update
await client.reminders.queryNextReminders();

// Query the previous page of reminders if already some reminders were queried previously
await client.reminders.queryPreviousReminders();
```

## Events

The following WebSocket events are available for message reminders:

- `reminder.created` - Triggered when a reminder is created
- `reminder.updated` - Triggered when a reminder is updated
- `reminder.deleted` - Triggered when a reminder is deleted
- `notification.reminder_due` - Triggered when a reminder's due time is reached

When a reminder's due time is reached, the server also sends a push notification to the user. Ensure push notifications are configured in your app.

```js
client.on("reminder.created", (event) => {
  console.log("Reminder created for message:", event.message_id);
});

client.on("reminder.updated", (event) => {
  console.log("Reminder updated for message:", event.message_id);
});

client.on("reminder.deleted", (event) => {
  console.log("Reminder deleted for message:", event.message_id);
});

client.on("notification.reminder_due", (event) => {
  console.log("Reminder due for message:", event.message_id);
});

// Unsubscribe when done
const { unsubscribe } = client.on("reminder.created", handler);
unsubscribe();
```

## Webhooks

The same events are available as webhooks to notify your backend systems:

- `reminder.created`
- `reminder.updated`
- `reminder.deleted`
- `notification.reminder_due`

These webhook events contain the same payload structure as their WebSocket counterparts. For more information on configuring webhooks, see the [Webhooks documentation](/chat/docs/node/webhook_events/).
