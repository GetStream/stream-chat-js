Stream supports several slash commands out of the box:

- **/giphy**  query
- **/ban**  @userid reason
- **/unban**  @userid
- **/mute**  @userid
- **/unmute**  @userid

Additionally, it’s possible to add your own commands.

By using Custom Commands, you can receive all messages sent using a specific slash command, eg. `/ticket` , in your application. When configured, every slash command message happening in a Stream Chat application will propagate to an endpoint via an HTTP POST request.

```js
const message = {
  text: "/ticket suspicious transaction with id 1234",
};
const response = await channel.sendMessage(message);
```

Setting up your Custom Command consists of the following steps:

1. Registering your Custom Command

2. Configure a Channel Type

3. Configuring a Custom Action Handler URL

4. Implement a handler for your Custom Command

## Registering Custom Commands

The API provides methods to create, list, get, update, and delete Custom Command definitions. These determine which commands are allowed to be used and how they're presented to the user by providing a description of the command.

### Command Fields

| name        | type   | description                                            | default | optional |
| ----------- | ------ | ------------------------------------------------------ | ------- | -------- |
| name        | string | name of the command                                    | -       | ✓        |
| description | string | description, shown in commands auto-completion         | -       | ✓        |
| args        | string | arguments help text, shown in commands auto-completion | -       | ✓        |
| set         | string | set name used for grouping commands                    | -       | ✓        |

### Creating a Command

```js
await client.createCommand({
  name: "ticket",
  description: "Create a support ticket",
  args: "[description]",
  set: "support_commands_set",
});
```

### List Commands

You can retrieve the list of all commands defined for your application.

```js
await client.listCommands();
```

### Get a Command

You can retrieve a custom command definition.

```js
await client.getCommand("ticket");
```

### Edit a Command

Custom command _description_, _args_ & _set_ can be changed. Only the fields that must change need to be provided, fields that are not provided to this API will remain unchanged.

```js
await client.updateCommand("ticket", {
  description: "Create customer support tickets",
});
```

### Remove a Command

You can remove a custom command definition.

```js
await client.deleteCommand("ticket");
```

> [!NOTE]
> You cannot delete a custom command if there are any active channel configurations referencing it explicitly.


## Configure a Channel Type

In order to be able to use this command in a channel, we’ll need to create, or update an existing, channel type to include the `ticket` command.

```js
await client.createChannelType({
  name: "support-channel-type",
  commands: ["ticket"],
});
```

## Configure a Custom Action URL

In order to use the defined custom commands, you will first have to set an endpoint URL in the App Settings.

```js
await client.updateAppSettings({
  custom_action_handler_url:
    "https://example.com/webhooks/stream/custom-commands?type={type}",
});
```

> [!NOTE]
> You can use a `{type}` variable substitution in the URL to pass on the name of the command that was triggered. See [Webhooks Overview](/chat/docs/node/webhooks_overview/) for more information on URL configuration


## Request format

Your endpoint will receive a POST request with a JSON encoded body containing: message, user and form_data objects. The form_data object will contain values of the interactions initiated by Attachment.

```json
{
  "message": {
    "id": "xyz",
    "text": "/ticket suspicious transaction with id 1234",
    "command": "ticket",
    "args": "suspicious transaction with id 1234",
    "html": "",
    "type": "regular",
    "cid": "messaging:xyz",
    "created_at": "2021-11-16T12:56:59.854Z",
    "updated_at": "2021-11-16T12:56:59.854Z",
    "attachments": [],
    "latest_reactions": [],
    "own_reactions": [],
    "reaction_counts": null,
    "reaction_scores": null,
    "reply_count": 0,
    "mentioned_users": [],
    "silent": false
  },
  "user": {
    "id": "17f8ab2c-c7e7-4564-922b-e5450dbe4fe7",
    "Custom": {
      "name": "jdoe"
    },
    "role": "user",
    "banned": false,
    "online": false
  },
  "form_data": {
    "action": "submit",
    "name": "John Doe",
    "email": "john@doe.com"
  }
}
```

## Response format

If you intend to make any change to the message, you should return a JSON encoded response with the same message structure. Please note that not all message fields can be changed, the full list of fields that can be modified is available in the **rewriting messages** section.

## Discarding messages

Your endpoint can decide to reject the command and return a user message. To do that the endpoint must return a regular message with type set to error.

```json
{
  "message": {
    "type": "error",
    "text": "invalid arguments for command /ticket"
  }
}
```

## Rewriting messages

You can also decide to modify the message, in that case you return the updated version of the message and it will overwrite the user input.

```json
{
  "message": {
    "text": "Ticket #85736 has been created"
  }
}
```

Interactions can be initiated either using Attachment actions:

```json
{
  "message": {
  "text": "Ticket #85736 has been created",
  "attachments": [
    {
      "type": "text",
      "actions": [
        {
          "name": "action",
          "text": "Send",
          "style": "primary",
          "type": "button",
          "value": "submit"
        },
        {
          "name": "action",
          "text": "Cancel",
          "style": "default",
          "type": "button",
          "value": "cancel"
        }
    }
  ]
  }
}
```

> [!NOTE]
> You can find more information on message rewrite in [Before Message Send Webhook](/chat/docs/node/before_message_send_webhook/) page


## Performance considerations

Your webhook endpoint will be part of the send message transaction,
so you should avoid performing any remote calls or potentially slow
operations while processing the request. Stream Chat will give your
endpoint 1 second of time to reply. If your endpoint is not available
(ie. returns a response with status codes 4xx or 5xx) or takes too long,
Stream Chat will continue with the execution and save the message as
usual.

To make sure that an outage on the hook does not impact your
application, Stream will pause your webhook once it is considered
unreachable and it will automatically resume once the webhook is found
to be healthy again.

## Example code

An example of how to handle incoming Custom Command requests can be found in [this repo](https://github.com/GetStream/customcommand).
