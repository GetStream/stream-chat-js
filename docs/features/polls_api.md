The Polls feature provides a comprehensive API that enables seamless integration of polling capabilities within your application, enhancing engagement and interaction among users. Through this API, developers can effortlessly create, manage, and utilize polls as part of messages, gather user opinions, and make informed decisions based on real-time feedback.

## Polls at a Quick Glance

```js
// Create a poll and send it in a message
const poll = await client.createPoll({
  name: "Where should we host our next event?",
  options: [{ text: "Amsterdam" }, { text: "Boulder" }],
});
await channel.sendMessage({ text: "Vote now!", poll_id: poll.id });

// Vote on a poll
await client.castPollVote(messageId, pollId, { option_id: "option-id" });

// Retrieve poll results
const poll = await client.getPoll(pollId);
console.log(poll.vote_counts_by_option); // { 'option-id': 5 }
```

### Key Features Include

- **Easy Poll Creation and Configuration** : Developers can create polls with customizable options, descriptions, and configurations, including setting voting visibility (public or anonymous), enforcing unique votes, and specifying the maximum votes a user can cast. Polls can also be designed to allow user-suggested options or open-ended answers, providing flexibility in how you engage with your audience.

- **Seamless Integration with Messages** : Once created, polls can be sent as part of messages, allowing for a seamless user experience. Users can view poll details and participate directly within the context of a conversation.

- **Dynamic Poll Management** : Polls are not static. You can update poll details, add or modify options, and even close polls to further responses. These actions can be performed through full or partial updates, giving you control over the poll's lifecycle.

- **Robust Voting System** : Users can cast votes on options or provide answers to open-ended questions, with the API supporting both single and multiple choice responses. Votes can be changed or removed, ensuring users' opinions are accurately captured.

- **Comprehensive Query Capabilities** : Retrieve detailed information about polls and votes based on various criteria, including poll status, creation time, and user responses. This enables developers to implement rich, data-driven features in their applications.

- **Customizability and Extensibility** : In addition to predefined poll properties, the API supports custom properties, allowing developers to tailor polls and options to their specific needs while maintaining performance and scalability.

## Creating a poll and sending it as part of a message

Creating a poll is easy. You simply create a poll with your desired configuration, and once created, you send a message with the poll id.

```js
const poll = await client.createPoll({
  name: "Where should we host our next company event?",
  options: [
    {
      text: "Amsterdam, The Netherlands",
    },
    {
      text: "Boulder, CO",
    },
  ],
});

// or if you're using PollManager

const pollInstance = await client.polls.createPoll({
  name: "Where should we host our next company event?",
  options: [
    {
      text: "Amsterdam, The Netherlands",
    },
    {
      text: "Boulder, CO",
    },
  ],
});

const { message } = await channel.sendMessage({
  text: "We want to know your opinion!",
  poll_id: poll.id,
});

// message.poll contains all relevant poll data
```

> [!NOTE]
> Please take into account that the poll can be sent only by the user who created it in the first place.


When creating a poll, the following properties can be configured:

| name                         | type                         | description                                                                                                                               | default | optional |
| ---------------------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------- | -------- |
| name                         | string                       | The name of the poll                                                                                                                      | -       |          |
| description                  | string                       | The description of the poll                                                                                                               | -       | ✓        |
| voting_visibility            | enum                         | Designates whether the votes are casted anonymously                                                                                       | public  | ✓        |
| enforce_unique_vote          | boolean                      | Designates whether the poll is multiple choice or single choice                                                                           | false   | ✓        |
| max_votes_allowed            | number                       | Designates how many votes a single user is allowed to cast on a poll. Allowed value is in range from 1 to 10. If null, no limits applied. | null    | ✓        |
| allow_user_suggested_options | boolean                      | Designates weather user can add custom options to the poll                                                                                | false   | ✓        |
| allow_answers                | boolean                      | Designates whether user can add an answer to the poll. Max 1 answer is allowed. This is for open ended polls.                             | false   |          |
| is_closed                    | boolean                      | Whether the poll is closed for voting or not                                                                                              | false   | ✓        |
| options                      | array of poll option objects | One or more options users can vote on. See below for more information on poll options                                                     | -       | ✓        |

### Poll options

| name | type   | description                 | default | optional |
| ---- | ------ | --------------------------- | ------- | -------- |
| text | string | The text of the poll option | -       | ✓        |

Besides the above mentioned properties, it is also possible to supply your own custom properties for both polls and options:

```js
const poll = await client.createPoll({
	name: 'Where should we host our next company event?',
	options: [
		{
			text: 'Amsterdam, The Netherlands'
			foo: 'bar'
		},
		{
			text: 'Boulder, CO'
			foo: 'baz'
		}
	],
	foo: 'bar'
});
```

> [!NOTE]
> The total size of all custom properties on a poll cannot exceed 5KB.


### Example poll response as part of a message

```js
{
 id: 'edffef3e-6cdf-4915-b08f-0f560dfd5500',
 name: 'Where should we host our next company event?',
 description: '',
 voting_visibility: 'public',
 max_votes_allowed: 1,
 allow_user_suggested_options: false,
 vote_count: 1,
 answers_count: 2,
 options: [
		{
			id: 'a5ec8075-68e7-4a4a-b60b-48a6ea54653f',
			text: 'Amsterdam, The Netherlands'
		},
		{
			id: 'a5ec8075-68e7-4a4a-b60b-48a6ea54653f',
			text: 'Boulder, CO'
		}
	],
 vote_counts_by_option: { 'a5ec8075-68e7-4a4a-b60b-48a6ea54653f': 1 },
 latest_answers: [
   {
	   poll_id: 'edffef3e-6cdf-4915-b08f-0f560dfd5500',
	   id: 'cbd67e2a-0ee2-48d2-8bde-dfb95392b6012',
	   answer_text: 'I dont like pineapple',
	   user_id: 'a172931b-8c52-48e5-b153-64070fc94dc8',
	   user: {
		   ...
	   }
	   created_at: '2023-12-04T12:16:23.188434Z',
	   updated_at: '2023-12-04T12:16:23.188434Z',
	  }
 ],
 latest_votes_by_option: {
	 'a5ec8075-68e7-4a4a-b60b-48a6ea54653f': [
	  {
	   poll_id: 'edffef3e-6cdf-4915-b08f-0f560dfd5500',
	   id: 'cbd67e2a-0ee2-48d2-8bde-bb95392b60b6',
	   option_id: 'a5ec8075-68e7-4a4a-b60b-48a6ea54653f',
	   user_id: 'a172931b-8c52-48e5-b153-64070fc94dc8',
	   user: {
		   ...
	   }
	   created_at: '2023-12-04T12:16:23.188434Z',
	   updated_at: '2023-12-04T12:16:23.188434Z',

	  }
	 ]
	},
 own_votes: [
  {
   poll_id: 'edffef3e-6cdf-4915-b08f-0f560dfd5500',
   id: '5af67ac1-eae8-4bbc-98dc-1e63a6209e88',
   option_id: 'a5ec8075-68e7-4a4a-b60b-48a6ea54653f',
   user_id: '6e9f35fa-fe8d-4c51-8832-c9c1eae3744f',
   created_at: '2023-12-04T12:14:28.047056Z',
   updated_at: '2023-12-04T12:14:28.047056Z'
  }
 ],
 created_by_id: '6e9f35fa-fe8d-4c51-8832-c9c1eae3744f',
 created_by: {
  id: '6e9f35fa-fe8d-4c51-8832-c9c1eae3744f',
  role: 'user',
  created_at: '2023-12-04T12:14:27.468935Z',
  updated_at: '2023-12-04T12:14:27.468935Z',
  last_active: '2023-12-04T12:14:27.482014Z',
  banned: false,
  online: true
 },
 created_at: '2023-12-04T12:14:27.4963Z',
 updated_at: '2023-12-04T12:14:27.4963Z'
}
```

> [!NOTE]
> The  `latest_votes_by_option`  will contain at most the 10 latest votes for that particular option.


## Casting a vote

Once a poll has been send as part of a message (and as long as the poll isn’t closed for voting). Votes can be casted

### Send vote on option

```js
const { votes } = await chatClient.castPollVote(messageId, pollId,
	option_id: 'some-option-id-328904342'
});

// or if you're using the reactive poll instance
const pollInstance = chatClient.polls.fromState(pollId);
const { votes } = await pollInstance.castVote(optionId, messageId);
```

### Send an answer (if answers are configured to be allowed)

```js
const { votes } = await chatClient.castPollVote(messageId, pollId, {
  answer_text: "some-option-id-328904342",
});

// or if you're using the reactive poll instance
const pollInstance = chatClient.polls.fromState(pollId);
const { votes } = await pollInstance.addAnswer(answerText, messageId);
```

#### Few points to note here

- If  `enforce_unique_votes`  is set to **true** on poll, then any vote casted on option will replace the previous vote. Also this api will broadcast an event:

- `poll.vote_changed`  if  `enforce_unique_votes`  is **true**

- Otherwise  `poll.vote_casted`  event will be broadcasted

- Adding an answer will always replace the previous answer. This ensures that user can add maximum `1` answer (similar to what Polly app has)

- You need  `CastVote`  permission to be able to cast a vote

- API will return an error if poll is not attached to a message.

## Removing a vote

A vote can be removed as well:

```js
const { vote } = await chatClient.removePollVote(messageId, pollId, voteId);

// or if you're using the reactive poll instance
const pollInstance = chatClient.polls.fromState(pollId);
const { vote } = await pollInstance.removeVote(voteId, messageId);
```

## Closing a poll

If you want to prevent any further votes on a poll, you can close a poll for voting:

```js
await chatClient.closePoll(pollId);

// or if you're using the reactive poll instance
const pollInstance = chatClient.polls.fromState(pollId);
await pollInstance.close();
```

## Retrieving a poll

If you know the id of a poll you can easily retrieve the poll by using the  `getPoll`  method. If you don’t know the id or if you want to retrieve multiple polls, use the query polls method (see below)

```js
const poll = await chatClient.getPoll(pollId, userId);
// userId is optional and can be provided for serverside calls
// in case you want to include the votes for the user

// or if you're using PollManager
await chatClient.polls.getPoll(pollId);
// note that in this case the poll will be returned by
// the cache first and fetched only if it isn't there
```

## Updating a poll

There are two ways to update a poll: a **full** poll update and a **partial** update.

### Full update

```js
const updatedPoll = await chatClient.updatePoll({
 id: pollId,
	name: 'Where should we not go to?'
	options: [
		{
			text: 'Amsterdam, The Netherlands'
			foo: 'bar
		},
		{
			text: 'Boulder, CO'
			foo: 'baz'
		}
	]
});
```

> [!WARNING]
> All the poll properties that are omitted in the update request will either be removed or set to their default values.


### Partial update

```js
const updatedPoll = await chatClient.partialUpdatePoll(pollId, {
  set: { name: "Where should we not go to?" },
  unset: ["custom_property"],
});
```

## Deleting a poll

Deleting a poll removes the poll, its associated options as well as all the votes on that poll. Be aware that removing a poll can’t be undone.

```js
await chatClient.deletePoll(pollId);

// or if you're using the reactive poll instance
const pollInstance = chatClient.polls.fromState(pollId);
await pollInstance.delete();
```

## Adding, updating and deleting poll options

Poll options can be added, updated or deleted after a poll has been created:

### **Add poll option**

```js
const pollOption = await chatClient.createPollOption(pollId, {
  text: "Another option",
});

// or if you're using the reactive poll instance
const pollInstance = chatClient.polls.fromState(pollId);
const pollOption = await pollInstance.createOption({ text: "Another option" });
```

> [!WARNING]
> If  `allow_user_suggested_options`  is set to `true` on poll, then user only needs  `CastVote`  permission to access this endpoint. Otherwise user needs  `UpdatePoll`  permission.


### Update poll option

```js
const updatedPollOption = await chatClient.updatePollOption(pollId, {
  id: optionId,
  text: "Updated option",
  my_custom_property: "my_custom_value",
});

// or if you're using the reactive poll instance
const pollInstance = chatClient.polls.fromState(pollId);
const pollOption = await pollInstance.updateOption({
  id: optionId,
  text: "Updated option",
});
```

### Delete poll option

```js
await chatClient.deletePollOption(pollId, optionId);

// or if you're using the reactive poll instance
const pollInstance = chatClient.polls.fromState(pollId);
await pollInstance.deleteOption(optionId);
```

## Querying votes

You are able to query the votes on a poll:

```js
// retrieve all votes on either option1Id or option2Id
const filter = {
  option_id: { $in: [option1Id, option2Id] },
};
const { votes } = await chatClient.queryPollVotes(poll.id, filter);
```

### Votes Queryable Built-In Fields

| Name       | Type                                              | Description                                      | Supported operators       | Example                                             |
| ---------- | ------------------------------------------------- | ------------------------------------------------ | ------------------------- | --------------------------------------------------- |
| id         | string or list of strings                         | the ID of the vote                               | $in, $eq                  | { id: { $in: [ 'abcd', 'defg' ] } }                 |
| user_id    | string or list of strings                         | the ID of the user who casted the vote           | $in, $eq                  | { $user_id: { $eq: 'abcd' } }                       |
| created_at | string, must be formatted as an RFC3339 timestamp | the time the vote was created                    | $eq, $gt, $lt, $gte, $lte | { created_at: { $gte: '2023-12-04T09:30:20.45Z' } } |
| is_answer  | boolean                                           | whether or not the vote is suggested by the user | $eq                       | { is_answer: { $eq: true } }                        |
| option_id  | string or list of strings                         | The ID of the option the vote was casted on      | $in, $eq, $exists         | { option_id: { $in: [ 'abcd', 'defg' ] } }          |

## Querying polls

It is also possible to query for polls based on certain filter criteria:

```js
// retrieve all polls that are closed for voting sorted by created_at
const filter = { is_closed: true };
const sort = { created_at: -1 };
const { polls } = await chatClient.queryPolls(poll.id, filter, sort);

// or if you're using PollManager
const { polls: pollInstances } = await chatClient.polls.queryPolls({
  filter,
  sort,
});
// the returned polls will be ones with reactive state
```

### Poll Queryable Built-In Fields

| Name                         | type                                              | Description                                              | Supported operations           | Example                                          |
| ---------------------------- | ------------------------------------------------- | -------------------------------------------------------- | ------------------------------ | ------------------------------------------------ |
| id                           | string or list of strings                         | the ID of the vote                                       | $in, $eq                       | { id: { $in: [ 'abcd', 'defg' ] } }              |
| poll_id                      | string or list of strings                         | the ID of the poll                                       | $in, $eq                       | { poll_id: { $in: [ 'abcd', 'defg' ] } }         |
| name                         | string or list of strings                         | the ID of the user who casted the vote                   | $in, $eq                       | { name: { $eq: 'abcd' } }                        |
| voting_visibility            | string                                            | indicates whether the votes are casted anonymously       | $eq                            | { voting_visibility: { $eq: 'anonymous' } }      |
| max_votes_allowed            | number                                            | the maximum amount of votes per user                     | $eq, $ne, $gt, $lt, $gte, $lte | { max_votes_allowed: { $gte: 5 } }               |
| allow_user_suggested_options | boolean                                           | indicates whether the poll allows user suggested options | $eq                            | { allow_user_suggested_options: { $eq: false } } |
| allow_answers                | boolean                                           | indicates whether the poll allows user answers           | $eq                            | { allow_answers: { $eq: false } }                |
| is_closed                    | boolean                                           | indicates whether the poll is closed for voting          | $eq                            | { is_closed: { $eq: true } }                     |
| created_at                   | string, must be formatted as an RFC3339 timestamp | the time the poll was created                            | $eq, $gt, $lt, $gte, $lte      | { created_at: {$gte: ‘2023-12-04T09:30:20.45Z’ } |
| updated_at                   | string, must be formatted as an RFC3339 timestamp | the time the poll was updated                            | $eq, $gt, $lt, $gte, $lte      | { updated_at: {$gte: ‘2023-12-04T09:30:20.45Z’ } |
| created_by_id                | string or list of strings                         | the ID of the user who created the poll                  | $in, $eq                       | { id: { $in: [ 'abcd', 'defg' ] } }              |

## Events

The following websocket events will be emitted:

- `poll.updated`  whenever a poll (or its options) gets updated.

- `poll.closed`  whenever a poll is closed for voting.

- `poll.deleted`  whenever a poll gets deleted.

- `poll.vote_casted`  whenever a vote is casted.

- `poll.vote_removed` whenever a vote is removed.

- `poll.vote_changed`  whenever a vote is changed (case of enforce_unique_vote as true)

## Poll updated event

```json
{
  "type": "poll.updated",
  "cid": "messaging-polls:a23de673-dcc4-413f-9923-4d1af0a6f596",
  "channel_id": "a23de673-dcc4-413f-9923-4d1af0a6f596",
  "channel_type": "messaging-polls",
  "message": {
    // ...
  },
  "poll": {
    "id": "3598617e-228b-480a-8004-f441ff195da2",
    "name": "Updated poll name",
    "description": "",
    "voting_visibility": "public",
    "enforce_unique_vote": false,
    "max_votes_allowed": null,
    "allow_user_suggested_options": false,
    "allow_answers": false,
    "vote_count": 0,
    "options": [],
    "vote_counts_by_option": {},
    "answers_count": 0,
    "latest_votes_by_option": {},
    "latest_answers": [],
    "own_votes": [],
    "created_by_id": "b3e6cf5b-d431-40f5-8022-27d246b3a890",
    "created_by": {
      "id": "b3e6cf5b-d431-40f5-8022-27d246b3a890",
      "role": "user",
      "created_at": "2024-04-09T20:43:39.192829Z",
      "updated_at": "2024-04-09T20:43:39.192829Z",
      "last_active": "2024-04-09T20:43:39.192829Z",
      "banned": false,
      "online": true
    },
    "created_at": "2024-04-09T20:43:39.360335Z",
    "updated_at": "2024-04-09T20:43:39.940022Z"
  },
  "created_at": "2024-04-09T20:43:39.96665Z",
  "received_at": "2024-04-09T20:43:39.971Z"
}
```

## Poll closed event

```json
{
  "type": "poll.closed",
  "cid": "messaging-polls:2ac6751f-d1d9-41f2-a800-fe8efec27164",
  "channel_id": "2ac6751f-d1d9-41f2-a800-fe8efec27164",
  "channel_type": "messaging-polls",
  "message": {
    // ...
  },
  "poll": {
    "id": "d9e4bb1c-20b9-40fa-937d-616dff4268fc",
    "name": "Updated poll name",
    "description": "",
    "voting_visibility": "public",
    "enforce_unique_vote": false,
    "max_votes_allowed": null,
    "allow_user_suggested_options": false,
    "allow_answers": false,
    "is_closed": true,
    "vote_count": 0,
    "options": [],
    "vote_counts_by_option": {},
    "answers_count": 0,
    "latest_votes_by_option": {},
    "latest_answers": [],
    "own_votes": [],
    "created_by_id": "dcc77240-440c-436d-8016-ed666654d1ee",
    "created_by": {
      "id": "dcc77240-440c-436d-8016-ed666654d1ee",
      "role": "user",
      "created_at": "2024-04-09T20:54:42.894589Z",
      "updated_at": "2024-04-09T20:54:42.894589Z",
      "last_active": "2024-04-09T20:54:42.894589Z",
      "banned": false,
      "online": true
    },
    "created_at": "2024-04-09T20:54:43.060539Z",
    "updated_at": "2024-04-09T20:54:43.567798Z"
  },
  "created_at": "2024-04-09T20:54:43.592833Z",
  "received_at": "2024-04-09T20:54:43.597Z"
}
```

## Poll deleted event

```json
{
  "type": "poll.deleted",
  "cid": "messaging-polls:5671fbb8-b02e-40e9-a93d-5c6da9db7ef0",
  "channel_id": "5671fbb8-b02e-40e9-a93d-5c6da9db7ef0",
  "channel_type": "messaging-polls",
  "message": {
    // ...
  },
  "poll": {
    "id": "3ed6694e-cb16-4190-b573-69fd9586ea74",
    "name": "poll-58612adb-cee6-4267-b47f-138aa21593a6",
    "description": "",
    "voting_visibility": "public",
    "enforce_unique_vote": false,
    "max_votes_allowed": null,
    "allow_user_suggested_options": false,
    "allow_answers": false,
    "vote_count": 0,
    "options": [
      {
        "id": "5f430775-45af-4112-87d9-fbe6a115229f",
        "text": "Option 1"
      },
      {
        "id": "93123a94-daf9-464e-a2fc-f00b20764dcd",
        "text": "Option 2"
      }
    ],
    "vote_counts_by_option": {},
    "answers_count": 0,
    "latest_votes_by_option": {},
    "latest_answers": [],
    "own_votes": [],
    "created_by_id": "17621af7-fab8-4daf-9812-42f3194526b8",
    "created_at": "2024-04-09T20:57:43.644546Z",
    "updated_at": "2024-04-09T20:57:43.644546Z"
  },
  "user": {
    "id": "17621af7-fab8-4daf-9812-42f3194526b8",
    "role": "user",
    "created_at": "2024-04-09T20:57:43.50881Z",
    "updated_at": "2024-04-09T20:57:43.50881Z",
    "last_active": "2024-04-09T20:57:43.50881Z",
    "banned": false,
    "online": true
  },
  "created_at": "2024-04-09T20:57:44.150552Z",
  "received_at": "2024-04-09T20:57:44.159Z"
}
```

## Vote casted event

```json
{
  "type": "poll.vote_casted",
  "cid": "messaging-polls:629e4e73-1811-4e3d-bb0a-e9ba7a7a1502",
  "channel_id": "629e4e73-1811-4e3d-bb0a-e9ba7a7a1502",
  "channel_type": "messaging-polls",
  "message": {
    // ...
  },
  "poll": {
    "id": "8613282d-c492-4630-94fb-12537fa95e55",
    "name": "poll-10acb1ca-1140-45b7-bc12-61bd86403760",
    "description": "",
    "voting_visibility": "public",
    "enforce_unique_vote": false,
    "max_votes_allowed": null,
    "allow_user_suggested_options": false,
    "allow_answers": false,
    "vote_count": 1,
    "options": [
      {
        "id": "fff6357f-56e4-442b-b566-1312b48faf3a",
        "text": "Option 1"
      }
    ],
    "vote_counts_by_option": {
      "fff6357f-56e4-442b-b566-1312b48faf3a": 1
    },
    "answers_count": 0,
    "latest_votes_by_option": {
      "fff6357f-56e4-442b-b566-1312b48faf3a": [
        {
          "poll_id": "8613282d-c492-4630-94fb-12537fa95e55",
          "id": "7afe9ee6-1cf2-4ba2-a07e-4ee2dd51d4ba",
          "option_id": "fff6357f-56e4-442b-b566-1312b48faf3a",
          "user_id": "9e673f6f-e32b-46cf-9296-39bc84e86fd4",
          "user": {
            "id": "9e673f6f-e32b-46cf-9296-39bc84e86fd4",
            "role": "user",
            "created_at": "2024-04-09T20:58:52.154483Z",
            "updated_at": "2024-04-09T20:58:52.154483Z",
            "last_active": "2024-04-09T20:58:52.154483Z",
            "banned": false,
            "online": true
          },
          "created_at": "2024-04-09T20:58:52.799538Z",
          "updated_at": "2024-04-09T20:58:52.799538Z"
        }
      ]
    },
    "latest_answers": [],
    "own_votes": [],
    "created_by_id": "9e673f6f-e32b-46cf-9296-39bc84e86fd4",
    "created_by": {
      "id": "9e673f6f-e32b-46cf-9296-39bc84e86fd4",
      "role": "user",
      "created_at": "2024-04-09T20:58:52.154483Z",
      "updated_at": "2024-04-09T20:58:52.154483Z",
      "last_active": "2024-04-09T20:58:52.154483Z",
      "banned": false,
      "online": true
    },
    "created_at": "2024-04-09T20:58:52.324944Z",
    "updated_at": "2024-04-09T20:58:52.324944Z"
  },
  "poll_vote": {
    "poll_id": "8613282d-c492-4630-94fb-12537fa95e55",
    "id": "7afe9ee6-1cf2-4ba2-a07e-4ee2dd51d4ba",
    "option_id": "fff6357f-56e4-442b-b566-1312b48faf3a",
    "user_id": "9e673f6f-e32b-46cf-9296-39bc84e86fd4",
    "user": {
      "id": "9e673f6f-e32b-46cf-9296-39bc84e86fd4",
      "role": "user",
      "created_at": "2024-04-09T20:58:52.154483Z",
      "updated_at": "2024-04-09T20:58:52.154483Z",
      "last_active": "2024-04-09T20:58:52.154483Z",
      "banned": false,
      "online": true
    },
    "created_at": "2024-04-09T20:58:52.799538Z",
    "updated_at": "2024-04-09T20:58:52.799538Z"
  },
  "created_at": "2024-04-09T20:58:52.82498Z",
  "received_at": "2024-04-09T20:58:52.831Z"
}
```

## Vote removed event

```json
{
  "type": "poll.vote_removed",
  "cid": "messaging-polls:!members-j8Uw02jyV30DUXTHql5eoq2EHQ8m3lDNMTidgJS833A",
  "channel_id": "!members-j8Uw02jyV30DUXTHql5eoq2EHQ8m3lDNMTidgJS833A",
  "channel_type": "messaging-polls",
  "message": {
    // ...
  },
  "poll": {
    "id": "987b7ffc-a4e5-4c02-b82c-f8d06d2b7f09",
    "name": "poll-dbbbe015-0a5b-4073-993c-bd40b83b8458",
    "description": "",
    "voting_visibility": "public",
    "enforce_unique_vote": false,
    "max_votes_allowed": null,
    "allow_user_suggested_options": false,
    "allow_answers": false,
    "vote_count": 0,
    "options": [
      {
        "id": "a89ef738-5443-406e-8f47-7f68ded8caab",
        "text": "Option 1"
      }
    ],
    "vote_counts_by_option": {},
    "answers_count": 0,
    "latest_votes_by_option": {},
    "latest_answers": [],
    "own_votes": [],
    "created_by_id": "50d6bf78-c529-45a8-9c69-6755e8a31ef3",
    "created_by": {
      "id": "50d6bf78-c529-45a8-9c69-6755e8a31ef3",
      "role": "user",
      "created_at": "2024-04-09T21:47:09.572264Z",
      "updated_at": "2024-04-09T21:47:09.572264Z",
      "last_active": "2024-04-09T21:47:09.572264Z",
      "banned": false,
      "online": true
    },
    "created_at": "2024-04-09T21:47:09.617585Z",
    "updated_at": "2024-04-09T21:47:09.617585Z"
  },
  "poll_vote": {
    "poll_id": "987b7ffc-a4e5-4c02-b82c-f8d06d2b7f09",
    "id": "dc7e9ea2-8df8-48e1-9268-1fcb574d0442",
    "option_id": "a89ef738-5443-406e-8f47-7f68ded8caab",
    "user_id": "50d6bf78-c529-45a8-9c69-6755e8a31ef3",
    "user": {
      "id": "50d6bf78-c529-45a8-9c69-6755e8a31ef3",
      "role": "user",
      "created_at": "2024-04-09T21:47:09.572264Z",
      "updated_at": "2024-04-09T21:47:09.572264Z",
      "last_active": "2024-04-09T21:47:09.572264Z",
      "banned": false,
      "online": true
    },
    "created_at": "2024-04-09T21:47:10.163473Z",
    "updated_at": "2024-04-09T21:47:10.163473Z"
  },
  "created_at": "2024-04-09T21:47:10.445489Z",
  "received_at": "2024-04-09T21:47:10.455Z"
}
```

## Vote changed event

```json
{
  "type": "poll.vote_changed",
  "cid": "messaging-polls:629e4e73-1811-4e3d-bb0a-e9ba7a7a1502",
  "channel_id": "629e4e73-1811-4e3d-bb0a-e9ba7a7a1502",
  "channel_type": "messaging-polls",
  "message": {
    // ...
  },
  "poll": {
    "id": "8613282d-c492-4630-94fb-12537fa95e55",
    "name": "poll-10acb1ca-1140-45b7-bc12-61bd86403760",
    "description": "",
    "voting_visibility": "public",
    "enforce_unique_vote": false,
    "max_votes_allowed": null,
    "allow_user_suggested_options": false,
    "allow_answers": false,
    "vote_count": 1,
    "options": [
      {
        "id": "fff6357f-56e4-442b-b566-1312b48faf3a",
        "text": "Option 1"
      }
    ],
    "vote_counts_by_option": {
      "fff6357f-56e4-442b-b566-1312b48faf3a": 1
    },
    "answers_count": 0,
    "latest_votes_by_option": {
      "fff6357f-56e4-442b-b566-1312b48faf3a": [
        {
          "poll_id": "8613282d-c492-4630-94fb-12537fa95e55",
          "id": "7afe9ee6-1cf2-4ba2-a07e-4ee2dd51d4ba",
          "option_id": "fff6357f-56e4-442b-b566-1312b48faf3a",
          "user_id": "9e673f6f-e32b-46cf-9296-39bc84e86fd4",
          "user": {
            "id": "9e673f6f-e32b-46cf-9296-39bc84e86fd4",
            "role": "user",
            "created_at": "2024-04-09T20:58:52.154483Z",
            "updated_at": "2024-04-09T20:58:52.154483Z",
            "last_active": "2024-04-09T20:58:52.154483Z",
            "banned": false,
            "online": true
          },
          "created_at": "2024-04-09T20:58:52.799538Z",
          "updated_at": "2024-04-09T20:58:52.799538Z"
        }
      ]
    },
    "latest_answers": [],
    "own_votes": [],
    "created_by_id": "9e673f6f-e32b-46cf-9296-39bc84e86fd4",
    "created_by": {
      "id": "9e673f6f-e32b-46cf-9296-39bc84e86fd4",
      "role": "user",
      "created_at": "2024-04-09T20:58:52.154483Z",
      "updated_at": "2024-04-09T20:58:52.154483Z",
      "last_active": "2024-04-09T20:58:52.154483Z",
      "banned": false,
      "online": true
    },
    "created_at": "2024-04-09T20:58:52.324944Z",
    "updated_at": "2024-04-09T20:58:52.324944Z"
  },
  "poll_vote": {
    "poll_id": "8613282d-c492-4630-94fb-12537fa95e55",
    "id": "7afe9ee6-1cf2-4ba2-a07e-4ee2dd51d4ba",
    "option_id": "fff6357f-56e4-442b-b566-1312b48faf3a",
    "user_id": "9e673f6f-e32b-46cf-9296-39bc84e86fd4",
    "user": {
      "id": "9e673f6f-e32b-46cf-9296-39bc84e86fd4",
      "role": "user",
      "created_at": "2024-04-09T20:58:52.154483Z",
      "updated_at": "2024-04-09T20:58:52.154483Z",
      "last_active": "2024-04-09T20:58:52.154483Z",
      "banned": false,
      "online": true
    },
    "created_at": "2024-04-09T20:58:52.799538Z",
    "updated_at": "2024-04-09T20:58:52.799538Z"
  },
  "created_at": "2024-04-09T20:58:52.82498Z",
  "received_at": "2024-04-09T20:58:52.831Z"
}
```

## Permissions

The following permissions can be configured to allow or disallow certain actions on Polls:

## App permissions

- `CreatePoll`  allows or disallows a user to create polls.

- `UpdatePoll`  allows or disallows a user to update polls.

- `DeletePoll`  allows or disallows a user to delete polls.

- `ClosePoll`  allows or disallows a user to close a poll.

- `QueryPolls`  allows or disallows a user to query polls.

## Channel permissions

- `SendPoll`  allows or disallows a user to send a poll as part of a message.

- `CastVote`  allows or disallows a user to cast vote(s) on a poll.

- `QueryVotes`  allows or disallows a user to query the vote(s) on a poll.
