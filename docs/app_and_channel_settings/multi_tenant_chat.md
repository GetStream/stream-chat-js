Many apps that add chat have customers of their own. If you're building something like Slack, or a SaaS application like InVision you want to make sure that one customer can't read the messages of another customer. Stream Chat can be configured in multi-tenant mode so that users are organized in separated teams that cannot interact with each other.

## Teams

Stream Chat has the concept of teams for users and channels. The purpose of teams is to provide a simple way to separate different groups of users and channels within a single application.

If a user belongs to a team, the API will ensure that such user will only be able to connect to channels from the same team. Features such as user search are limited so that a user can only search for users from the same team by default.

> [!NOTE]
> In legacy permission system users can never access users nor channels from other teams. In [Permissions V2](/chat/docs/node/chat_permission_policies/) it is possible to alter this behavior using multi-tenant permissions.


When enabling multi-tenant mode all user requests will always ensure that the request applies to a team the user belongs to. For instance, if a user from team "blue" tries to delete a message that was created on a channel from team "red" the API will return an error. If user doesn't have team set, it will only have access to users and channels that don't have team.

## Enable Teams for your application

In order to use Teams, your application must have multi-tenant mode enabled. You can ensure your app is in multi-tenant mode by calling the Application Settings endpoint.

```js
const client = new StreamChat("{{ api_key }}", "{{ api_secret }}");

// Enable multi-tenant in app settings.
await client.updateAppSettings({
  multi_tenant_enabled: true,
});
```

> [!NOTE]
> You only need to activate multi-tenancy once per application.


> [!WARNING]
> Do not turn off multitenancy on an application without very careful consideration as this will turn off teams checking which gives users the ability to access all channels and messages across all teams.
>
> Make sure to activate multi-tenancy before using teams.


## User teams

When using teams, users must be created from your back-end and specify which teams they are a member of.

```js
// creates or updates a user from backend to be part of the "red" and "blue" teams
client.upsertUser({ id, teams: ["red", "blue"] });
```

> [!NOTE]
> A user can be a member of a maximum of 250 teams. Team name is limited to 100 bytes


> [!WARNING]
> User teams are included in all User object payloads. We recommend to have short team names to reduce response payload sizes


> [!WARNING]
> In Permissions v1, user teams can only be changed using server-side auth. This ensures users can't change their own team membership. In Permissions v2 it is possible to update user teams from client-side if `UpdateUserTeam` action is granted to the user


## Channel team

Channels can be associated with a team. Users can create channels client-side but if their user is part of a team, they will have to specify a team or the request will be rejected with an error.

```js
// Creates the channel red-general for team red
client.channel("messaging", "red-general", { team: "red" }).create();
```

> [!NOTE]
> Channel teams allows you to ensure proper permission checking for a multi tenant application. Keep in mind that you will still need to enforce that channel IDs are unique. A very effective approach is to include the team name as a prefix to avoid collisions. (ie. "red-general" and "blue-general" instead of just "general")


## User Search

By default the user search will only return results from teams that user is a part of. API injects filter `{teams: {$in: ["red", "blue"]}}` for every request that doesn't already contain filter for `teams` field. If you want to query users from all teams, you have to provide empty filter like this: `{teams:{}}` . For server-side requests, this filter does not apply.

```js
// search for users with name Jordan that are part of the same team as authorized user
client.queryUsers({
  name: { $eq: "Jordan" },
});

// search for users with name Nick in all teams
client.queryUsers({
  $and: [{ name: { $eq: "Nick" } }, { teams: {} }],
});

// search for users with name Dan in subset of teams
client.queryUsers({
  $and: [{ name: { $eq: "Nick" } }, { teams: { $in: ["red", "blue"] } }],
});

// search for users with name Tom that don't have any team assigned
client.queryUsers({
  $and: [{ name: { $eq: "Tom" } }, { teams: { $eq: null } }],
});
```

> [!NOTE]
> Users that cannot be displayed to the current user due to lack of permissions will be omitted from response.


## Query Channels

When using multi-tenant, the query channels endpoint will only return channels that match the query **and** are on the same team as the user. API injects filter `{team: {$in: [<user_teams>]}}` for every request that doesn't already contain filter for `team` field. If you want to query channels from all teams, you have to provide empty filter like this: `{team:{}}` . For server-side requests, this filter does not apply.

```js
// query all channels from teams that user is a part of
await client.queryChannels({});

// query all channels from all teams
await client.queryChannels({ team: {} });

// query all channels with no teams
await client.queryChannels({ team: { $eq: null } });
```

> [!NOTE]
> In case if response contains channels that user cannot access, an access error will be returned.


## Team based roles

By default a user will be assigned only 1 role (ie. `user`, `admin`, etc.). If you would like to have different roles depending on the the team the user is part of, you can do so by specifying a separate role per team. This team based role is applicable only on channels that belong to that team. Let's imagine user Jane, she's a user with role `user` throughout the application, however on team `red` we would like to give her elevated permissions and give her the `admin` role.
We can do this by updating the user as follows:

```javascript
await client.upsertUser({
  id: "Jane",
  role: "user",
  teams: ["red", "blue"],
  teams_role: {
    red: "admin",
    blue: "user",
  },
});
```

If no team based role is set for a team, the system uses the role of the user.
For example, user Janet is a member of teams `red`, `blue` and `orange`. She has role `user` and team based roles `{ "red": "admin", "blue": "user" }`:

- On team red, she will have `admin` level permissions. This means that on channels that belong to team red, she will have admin level permissions.
- On channels from team blue, she has `user` level permissions.
- On channels from team orange, she also has `user` level permissions (because no team role was assigned for this team).

Please be aware team based roles will only work when multitenancy is enabled.

## Multi-Tenant Permissions

In tables below you will find default permission grants for builtin roles that designed for multi-tenant applications. They are useful for [multi-tenant applications](/chat/docs/node/multi_tenant_chat/) only.

By default, for multi-tenant applications, all objects (users, channels, and messages) must belong to the same team to be able to interact. These multi-tenant permissions enable overriding that behavior, so that certain users can have permissions to interact with objects on any team

### Scope `video:livestream`

| Permission ID |
| ------------- |

### Scope `video:development`

| Permission ID |
| ------------- |

### Scope `.app`

| Permission ID               | global_moderator | global_admin |
| --------------------------- | ---------------- | ------------ |
| flag-user-any-team          | ✅               | ✅           |
| mute-user-any-team          | ✅               | ✅           |
| read-flag-reports-any-team  | ✅               | ✅           |
| search-user-any-team        | ✅               | ✅           |
| update-flag-report-any-team | ✅               | ✅           |
| update-user-owner           | ✅               | ✅           |

### Scope `video:audio_room`

| Permission ID |
| ------------- |

### Scope `video:default`

| Permission ID |
| ------------- |

### Scope `messaging`

| Permission ID                          | global_moderator | global_admin |
| -------------------------------------- | ---------------- | ------------ |
| add-links-any-team                     | ✅               | ✅           |
| ban-channel-member-any-team            | ✅               | ✅           |
| ban-user-any-team                      | ✅               | ✅           |
| create-call-any-team                   | ✅               | ✅           |
| create-channel-any-team                | ✅               | ✅           |
| create-message-any-team                | ✅               | ✅           |
| create-attachment-any-team             | ✅               | ✅           |
| create-mention-any-team                | ✅               | ✅           |
| create-reaction-any-team               | ✅               | ✅           |
| create-system-message-any-team         | ✅               | ✅           |
| delete-attachment-any-team             | ✅               | ✅           |
| delete-channel-any-team                | ✖️               | ✅           |
| delete-channel-owner-any-team          | ✅               | ✖️           |
| delete-message-any-team                | ✅               | ✅           |
| delete-reaction-any-team               | ✅               | ✅           |
| flag-message-any-team                  | ✅               | ✅           |
| join-call-any-team                     | ✅               | ✅           |
| mute-channel-any-team                  | ✅               | ✅           |
| pin-message-any-team                   | ✅               | ✅           |
| read-channel-any-team                  | ✅               | ✅           |
| read-channel-members-any-team          | ✅               | ✅           |
| read-message-flags-any-team            | ✅               | ✅           |
| recreate-channel-any-team              | ✖️               | ✅           |
| recreate-channel-owner-any-team        | ✅               | ✖️           |
| remove-own-channel-membership-any-team | ✅               | ✅           |
| run-message-action-any-team            | ✅               | ✅           |
| send-custom-event-any-team             | ✅               | ✅           |
| skip-channel-cooldown-any-team         | ✅               | ✅           |
| skip-message-moderation-any-team       | ✅               | ✅           |
| truncate-channel-any-team              | ✖️               | ✅           |
| truncate-channel-owner-any-team        | ✅               | ✖️           |
| unblock-message-any-team               | ✅               | ✅           |
| update-channel-any-team                | ✅               | ✅           |
| update-channel-cooldown-any-team       | ✅               | ✅           |
| update-channel-frozen-any-team         | ✅               | ✅           |
| update-channel-members-any-team        | ✅               | ✅           |
| update-message-any-team                | ✅               | ✅           |
| upload-attachment-any-team             | ✅               | ✅           |

### Scope `livestream`

| Permission ID                          | global_moderator | global_admin |
| -------------------------------------- | ---------------- | ------------ |
| add-links-any-team                     | ✅               | ✅           |
| ban-channel-member-any-team            | ✅               | ✅           |
| ban-user-any-team                      | ✅               | ✅           |
| create-call-any-team                   | ✅               | ✅           |
| create-channel-any-team                | ✅               | ✅           |
| create-message-any-team                | ✅               | ✅           |
| create-attachment-any-team             | ✅               | ✅           |
| create-mention-any-team                | ✅               | ✅           |
| create-reaction-any-team               | ✅               | ✅           |
| create-system-message-any-team         | ✅               | ✅           |
| delete-attachment-any-team             | ✅               | ✅           |
| delete-channel-any-team                | ✖️               | ✅           |
| delete-message-any-team                | ✅               | ✅           |
| delete-reaction-any-team               | ✅               | ✅           |
| flag-message-any-team                  | ✅               | ✅           |
| join-call-any-team                     | ✅               | ✅           |
| mute-channel-any-team                  | ✅               | ✅           |
| pin-message-any-team                   | ✅               | ✅           |
| read-channel-any-team                  | ✅               | ✅           |
| read-channel-members-any-team          | ✅               | ✅           |
| read-message-flags-any-team            | ✅               | ✅           |
| recreate-channel-any-team              | ✖️               | ✅           |
| remove-own-channel-membership-any-team | ✖️               | ✅           |
| run-message-action-any-team            | ✅               | ✅           |
| send-custom-event-any-team             | ✅               | ✅           |
| skip-channel-cooldown-any-team         | ✅               | ✅           |
| skip-message-moderation-any-team       | ✅               | ✅           |
| truncate-channel-any-team              | ✖️               | ✅           |
| unblock-message-any-team               | ✅               | ✅           |
| update-channel-any-team                | ✖️               | ✅           |
| update-channel-cooldown-any-team       | ✅               | ✅           |
| update-channel-frozen-any-team         | ✅               | ✅           |
| update-channel-members-any-team        | ✖️               | ✅           |
| update-message-any-team                | ✅               | ✅           |
| upload-attachment-any-team             | ✅               | ✅           |

### Scope `team`

| Permission ID                          | global_moderator | global_admin |
| -------------------------------------- | ---------------- | ------------ |
| add-links-any-team                     | ✅               | ✅           |
| ban-channel-member-any-team            | ✅               | ✅           |
| ban-user-any-team                      | ✅               | ✅           |
| create-call-any-team                   | ✅               | ✅           |
| create-channel-any-team                | ✅               | ✅           |
| create-message-any-team                | ✅               | ✅           |
| create-attachment-any-team             | ✅               | ✅           |
| create-mention-any-team                | ✅               | ✅           |
| create-reaction-any-team               | ✅               | ✅           |
| create-system-message-any-team         | ✅               | ✅           |
| delete-attachment-any-team             | ✅               | ✅           |
| delete-channel-any-team                | ✖️               | ✅           |
| delete-channel-owner-any-team          | ✅               | ✖️           |
| delete-message-any-team                | ✅               | ✅           |
| delete-reaction-any-team               | ✅               | ✅           |
| flag-message-any-team                  | ✅               | ✅           |
| join-call-any-team                     | ✅               | ✅           |
| mute-channel-any-team                  | ✅               | ✅           |
| pin-message-any-team                   | ✅               | ✅           |
| read-channel-any-team                  | ✅               | ✅           |
| read-channel-members-any-team          | ✅               | ✅           |
| read-message-flags-any-team            | ✅               | ✅           |
| recreate-channel-any-team              | ✖️               | ✅           |
| recreate-channel-owner-any-team        | ✅               | ✖️           |
| remove-own-channel-membership-any-team | ✅               | ✅           |
| run-message-action-any-team            | ✅               | ✅           |
| send-custom-event-any-team             | ✅               | ✅           |
| skip-channel-cooldown-any-team         | ✅               | ✅           |
| skip-message-moderation-any-team       | ✅               | ✅           |
| truncate-channel-any-team              | ✖️               | ✅           |
| truncate-channel-owner-any-team        | ✅               | ✖️           |
| unblock-message-any-team               | ✅               | ✅           |
| update-channel-any-team                | ✅               | ✅           |
| update-channel-cooldown-any-team       | ✅               | ✅           |
| update-channel-frozen-any-team         | ✅               | ✅           |
| update-channel-members-any-team        | ✅               | ✅           |
| update-message-any-team                | ✅               | ✅           |
| upload-attachment-any-team             | ✅               | ✅           |

### Scope `commerce`

| Permission ID                          | global_moderator | global_admin |
| -------------------------------------- | ---------------- | ------------ |
| add-links-any-team                     | ✅               | ✅           |
| ban-channel-member-any-team            | ✅               | ✅           |
| ban-user-any-team                      | ✅               | ✅           |
| create-call-any-team                   | ✅               | ✅           |
| create-channel-any-team                | ✅               | ✅           |
| create-message-any-team                | ✅               | ✅           |
| create-attachment-any-team             | ✅               | ✅           |
| create-mention-any-team                | ✅               | ✅           |
| create-reaction-any-team               | ✅               | ✅           |
| create-system-message-any-team         | ✅               | ✅           |
| delete-attachment-any-team             | ✅               | ✅           |
| delete-channel-any-team                | ✖️               | ✅           |
| delete-message-any-team                | ✅               | ✅           |
| delete-reaction-any-team               | ✅               | ✅           |
| flag-message-any-team                  | ✅               | ✅           |
| join-call-any-team                     | ✅               | ✅           |
| mute-channel-any-team                  | ✅               | ✅           |
| pin-message-any-team                   | ✅               | ✅           |
| read-channel-any-team                  | ✅               | ✅           |
| read-channel-members-any-team          | ✅               | ✅           |
| read-message-flags-any-team            | ✅               | ✅           |
| recreate-channel-any-team              | ✖️               | ✅           |
| remove-own-channel-membership-any-team | ✅               | ✅           |
| run-message-action-any-team            | ✅               | ✅           |
| send-custom-event-any-team             | ✅               | ✅           |
| skip-channel-cooldown-any-team         | ✅               | ✅           |
| skip-message-moderation-any-team       | ✅               | ✅           |
| truncate-channel-any-team              | ✖️               | ✅           |
| unblock-message-any-team               | ✅               | ✅           |
| update-channel-any-team                | ✅               | ✅           |
| update-channel-cooldown-any-team       | ✅               | ✅           |
| update-channel-frozen-any-team         | ✅               | ✅           |
| update-channel-members-any-team        | ✅               | ✅           |
| update-message-any-team                | ✅               | ✅           |
| upload-attachment-any-team             | ✅               | ✅           |

### Scope `gaming`

| Permission ID                          | global_moderator | global_admin |
| -------------------------------------- | ---------------- | ------------ |
| add-links-any-team                     | ✅               | ✅           |
| ban-channel-member-any-team            | ✅               | ✅           |
| ban-user-any-team                      | ✅               | ✅           |
| create-call-any-team                   | ✅               | ✅           |
| create-channel-any-team                | ✖️               | ✅           |
| create-message-any-team                | ✅               | ✅           |
| create-attachment-any-team             | ✅               | ✅           |
| create-mention-any-team                | ✅               | ✅           |
| create-reaction-any-team               | ✅               | ✅           |
| create-system-message-any-team         | ✅               | ✅           |
| delete-attachment-any-team             | ✅               | ✅           |
| delete-channel-any-team                | ✖️               | ✅           |
| delete-message-any-team                | ✅               | ✅           |
| delete-reaction-any-team               | ✅               | ✅           |
| flag-message-any-team                  | ✅               | ✅           |
| join-call-any-team                     | ✅               | ✅           |
| mute-channel-any-team                  | ✅               | ✅           |
| pin-message-any-team                   | ✅               | ✅           |
| read-channel-any-team                  | ✅               | ✅           |
| read-channel-members-any-team          | ✅               | ✅           |
| read-message-flags-any-team            | ✅               | ✅           |
| recreate-channel-any-team              | ✖️               | ✅           |
| remove-own-channel-membership-any-team | ✅               | ✅           |
| run-message-action-any-team            | ✅               | ✅           |
| send-custom-event-any-team             | ✅               | ✅           |
| skip-channel-cooldown-any-team         | ✅               | ✅           |
| skip-message-moderation-any-team       | ✅               | ✅           |
| truncate-channel-any-team              | ✖️               | ✅           |
| unblock-message-any-team               | ✅               | ✅           |
| update-channel-any-team                | ✖️               | ✅           |
| update-channel-cooldown-any-team       | ✅               | ✅           |
| update-channel-frozen-any-team         | ✅               | ✅           |
| update-channel-members-any-team        | ✖️               | ✅           |
| update-message-any-team                | ✅               | ✅           |
| upload-attachment-any-team             | ✅               | ✅           |

## Team Usage Statistics

For multi-tenant applications, you can query usage statistics broken down by team. This is useful for billing, monitoring, and analytics purposes. The API returns detailed metrics for each team including user counts, message volumes, and activity patterns.

### Querying Team Usage Stats

Use the `queryTeamUsageStats` method to retrieve usage statistics. You can query by month or by a custom date range.

```js
// Query current month's stats
const response = await client.queryTeamUsageStats();

// Query specific month
const response = await client.queryTeamUsageStats({ month: "2024-01" });

// Query date range
const response = await client.queryTeamUsageStats({
  start_date: "2024-01-01",
  end_date: "2024-01-31",
});

// With pagination
const response = await client.queryTeamUsageStats({ limit: 10 });
if (response.next) {
  const nextPage = await client.queryTeamUsageStats({
    limit: 10,
    next: response.next,
  });
}
```

### Available Metrics

The response includes statistics for each team with the following metrics:

| Metric                        | Description                            |
| ----------------------------- | -------------------------------------- |
| `users_daily`                 | Number of unique users active per day  |
| `messages_daily`              | Number of messages sent per day        |
| `translations_daily`          | Number of message translations per day |
| `image_moderations_daily`     | Number of images moderated per day     |
| `concurrent_users`            | Peak concurrent users                  |
| `concurrent_connections`      | Peak concurrent connections            |
| `users_total`                 | Total number of users                  |
| `users_last_24_hours`         | Users active in the last 24 hours      |
| `users_last_30_days`          | Users active in the last 30 days       |
| `users_month_to_date`         | Users active month to date             |
| `users_engaged_last_30_days`  | Engaged users in the last 30 days      |
| `users_engaged_month_to_date` | Engaged users month to date            |
| `messages_total`              | Total number of messages               |
| `messages_last_24_hours`      | Messages sent in the last 24 hours     |
| `messages_last_30_days`       | Messages sent in the last 30 days      |
| `messages_month_to_date`      | Messages sent month to date            |

> [!NOTE]
> This API requires server-side authentication. It cannot be called from client-side SDKs.


> [!NOTE]
> Use the `month` parameter (format: `YYYY-MM`) for monthly reports, or `start_date` and `end_date` (format: `YYYY-MM-DD`) for custom date ranges. If no parameters are provided, the current month's statistics are returned.


### Metric Attribution

Message metrics (`messages_*`) are attributed based on the channel's `team` field (`channel.team`), while user metrics (`users_*`) are attributed based on the user's `teams` array (`user.teams`). This means you may see messages under a team even when `users_*` metrics are zero for that team, if messages were sent in channels belonging to that team by users who are not members of that team.

### Empty Team

The API returns a row for `team=""` (empty string) which represents users and messages that are not assigned to any team. This includes messages in channels without a team set and users without any team membership.

### Response Modes

The response shape differs based on query mode:

**Monthly mode** (using `month` parameter): Returns only the total/aggregated values for each metric. Daily breakdown arrays are omitted.

**Daily mode** (using `start_date` and `end_date`): Returns both daily breakdown arrays and aggregated totals. The aggregation method depends on the metric type:

- **SUM**: Daily activity metrics (`users_daily`, `messages_daily`, `translations_daily`, `image_moderations_daily`) - totals are summed across the date range
- **MAX**: Peak metrics (`concurrent_users`, `concurrent_connections`) - totals reflect the maximum value observed
- **LATEST**: Rolling/cumulative metrics (`users_total`, `users_last_24_hours`, `users_last_30_days`, `users_month_to_date`, `users_engaged_last_30_days`, `users_engaged_month_to_date`, `messages_total`, `messages_last_24_hours`, `messages_last_30_days`, `messages_month_to_date`) - totals reflect the most recent value

### Pagination

Results are paginated in lexicographic order by team name. The `next` cursor in the response is a base64-encoded team ID. Use this cursor value in subsequent requests to fetch the next page of results. The `limit` parameter is capped at 30 teams per request.

### Date Range Validation

When using custom date ranges, the following validations apply:

- `end_date` must be greater than or equal to `start_date`
- The date range cannot exceed 365 days
