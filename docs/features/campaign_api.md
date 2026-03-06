The Campaign API makes it easy to send a message or send an announcement to a large group of users and/or channels. You can personalize the message using templates. For small campaigns of less than 10,000 users, you can directly send the campaign. If you need to maintain larger segments of users or channels that's also supported. The potential applications of this feature are virtually limitless, yet here are some specific examples:

> [!WARNING]
> The Campaign API runs with administrative privileges and does not validate permissions - any valid user ID can be used as the sender_id. Be sure to implement appropriate access controls in your application code.


- **Marketing Campaigns** : Send promotional messages or announcements to a targeted audience.

- **Product Updates** : Inform users about new features, bug fixes, or enhancements to your product.

- **Event Reminders:** Send reminders about upcoming events, webinars, or conferences to registered attendees.

- **Customer Surveys** : Engage with your user base by sending out surveys or feedback forms to gather feedback.

- **Announcements** : Broadcast important company news, policy changes, or updates to stakeholders.

- **Campaign Scheduling** : Plan and schedule campaigns in advance to ensure timely delivery and maximize impact

Under the hood, campaigns send messages to the specified **target** audience and do so on behalf of a designated user ( **sender** ). If there are no existing channels to deliver messages to the target users, campaigns can automatically create them. Additionally, campaigns might generate more events for creating channels and sending new messages. These events can be sent as **In-App** messages and/or **Push Notifications** to the end users, and as **Webhook** calls to your backend server.

The Campaigns API is designed for backend-to-backend interactions and is not intended for direct use by client-side applications.

By default we have rate limits in place to ensure that campaigns don't cause stability issues. The throughput supports sending campaigns with tens of millions of messages. Be sure to reach out to support to collaborate with our team and raise your limits.

> [!WARNING]
> All paid plans include 3 times the procured MAU volume in message capacity. Ex: if you have a 100,000 MAU plan you can send 300,000 campaign messages each month. If you need to send more messages than this limit reach out to our sales team


## Sending a Campaign

Here's a basic example of how to send a campaign. Note that the sender_id can be any valid user ID since the Campaign API bypasses normal permission checks.

> [!NOTE]
> You can send the campaign immediately or schedule it to start at a later time. You can also stop the campaign at any time.


```js
const segmentId = '<segment-id>'; // segment_id is optional
// Create a dynamic user segment based on the filter provided.
// e.g., following segment will include all users created after 2020-01-01
const segment = client.segment('user', segmentId, {
  name: 'New App Users Segment (optional)',
  filter: {
    created_at: {
      $gte: '2020-01-01T00:00:00Z',
    }
  }
})
await segment.create();

const campaign_id = '<campaign-id>'; // campaign_id is optional
const campaign = client.campaign(campaign_id, {
  // Users targeted by following segment will receive the message
  segment_ids: [segmentId],
  // Alternatively, instead of segment_ids, you can also provide user_ids to send the message to specific users
  // user_ids: ['<user-id-1>', '<user-id-2>'],
  sender_id: '<user-id-of-sender>', // Mandatory
  // Optional, specifies whether to 'exclude' or 'include' the sender from the channel. Defaults to null.
  sender_mode: 'exclude',
  // Optional, controls the visibility of the new channels for the sender ('hidden' or 'archived'). Defaults to null
  sender_visibility: 'hidden',
  name: 'Campaign name', // Optional
  description: 'Campaign Description', // Optional
  message_template: {
    text: 'Hello {{receiver.name}}!', // Mandatory, message text template
    attachments: [], // Optional, message attachments
    poll_id: 'poll-id', // Optional, send a poll with message
    custom: { promotional: true }, // Optional, custom fields will be added to message object received by the receiver.
  },
  show_channels: true, // Optional, show hidden channels for receiver
  create_channels: true, // Optional, create channel between sender and receiver if not already present
  // channel_template is required if create_channels is true
  channel_template: {
    // Mandatory, channel type
    type: 'messaging',
    // Optional, template for channel id for channel creation
    // if not provided, channel id will be generated on server side
    id: '{{receiver.id}}-{{sender.id}}',
    // Optional, custom fields will be added to channel object
    custom: { promotional: true },
    // Optional, if provided (and multi tenancy is enabled), you can limit accessibility to the channel only to a team
    team: 'kansas-city-chiefs',
    // Optional, if provided following members will be added to each of the newly created channel
    // if not provided, only sender and receiver will be added to the channel
    // You can use this to add e.g., moderator or admin to each newly created channel
    members: ['user-id-1', 'user-id-2'],
    // Alternatively, you can use members_template to specify channel roles and custom data for members.
    // members and members_template cannot be used together.
    // members_template: [
    //   {
    //     user_id: 'user-id-1',
    //     channel_role: 'channel_moderator', // Optional
    //     custom: { key1: 'value1' }, // Optional
    //   },
    //   {
    //     user_id: 'user-id-2',
    //     channel_role: 'channel_moderator', // Optional
    //   },
    // ]
  }
})

await campaign.create();

// Start sending messages to targeted users
await campaign.start();

// Alternatively you can also schedule the campaign to start at a later time and stop at a specific time
await campaign.start({
  scheduledFor: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()
  stopAt: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString()
});
```

The campaign exposes methods to create, get, update, start, stop delete and query campaigns.

```js
await campaign.create(); // create a campaign based on data passed above
await campaign.get(); // check the status of the campaign
await campaign.update({
  segment_ids: ["a869fc0f-2e7e-4fe0-8651-775c892c1718"],
  sender_id: "Updated-user-id-of-sender", // mandatory
  sender_mode: "include", // optional
  sender_visibility: "archived", // optional
  name: "Updated name (optional)",
  message_template: {
    text: "Updated Hello {{receiver.name}}!",
  },
}); // updates the campaign data

// You can start a campaign immediately, which will start sending messages to the users in the segment(s) immediately.
await campaign.start();

// Or you can schedule a campaign to start at a later time.
await campaign.start({
  // start campaign in 48 hours
  scheduledFor: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(), // optional, campaign will start running after this time
  // automatically stop the campaign after 72 hours
  stopAt: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(), // optional, campaign will stop running after this time
});

await campaign.stop(); // stops the campaign
await campaign.delete(); // delete the campaign

const filter = {
  segments: { $in: ["<segment-id>"] },
};
const sort = [{ field: "created_at", direction: -1 }];
const options = {
  limit: 30,
  next: "<encoded_next>",
};
const result = client.queryCampaigns(filter, sort, options); // query campaigns
// result.campaigns is an array of campaigns
// result.next is a cursor for the next page of campaigns
```

## Creating a Campaign

Here are the supported options for creating a campaign:

| name              | type    | description                                                                                                                                                                                                                                                                                                                 | default | optional |
| ----------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | -------- |
| id                | string  | Specify an ID for your campaign                                                                                                                                                                                                                                                                                             | -       | ✓        |
| name              | string  | The name of the campaign                                                                                                                                                                                                                                                                                                    | -       | ✓        |
| description       | string  | The description for the campaign                                                                                                                                                                                                                                                                                            | -       | ✓        |
| segment_ids       | string  | A list of segments to target. Max 25. Use either segment_ids or user_ids to target your campaign. The campaign will automatically remove duplicates if users are present in more than 1 segment.                                                                                                                            | -       | ✓        |
| user_ids          | string  | A list of user ids to target. Max 10,000 users, for bigger campaigns create a user segment first. Use either user_ids or segment_ids to target your campaign.                                                                                                                                                               | -       | ✓        |
| sender_id         | string  | The user id of the user that's sending the campaign. Note: The sender_id is not checked against the permission system - any valid user ID can be used.                                                                                                                                                                      | -       |          |
| sender_mode       | string  | Controls how the campaign sender is added to channels. Possible values:<br>- `"exclude"`: Don't add sender to any channels<br>- `"include"`: Add sender to all channels (new and existing)<br>When parameter is omitted (default behavior): Add sender to new channels only.                                                | -       | ✓        |
| sender_visibility | string  | Controls the visibility of the new channels for the sender when the sender is included as a member. Possible values:<br>- `"hidden"`: New channels will be hidden for the sender<br>- `"archived"`: New channels will be archived for the sender<br>When parameter is omitted (default behavior): All channels are visible. | -       | ✓        |
| message_template  | string  | A message template                                                                                                                                                                                                                                                                                                          | -       |          |
| show_channels     | boolean | If **true** then hidden channels will be shown for receiver                                                                                                                                                                                                                                                                 | false   | ✓        |
| create_channels   | boolean | If **true** then channels will be created if they don't exist yet                                                                                                                                                                                                                                                           | false   | ✓        |
| channel_template  | string  | The template to use when creating a channel                                                                                                                                                                                                                                                                                 | -       | ✓        |
| skip_push         | boolean | Do not send push notifications for events generated by this campaign, such as message.new or channel.created                                                                                                                                                                                                                | false   | ✓        |
| skip_webhook      | boolean | Do not call webhooks for events generated by this campaign, such as message.new or channel.created                                                                                                                                                                                                                          | false   | ✓        |

Note that campaigns can only be sent once. If you want to repeate the same campaign you have to create a new campaign object with the same template and segment ids.

### Message Template

The message template uses Django/Jinja style variables. So you can use {{ myvariable }} to customize the message. The following fields are available:

| VarIABLE | Description                                                                                               |
| -------- | --------------------------------------------------------------------------------------------------------- |
| Sender   | User object that's sending this campaign                                                                  |
| Receiver | The person receiving the message. This is only available in 1-1 channels, and not when sending to a group |
| Channel  | The channel the message is being sent to                                                                  |

So for example you could use a template like: "Hi {{ receiver.name }} welcome to the community". Messages sent by the campaign API will automatically contain the campaign_id custom field and will have type set to regular.

```json
{
  "text": "{{ sender.name }} says hello!",
  "custom": {
   "campaign_data": {{ custom }},
  },
  "attachments": [{
   "type": "image", "url": "https://path/to/image.jpg"
  }],
  "poll_id": "poll-id",
}
```

### Channel Template

Here's an example channel template. It enables the campaign API to find the right channel for a recipient and sender.

```json
{
  "type": "messaging", // channel type is required
  "id": "{{receiver.id}}-{{sender.id}}",
  "team": "kansas-city-chiefs", // optional, if provided (and multi tenancy is enabled), you can limit accessibility to the channel only to a team
  "custom": {
    // optionally add custom data to channels (only when creating)
  }
}
```

## Querying Campaigns

You can query campaigns based on extensive set of filters and sort options

```js
// Query campaigns with which are scheduled or in progress
const filter = { status: { $in: ["scheduled", "in_progress"] } };
const sort = [{ field: "created_at", direction: -1 }];
const options = { limit: 10 };

// query first page
const { campaigns, next } = await client.queryCampaigns(filter, sort, options);

// query next page
const res = await client.queryCampaigns(filter, sort, { ...options, next });
```

Following code sample provides various examples of filters:

```js
const filterStatus = { status: { $in: ["scheduled", "in_progress"] } };
const filterID = { id: { $in: ["campaign_id_1", "campaign_id_2"] } };
const filterBySegments = {
  segments: { $in: ["segment_id_1", "segment_id_2"] },
};
const filterByName = { name: { $in: ["campaign_name_1", "campaign_name_2"] } };
const filterBySender = { sender_id: { $in: ["sender_1", "sender_2"] } };
const filterByCreated = { created_at: { $gte: "2021-01-01T00:00:00Z" } };
const filterByUpdated = { updated_at: { $gte: "2021-01-01T00:00:00Z" } };
```

## Paginating Campaign Users

If you created a campaign targeting a specific list of user IDs, you can retrieve the targeted users using pagination.
The Campaign API limits each response to 1,000 users.
To access additional users beyond this limit, you can paginate using the `limit` and `next` parameters, as shown below.

```js
// Let's say you have a campaign with 2000 users
const campaign = client.campaign("<campaign-id>");

// Fetch camapgin with the first 1000 users
const res1 = await campaign.get({
  users: {
    limit: 1000,
  },
});
const firstPageUsers = res1.campaign.users;

// Fetch campaign with the next 1000 users
const res2 = await campaign.get({
  users: {
    limit: 1000, // 1000 is max allowed limit
    next: res1.users.next,
    // or use prev to get previous page
    prev: res1.users.prev,
  },
});
const secondPageUsers = res2.campaign.users;
```

## Segments for Campaigns

Segments enable you to target large groups of users. You can either specify a large list of user ids, channel ids, or filters that search the user database. There is no limit on how many users you can have in a segment.

### User Segments

```js
const type = <'user'|'channel'>; // mandatory
const id = "<segment_id>"; // optional
const data = {
	filter: {
		team:'commonteam'
	},
	name: 'segment_name',
	description: 'segment_description'
} // optional

const segment = client.segment(type, id, data)
```

You can create, update or delete segments. You can also add users to the segment. The above approach specified a filter to query the users. Alternatively you can also manually provide a list of user ids.

```js
const segmentType = "user"; // mandatory
const segmentId = "<segment_id>"; // optional
const data = {
	filter: {
		//...
	}
} // optional
let userSegment = client.segment(segmentType, segmentId, data);

await userSegment.create()
await userSegment.get()
await userSegment.addTargets(userIds); // a max of 10,000 users can be added in 1 API call
await userSegment.removeTargets(userIds); // no error if doesn't exits
await userSegment.targetExists(userId); // checks if target exists in the segment
await userSegment.queryTargets(
	{ "target_id": {"$gte": <user_id>} },
	[{ field: "target_id", direction: -1 }],
	{
	 limit: 10000,
	 next: '<encoded_next>', // or prev
	}
); // queries targets in the segment
	await userSegment.delete(); // deletes segment
```

The example below shows how to create a segment with **all users** :

```js
const data = {
  name: "everyone",
  all_users: true,
};
let userSegment = client.segment("user", data);
await userSegment.create();
```

**User** segment supports following options as part of **data** :

| name        | type    | description                                           | default | optional |
| ----------- | ------- | ----------------------------------------------------- | ------- | -------- |
| name        | string  | Name for the segment                                  | -       | ✓        |
| description | string  | Description of the segment                            | -       | ✓        |
| filter      | json    | Filter criteria for target users of this segment      | null    | ✓        |
| all_users   | boolean | If true, segment will target all the users of the app | false   | ✓        |

### Channel Segments

You can also create segments of channels to target. If you target a channel the “receiver” message template variable will not be available.

```js
// note: channel template is not required for channel segment
let segmentType = "channel";
let segmentId = "segmentId";
let data = {
  name: "segment_name",
  description: "segment_description",
  filter: {
    team: "commonteam",
  },
};
let channelSegment = client.segment(segmentType, segmentId, data);
await channelSegment.create();
await channelSegment.get();
await channelSegment.addTargets(channelCids);
await channelSegment.removeTargets(channelCids);
await channelSegment.targetExists(channelCid);
await channelSegment.delete();
```

The example below shows how to create a segment which targets all the channels where sender is member of

```js
const data = {
  name: "All my existing chats",
  all_sender_channels: true,
};
let channelSegment = client.segment("channel", data);
await channelSegment.create();
```

**Channel** segment supports following options as part of the **data** :

| name                | type    | description                                                             | default | optional |
| ------------------- | ------- | ----------------------------------------------------------------------- | ------- | -------- |
| name                | string  | Name of the segment                                                     | -       | ✓        |
| description         | string  | Description for the segment                                             | -       | ✓        |
| filter              | json    | Filter criteria for target channels of this segment                     | null    | ✓        |
| all_sender_channels | boolean | If true, segment will target all the channels where sender is member of | false   | ✓        |

## Getting Segment

For getting a specified segment you may use the following code snippet:

```js
const segment = client.segment(segmentType, segmentId);
const response = await segment.get();
```

The received `response` will contain the segment data:

| name                | type    | description                                                              | default | optional |
| ------------------- | ------- | ------------------------------------------------------------------------ | ------- | -------- |
| id                  | string  | ID of the segment                                                        | -       |          |
| type                | string  | Type of the segment ("user" or "channel")                                | -       |          |
| name                | string  | Name of the segment                                                      | ""      |          |
| description         | string  | Description of the segment                                               | ""      |          |
| filter              | object  | Filter criteria for target users or channels of this segment             | nil     |          |
| all_users           | boolean | If true, then segment targets all the users of the app                   | false   |          |
| all_sender_channels | boolean | If true, then segment targets all the channels where sender is member of | false   |          |
| size                | integer | Number of the targets for this segment                                   | 0       |          |
| created_at          | string  | Date when the segment was created                                        | -       |          |
| updated_at          | string  | Date when the segment was update                                         | -       |          |
| deleted_at          | string  | Date when the segment was deleted                                        | -       | ✓        |

Please, take into account that:

- Parameters `filter` , `all_users` and `all_sender_channels` are mutually exclusive.

- The `size` is calculated asynchronously when either `filter` or `all_users` is set.

- The `size` is calculated in place if you add targets manually using `segment.addTargets(...)` function

> [!WARNING]
> The `size` won't be calculated at all if `all_sender_channels` is set to `true` . If you want the `size` to be calculated for the `channel` segment types, please provide the `filter` instead.


## Sending a Campaign to Segments - Full example

The example below shows you how to create a segment and send a campaign to it

### **Create a segment for user’s in the USA**

```js
const data = {
	name: 'People in the USA'
	filter: {
		country: 'USA'
	}
};
const segment = client.segment('user', data);
await segment.create();
```

### **Message the above segment**

> [!NOTE]
> Remember that the Campaign API allows using any valid user ID as sender_id regardless of permissions. Make sure to validate in your application code that the requesting user has appropriate permissions to send campaigns on behalf of other users.


```js
const campaign = client.campaign({
  segment_ids: [segment.id],
  sender_id: "user-id-of-sender", // mandatory
  name: "Campaign name (optional)",
  description: "Optional description",
  message_template: {
    text: "Hi {{ receiver.name }} I'm {{ sender.name }}!",
  },
});
await campaign.create();
await campaign.start();

// Alternatively you can schedule the campaign to start at a later time.
// Also you can stop the campaign at a specific time. E.g.,
await campaign.start({
  scheduledFor: "2021-12-31T23:59:59Z",
  stopAt: "2022-01-01T23:59:59Z",
});
```

### **Check the status of the campaign**

```js
const res = await campaign.get();
console.log(res.campaign.status); // "draft" | "scheduled" | "stopped" | "completed" | "in_progress"
```

Campaign status have following possible values:

- `draft` - Campaign has been created but not scheduled

- `scheduled` - Campaign has been scheduled

- `stopped` - Campaign has been stopped manually or using stop_at option

- `completed` - Campaign has succesfully completed

- `in_progress` - Campaign is running at the moment

Sending campaigns is fast but not realtime. It can take several minutes for your campaign to complete sending. A campaign with 60,000 users typically takes ~1 minute to send.

### Campaign Stats

The campaign API returns stats when you call campaign.get.

```js
// await campaign.get()
{
 "id": "...",
 "stats": {
  "started_at": "2021-02-01 00:00:00",
  "completed_at": "2024-23-02 00:00:00",
  "messages_sent": 1000,
  "channels_created": 10,
  "stats_progress": 0.97,
  "stats_users_sent": 1000, // number of users the campaign message was sent to
  "stats_users_read": 567   // number of users who read the campaign message
 }
}
```

### Webhooks

Your app will often want to know when a campaign API starts or stops. Your server hooks will receive an event when the campaign starts and another when the campaign is completed.

Both events include the full campaign object with its status and stats.

```json
{
  "type": "campaign.started",
  "campaign": {
    "status": "running",
    "stats": {...},
    ...
  },
  "created_at": "2024-23-02 00:00:00"
}

{
  "type": "campaign.completed",
  "campaign": {
    "status": "completed",
    "stats": {...},
    ...
  },
  "created_at": "2024-23-02 00:00:00"
}
```

### Updating a large Segment

client.querySegments allows you to paginate over a large segment with up to 10,000 results per page.

```js
const filter = {
  name: "<name>",
};
const sort = [{ field: "created_at", direction: -1 }];
const options = {
  limit: 30,
  next: "<encoded_next>",
};
let response = await client.querySegments(filter, sort, options);
```

The list of users is sorted by ID ASC. This means that you can easily compare it to your internal list of users in this segment, and call segment.addTargets/addTargets as needed.

Page updated Feb 20th 5:42
