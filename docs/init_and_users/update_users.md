The Stream user object is central to the chat system and appears in many API responses, effectively following the user throughout the platform. Only an `id` is required to create a user but you can store additional custom data. We recommend only storing what is necessary for Chat such as a username and image URL.

## Client-side User Creation

The `connectUser` method automatically creates _and_ updates the user. If you are looking to onboard your userbase lazily, this is typically a perfectly viable option.

However, it is also common to add your users to Stream before going Live and keep properties of your user base in sync with Stream. For this you'll want to use the `upsertUsers` function server-side and send users in bulk.

## Creating and Updating Users Server-Side

The `upsertUser` method creates or updates a user, replacing its existing data with the new payload (see below for partial updates). To create or update users in batches of up to 100, use the `upsertUsers` or `partialUpdateUsers` APIs, which accept an array of user objects.

Depending on the permission configuration of your application, you may also allow users to update their own user objects client-side.

```js
const updateResponse = await chatClient.upsertUser({
  id: userID,
  role: "admin",
  book: "dune",
});
```

And for a batch of users, simply add additional entries (up to 100) into the array you pass to `upsertUsers` :

```js
const updateResponse = await serverClient.upsertUsers([
  { id: userID1, role: "admin", book: "dune" },
  { id: userID2, role: "user", book: "1984" },
  { id: userID3, role: "admin", book: "Fahrenheit 451" },
]);
// each user object is updated accordingly
```

> [!NOTE]
> If any user in a batch of users contains an error, the entire batch will fail, and the first error encountered will be returned.


## Server-side Partial Updates

If you need to update a subset of properties for a user(s), you can use a partial update method. Both set and unset parameters can be provided to add, modify, or remove attributes to or from the target user(s). The set and unset parameters can be used separately or combined.

```js
// partial update for a single user setting and unsetting multiple fields
const update = {
  id: "userID",
  set: {
    role: "admin",
    field: {
      text: "value",
    },
    "field2.subfield": "test",
  },
  unset: ["field.unset"],
};

const response = await client.partialUpdateUser(update);

// partial update for multiple users
const updates = [
  {
    id: "userID",
    set: {
      field: "value",
    },
  },
  {
    id: "userID2",
    unset: ["field.value"],
  },
];

const response = await client.partialUpdateUsers(updates);
```

> [!NOTE]
> Partial updates support batch requests, similar to the upsertUser endpoint.


## Unique Usernames

Clients can set a username, by setting the `name` custom field. The field is optional and by default has no uniqueness constraints applied to it, however this is configurable by setting the `enforce_unique_username` to either _app_ or _team_.

When checking for uniqueness, the name is _normalized_, by removing any white-space or other special characters, and finally transforming it to lowercase. So "John Doe" is considered a duplicate of "john doe", "john.doe", etc.

With the setting at **app**, creating or updating a user fails if the username already exists anywhere in the app. With **team**, it only fails if the username exists within the same team.

```js
// Enable uniqueness constraints on App level
await client.updateAppSettings({
  enforce_unique_usernames: "app",
});

// Enable uniqueness constraints on Team level
await client.updateAppSettings({
  enforce_unique_usernames: "team",
});
```

> [!NOTE]
> Enabling this setting will only enforce the constraint going forward and will not try to validate existing usernames.


## Deactivate a User

To deactivate a user, Stream Chat exposes a server-side `deactivateUser` method. A deactivated user cannot connect to Stream Chat but will be present in user queries and channel history.

```js
const deactivate = await client.deactivateUser(userID);

const deactivate = await client.deactivateUser(userID, {
  mark_messages_deleted: true,
  created_by_id: "joe",
});
```

## Deactivate Many Users

Many users (up to 100) can be deactivated and reactivated with a single call. The operation runs asynchronously, and the response contains a task_id which can be polled using the [getTask endpoint](/chat/docs/node#tasks-gettask) to check the status of the operation.

```js
let resp = await serverClient.deactivateUsers([userIDs, ...], {
   created_by_id: userID, // optional: define who deactivated the users
   mark_messages_deleted: true // optional: the messages will be marked as deleted
})

```

| Name                  | Type    | Description                                       | Default | Optional |
| --------------------- | ------- | ------------------------------------------------- | ------- | -------- |
| mark_messages_deleted | boolean | Soft deletes all of the messages sent by the user | false   | ✓        |

## Reactivate a User

To reinstate the user as active, use the `reactivateUser` method by passing the users ID as a parameter:

```js
const reactivate = await client.reactivateUser(userID);

const reactivate = await client.reactivateUser(userID, {
  restore_messages: true,
  name: "I am back",
  created_by_id: "joe",
});
```

## Deleting Many Users

You can delete up to 100 users and optionally all of their channels and messages using this method. First the users are marked deleted synchronously so the user will not be directly visible in the API. Then the process deletes the user and related objects asynchronously.

```js
let response = await serverClient.deleteUsers(['userID1', 'userID2'], {
  user: 'soft',
  messages: 'hard',
});

response = await serverClient.getTask(response['task_id']);

if(response['status] === 'completed') {
  // success!
}
```

The `deleteUsers` method is an asynchronous API where the response contains a task_id which can be polled using the [getTask endpoint](/chat/docs/node#tasks-gettask) to check the status of the deletions.

These are the request parameters which determine what user data is deleted:

| name                 | type                       | description                                                                                                                                                                                                                                                                               | default | optional |
| -------------------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | -------- |
| user_ids             | array                      | List of users who will be deleted                                                                                                                                                                                                                                                         | -       |          |
| user                 | enum (soft, pruning, hard) | Soft: marks user as deleted and retains all user data. Pruning: marks user as deleted and nullifies user information. Hard: deletes user completely - this requires hard option for **messages** and **conversation** as well.                                                            | -       | ✓        |
| conversations        | enum (soft, hard)          | Soft: marks all conversation channels as deleted (same effect as Delete Channels with 'hard' option disabled). Hard: deletes channel and all its data completely including messages (same effect as Delete Channels with 'hard' option enabled).                                          |         | ✓        |
| messages             | enum (soft, pruning, hard) | Soft: marks all user messages as deleted without removing any related message data. Pruning: marks all user messages as deleted, nullifies message information and removes some message data such as reactions and flags. Hard: deletes messages completely with all related information. | -       | ✓        |
| new_channel_owner_id | string                     | Channels owned by hard-deleted users will be transferred to this userID.                                                                                                                                                                                                                  | -       | ✓        |

> [!NOTE]
> When deleting a user, if you wish to transfer ownership of their channels to another user, provide that user's ID in the `new_channel_owner_id` field. Otherwise, the channel owner will be updated to a system generated ID like `delete-user-8219f6578a7395g`


## Restoring deleted users

If users are _soft_ deleted, they can be restored using the server-side client. However, only the user's metadata is restored; memberships, messages, reactions, etc. are not restored.

You can restore up to 100 users per call:

```js
await client.restoreUsers(["userID1", "userID2"]);
```

## Querying Users

The Query Users method lets you search for users, though in many cases it's more practical to query your own user database instead. Like other Stream query APIs, it accepts filter, sort, and options parameters.

```js
const response = await client.queryUsers(
  { id: { $in: ["john", "jack", "jessie"] } },
  { last_active: -1 },
  { limit: 10, offset: 0 },
);
```

<partial id="shared/user-management/_query-users-filters-sort-options"></partial>

### Querying with Autocomplete

You can use the `$autocomplete` operator to search for users by name or ID with partial matching.

```js
const response = await client.queryUsers({
  name: { $autocomplete: "ro" },
});
```

### Querying Inactive Users

You can use the `last_active` field with the `$exists` operator to find users who have never connected. Use `$exists: false` for users who have never been active, or `$exists: true` for users who have connected at least once.

```js
const response = await client.queryUsers({
  id: { $in: [activeUser, neverActiveUser] },
  last_active: { $exists: false },
});
```
