Companies doing business in the European Union are bound by law to follow the General Data Protection Act. While most parts of this law don't have much impact on your integration with Stream Chat, the GDPR right to data access and right to erasure involve data stored and managed on Stream's servers.

Because of this, Stream provides a set of methods that make complying with those portions of the law easy.

## The Right to Access Data

GDPR gives EU citizens the right to request access to their information and the right to have access to this information in a portable format. Stream Chat covers this requirement with the [Export User](/chat/docs/node/exporting_channels/) method.

This method can only be used with server-side authentication.

```js
const data = await serverClient.exportUser(userID);
```

The export will return all data about the user, including:

- User ID

- Messages

- Reactions

- Custom Data

Running a user export will return a JSON object like the following example.

<details>
<summary>Response</summary>

```json
{
 user: {
  id: 'waters-malone',
  role: 'user',
  created_at: '2021-05-17T14:35:23.313097Z',
  updated_at: '2021-05-17T21:10:58.028195Z',
  last_active: '2021-07-29T17:43:28.795240793Z',
  banned: false,
  online: false,
  image: 'https://getstream.io/random_png/?id=waters-malone&name=waters-malone',
  name: 'Malone Waters'
 },
 messages: [
  {
   id: 'waters-malone-2f419088-b279-47f0-9aa9-14a706b7988a',
   text: 'dfasd',
   html: '<p>dfasd</p>\n',
   type: 'regular',
   user: null,
   attachments: [],
   latest_reactions: [],
   own_reactions: [],
   reaction_counts: null,
   reaction_scores: {},
   reply_count: 0,
   cid: 'messaging:waters-malone',
   created_at: '2021-05-28T19:40:17.482123Z',
   updated_at: '2021-05-28T19:40:17.482123Z',
   shadowed: false,
   mentioned_users: [],
   silent: false,
   pinned: false,
   pinned_at: null,
   pinned_by: null,
   pin_expires: null
  },
 reactions: [
  {
   message_id: 'waters-malone-dc533aa2-7a97-491d-a216-503081d2efde',
   user_id: 'waters-malone',
   user: null,
   type: 'angry',
   score: 1,
   created_at: '2021-05-17T19:26:10.923605Z',
   updated_at: '2021-05-17T19:26:10.923605Z'
  },
  {
   message_id: 'waters-malone-de5626db-26fc-4a07-8a41-a27496a67612',
   user_id: 'waters-malone',
   user: null,
   type: 'haha',
   score: 1,
   created_at: '2021-05-17T19:26:18.163286Z',
   updated_at: '2021-05-17T19:26:18.163286Z'
  }
 ],
 duration: '1.87ms'
}
```

</details>

> [!WARNING]
> Users with more than 10,000 messages will throw an error during the export process. The Stream Chat team is actively working on a workaround for this issue and it will be resolved soon.


### The Right to Erasure

GDPR also gives EU citizens the right to request the deletion of their information. Stream Chat provides ways to delete users, channels, and messages depending on the use case.

There are two server-side functions which can be used: `deleteUsers` and `deleteChannels` . These allow you to delete up to 100 users or channels and optionally all of their messages in one API request.

- To permanently delete a user and all of their data, use `deleteUsers` and set `mark_messages_deleted` , `hard_delete` , and `delete_conversation_channels` options to true.

- To permanently delete a channel and all of its messages, use `deleteChannels` and set `hard_delete` to true.

For more information, and examples, see:

- [Deleting a batch of users](/chat/docs/node/update_users/#deleting-many-users/)

- [Deleting a batch of channels](/chat/docs/node/channel_delete/#deleting-many-channels/)

After deleting a user, the user will no longer be able to:

- Connect to Stream Chat

- Send or receive messages

- Be displayed when querying users

- Have messages stored in Stream Chat (depending on whether or not `mark_messages_deleted` is set to `true` or `false` )
