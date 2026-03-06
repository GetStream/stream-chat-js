> [!NOTE]
> Customizing push content is optional, as we provide well-designed default templates. Just make sure to enable push notifications for each notification type you plan to support.


Once push notifications are enabled for your app, you can customize the templates to match your app’s needs. This lets you control how notifications appear on users' devices. You can do this through the dashboard or via the API, as shown below:

## Enabling and Customizing Push Templates

The [Upsert Push Template REST endpoint](https://getstream.github.io/protocol/?urls.primaryName=Chat#/product%3Achat/UpsertPushTemplate) allows you to enable push notifications notification type and optionally define custom templates. Supported event types include `message.new`, `message.updated`, `reaction.new` and more.

Following is a sample payload for enabling push notifications with default template:

```json
{
  "enable_push": true,
  "event_type": "message.new",
  "push_provider_type": "apn",
  "push_provider_name": "apn"
}
```

Following is a sample payload for enabling push notifications with custom template:

```json
{
  "enable_push": true,
  "event_type": "message.new",
  "push_provider_type": "firebase",
  "push_provider_name": "firebase",
  "template": "{\"data\":{\"version\":\"v2\",\"sender\":\"stream.chat\",\"type\":\"{{ event_type }}\",\"id\":\"{{ message.id }}\",\"message_id\":\"{{ message.id }}\",\"channel_type\":\"{{ channel.type }}\",\"channel_id\":\"{{ channel.id }}\",\"cid\":\"{{ channel.cid }}\",\"receiver_id\":\"{{ receiver.id }}\"},\"android\":{\"priority\":\"high\"},\"apns\":{\"payload\":{\"aps\":{\"alert\":{\"title\":\"New message from {{ sender.name }}\",\"body\":\"{{ truncate message.text 150 }}\"},\"badge\":{{ unread_count }},\"sound\":\"default\",\"mutable-content\":1,\"content-available\":0}}}}"
}
```

**Available Fields:**

| Field Name           | Type                                                    | Description                                                                                                    |
| -------------------- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `enable_push`        | Boolean                                                 | Indicates whether push notifications are enabled for this event type.                                          |
| `event_type`         | String<br/>(message.new, message.updated, reaction.new) | The type of event used to apply the corresponding custom push configuration.                                   |
| `push_provider_type` | String                                                  | The type of push provider                                                                                      |
| `push_provider_name` | String                                                  | The name of the configured push provider instance. Can be left empty if you're not using multi-bundle support. |
| `template`           | String                                                  | The push notification template as a stringified JSON object.                                                   |

## Default Templates

Push v3 supports templating for both Firebase and APNs. Configuring templates is optional — if no custom templates are provided, Stream will automatically use the default templates for Firebase and APNs.

> [!NOTE]
> The version field in the data payload is set to **v2**. It is to ensure backward compatibility with the existing SDKs.


### Firebase default template

```json
{
  "data": {
    "version": "v2",
    "sender": "stream.chat",
    "type": "{{ event_type }}",
    "id": "{{ message.id }}",
    "message_id": "{{ message.id }}",
    "channel_type": "{{ channel.type }}",
    "channel_id": "{{ channel.id }}",
    "cid": "{{ channel.cid }}",
    "receiver_id": "{{ receiver.id }}"
  },
  "android": {
    "priority": "high"
  },
  "apns": {
    "payload": {
      "aps": {
        "alert": {
          "title": "New message from {{ sender.name }}",
          "body": "{{ truncate message.text 150 }}"
        },
        "badge": {{ unread_count }},
        "sound": "default",
        "mutable-content": 1,
        "content-available": 0
      }
    }
  }
}
```

By default, there is only a data message and no notification field in the android payload.

If a template is set, then the template will be processed and put into the notification key in the payload. To see available fields and their description please follow [FCM documentation](https://firebase.google.com/docs/reference/fcm/rest/v1/projects.messages#AndroidNotification).

Following is a sample android template with notification:

```json
{
  "android": {
    "notification": {
      "title": "{{ sender.name }} @ {{ channel.name }}",
      "body": "{{ truncate message.text 150 }}",
      "click_action": "OPEN_ACTIVITY_1",
      "sound": "default"
    },
    "priority": "high"
  }
}
```

### APN default template

```json
{
  "payload": {
    "aps": {
      "alert": {
        "title": "You have a new message",
        "body": "{{ truncate message.text 150 }}"
      },
      "badge": {{ unread_count }},
      "sound": "default",
      "mutable-content": 1,
      "content-available": 0
   },
    "stream": {
      "version": "v2",
      "sender": "stream.chat",
      "type": "{{ event_type }}",
      "id": "{{ message.id }}",
      "cid": "{{ channel.cid }}",
      "receiver_id": "{{ receiver.id }}"
    }
  }
}
```

## Context Variables

For both Firebase and APN, the payload that is being sent is rendered using the [handlebars](http://handlebarsjs.com/) templating language, to ensure full configurability for your app.

Stream provides the following variables in the template rendering context:

| Name            | Type    | Description                                                                                                                                                        |
| --------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| sender          | object  | Sender object. You can access the user name, id or any other custom field you have defined for the user                                                            |
| receiver        | object  | Receiver object. You can access the user name, id or any other custom field you have defined for the user                                                          |
| message         | object  | Message object. You can access the text of the message (or a preview of it if the message is too large) or any other custom field you have defined for the message |
| isThread        | boolean | Indicates whether the message is a thread message or not                                                                                                           |
| isMentioned     | boolean | Indicates whether the user is mentioned in the message or not.                                                                                                     |
| channel         | object  | Channel object. You can access the channel name and any other custom field you have defined for this channel                                                       |
| unread_count    | integer | Number of unread messages                                                                                                                                          |
| unread_channels | integer | Number of unread channels for this user                                                                                                                            |
| reaction        | object  | Reaction object. You can access the reaction type and any other custom field you have defined for this channel                                                     |
| members         | array   | Channel members. You can access the user name, id and any other custom field of each member (i.e. excluding sender)                                                |
| otherMembers    | array   | Like members but the user who will be receiving the notification is excluded (i.e. excluding sender and receiver)                                                  |

## Limitations

There are some limitations that Stream imposes on the push notification handlebars template to make sure no malformed payloads are being sent to push providers.

### 1: Custom Arrays Can't Be Indexed

For example, given the context:

```json
{
  "sender": {
    "name": "Bob",
    "some_array": ["foo", "bar"]
  }
}
```

And the template:

```json
"title": {{ sender.some_array.[0] }}
```

The rendered payload will be:

```json
"title": ""
```

### 2: Interpolating Whole Lists and Objects Isn't Allowed

For example, given the context:

```json
{
  "sender": {
    "name": "bob",
    "some_array": ["foo", "bar"],
    "address": {
      "street": "willow str"
    }
  }
}
```

And the template:

```json
"title": "{{ sender.some_array }} {{ sender.address }}"
```

The rendered payload will be:

```json
"title": "[] {}"
```

### 3: Unquoted fields that aren't in the context will be rendered as empty strings

For example, given the context:

```json
{
  "sender": {
    "name": "bob"
  }
}
```

And the template:

```json
"title": {{ sender.missing_field }}
```

The rendered payload will be:

```json
"title": ""
```

## Advanced Use Cases

For advanced use cases (e.g. A list of channel members in the notification title, conditional rendering, etc), Stream provides some handlebars helper functions.

### Helper Functions

| name           | type     | description                                                                                                                                                                                                           |
| -------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| implodemembers | function | takes the list of channel members and implodes it into a single string, using a custom limit, separator and suffix.                                                                                                   |
| json           | function | renders passed parameter as JSON (e.g {"channel":{{{ json channel }}}} )                                                                                                                                              |
| each           | function | For loop. Use this to access the current variable, @index for the current index and @first and @last as convenience booleans to determine if the iteration is at its first/last element                               |
| if             | function | If function. Tests trueness of given parameter. Supports else statement. (e.g {{#if sender.name}}{{ sender.name }}{{/if}} )                                                                                           |
| unless         | function | Unless function. Tests falseness of given parameter. Supports else statement. (e.g {{#unless sender.name}}Missing name{{/unless}} )                                                                                   |
| equal          | function | Equality check function. Tests equality of the given 2 parameters. Supports else statement. (e.g {{#equal channel.type "messaging" }}This is the messaging channel{{else}}This is another channel{{/equal}} )         |
| unequal        | function | Inequality check function. Tests inequality of the given 2 parameters. Supports else statement. (e.g {{#unequal channel.type "messaging" }}This is another channel{{else}}This is the messaging channel{{/unequal}} ) |
| ifLt           | function | If less than. Supports else statement.                                                                                                                                                                                |
| ifLte          | function | If less than or equal. Supports else statement.                                                                                                                                                                       |
| ifGt           | function | If greater than. Supports else statement.                                                                                                                                                                             |
| ifGte          | function | If greater than or equal. Supports else statement.                                                                                                                                                                    |
| remainder      | function | Calculates the difference between the length of an array and an integer (e.g {{remainder otherMembers 2}}                                                                                                             |
| truncate       | function | Truncate given text to given length (e.g {{ truncate message.text 150 }})                                                                                                                                             |

Most of the functions above are straight forward, except for `implodeMembers` , which will be detailed further.

The full function signature is: `{{implodeMembers otherMembers|members [limit=] [separator=] [nameField=] [suffixFmt=]}}`

### Function Parameters

| name         | type    | description                                                                                   | default                       |
| ------------ | ------- | --------------------------------------------------------------------------------------------- | ----------------------------- |
| otherMembers | members | array                                                                                         | Which member array to implode |
| limit        | integer | How many member names to show before adding the suffix                                        | 3                             |
| nameField    | string  | Field name from which field to retrieve the member's name. **Note:** does not support nesting | name                          |
| separator    | string  | Separator to use for channel members                                                          | ,                             |
| suffixFmt    | string  | Format string to use for the suffix. **Note:** only %d is allowed for formatting              | and %d other(s)               |

### Data-only push notifications

Data-only push notifications carry no UI alert—just a small key/value payload your app handles. Use them to poke the app to sync or fetch fresh data: send only a data payload (no notification body). On iOS, mark the APNs/FCM message as silent (`content-available: 1`) and delivery is opportunistic and not guaranteed. On Android, data messages go to your background handler; if work is long or the OS is aggressive, escalate priority and hand off to a foreground service. Keep payloads tiny and idempotent, and treat them as a trigger to fetch real content—not as a guaranteed delivery mechanism.

They are also particularly useful whenever we want to consume and display the notification ourselves, without involving the operating system directly.

Provided below is an example notification template configuration that we can use to allow for data-only notifications on both iOS and Android:

```json
{
  "data": {
    "version": "v2",
    "sender": "stream.chat",
    "type": "{{ event_type }}",
    "id": "{{ message.id }}",
    "channel_type": "{{ channel.type }}",
    "channel_id": "{{ channel.id }}",
    "cid": "{{ channel.cid }}",
    "receiver_id": "{{ receiver.id }}",
    "my_custom_notification_body": "BODY: {{ truncate message.text 150 }}"
  },
  "android": {
    "priority": "high"
  },
  "apns": {
    "headers": {
      "apns-push-type": "background",
      "apns-priority": "5"
    },
    "payload": {
      "aps": {
        "content-available": 1
      },
      "stream": {
        "title": "New message from {{ sender.name }}",
        "body": "{{ truncate message.text 150 }}"
      }
    }
  }
}
```

Since we are no longer relying on `apns.payload.aps.alert` to control our `body` and `title`, we have to have a way to ingest it within our `data`. However, since both of these are blacklisted fields to set to our `data` object they have to be set in the `stream` object directly and used from there for these types of notifications.

Whenever crafting custom payload templates, it is very important to keep the `version` to `v2`, which is done for backwards compatibility reasons.

Another important part to understand is the fact that data-only push notifications must not exceed `4KB`. Due to this, we have to be careful never to send the full payload (and only handpick certain parts of it that we need). We also have to be careful to truncate the text in the event of having very, very long messages whose text might go above this limit.

### Examples

Let's put these helpers to use in a few examples:

#### Example 1

Rendering channel members in the notification title. Each member's name is stored in the  `fullName`  field.

What we want to achieve:

```json
{
  "aps": {
    "alert": {
      "title": "Bob Jones, Jessica Wright, Tom Hadle and 4 other(s)",
      "body": "Bob Jones: Hello there fellow channel members"
    },
    "badge": 0
  }
}
```

How we will achieve it: using  `implodeMembers`  with a custom name field (leaving others empty so that defaults will be used):

```json
{
  "aps": {
    "alert": {
      "title": "{{implodeMembers otherMembers nameField="fullName"}}",
      "body": "{{ sender.fullName }}: {{ message.text }}"
    },
    "badge": {{ unread_count }}
  }
}
```

#### Example 2

Rendering channel members in the notification title. Each member's name is stored in the  **nested**   `details.name`  field.

What we want to achieve:

```json
{
  "aps": {
    "alert": {
      "title": "Bob Jones, Jessica Wright, Tom Hadle and 4 other(s)",
      "body": "Bob Jones: Hello there fellow channel members"
    },
    "badge": 0
  }
}
```

How we will achieve it: since  `implodeMembers`  doesn't support nested fields, we need to use a bunch of helpers such as  `each` , `ifLte` . Note how the use of  `~`  will trim the whitespaces so that the title in rendered in a single row:

```json
{
  "aps": {
    "alert": {
      "title": "
      {{~#each otherMembers}}
        {{#ifLte @index 2}}
          {{~this.details.name}}{{#ifLt @index 2 }}, {{/ifLt~}}
        {{~else if @last~}}
          {{{ " " }}} and {{remainder otherMembers 3}} other(s)
        {{~/ifLte~}}
      {{/each~}}",
      "body": "{{ sender.details.name }}: {{ message.text }}"
    },
    "badge": {{ unread_count }}
  }
```
