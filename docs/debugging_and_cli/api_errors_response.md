Below you can find the complete list of errors that are returned by the API together with the description, API code, and corresponding HTTP status of each error.

| Name                                   | HTTP Status Code | HTTP Status                     | Stream Code | Description                                                                               |
| -------------------------------------- | ---------------- | ------------------------------- | ----------- | ----------------------------------------------------------------------------------------- |
| Input Error                            | 400              | Bad Request                     | 4           | When wrong data/parameter is sent to the API                                              |
| Duplicate Username Error               | 400              | Bad Request                     | 6           | When a duplicate username is sent while enforce_unique_usernames is enabled               |
| Message Too Long Error                 | 400              | Bad Request                     | 20          | Message is too long                                                                       |
| Event Not Supported Error              | 400              | Bad Request                     | 18          | Event is not supported                                                                    |
| Channel Feature Not Supported Error    | 400              | Bad Request                     | 19          | The feature is currently disabled on the dashboard (i.e. Reactions & Replies)             |
| Multiple Nesting Level Error           | 400              | Bad Request                     | 21          | Multiple Levels Reply is not supported - the API only supports 1 level deep reply threads |
| Custom Command Endpoint Call Error     | 400              | Bad Request                     | 45          | Custom Command handler returned an error                                                  |
| Custom Command Endpoint Missing Error  | 400              | Bad Request                     | 44          | App config does not have custom_action_handler_url                                        |
| Authentication Error                   | 401              | Unauthorised                    | 5           | Unauthenticated, problem with authentication                                              |
| Authentication Token Expired           | 401              | Unauthorised                    | 40          | Unauthenticated, token expired                                                            |
| Authentication Token Before Issued At  | 401              | Unauthorised                    | 42          | Unauthenticated, token date incorrect                                                     |
| Authentication Token Not Valid Yet     | 401              | Unauthorised                    | 41          | Unauthenticated, token not valid yet                                                      |
| Authentication Token Signature Invalid | 401              | Unauthorised                    | 43          | Unauthenticated, token signature invalid                                                  |
| Access Key Error                       | 401              | Unauthorised                    | 2           | Access Key invalid                                                                        |
| Not Allowed Error                      | 403              | Forbidden                       | 17          | Unauthorised / forbidden to make request                                                  |
| App Suspended Error                    | 403              | Forbidden                       | 99          | App suspended                                                                             |
| Cooldown Error                         | 403              | Forbidden                       | 60          | User tried to post a message during the cooldown period                                   |
| Does Not Exist Error                   | 404              | Not Found                       | 16          | Resource not found                                                                        |
| Request Timeout Error                  | 408              | Request Timeout                 | 23          | Request timed out                                                                         |
| Payload Too Big Error                  | 413              | Request Entity Too Large        | 22          | Payload too big                                                                           |
| Rate Limit Error                       | 429              | Too Many Requests               | 9           | Too many requests in a certain time frame                                                 |
| Maximum Header Size Exceeded Error     | 431              | Request Header Fields Too Large | 24          | Request headers are too large                                                             |
| Internal System Error                  | 500              | Internal Server Error           | -1          | Triggered when something goes wrong in our system                                         |
| No Access to Channels                  | 403              | Unauthorised                    | 70          | No access to requested channels                                                           |
| Message Moderation Failed              | 400              | Bad Request                     | 73          | Message did not pass moderation                                                           |

## Common Errors Explained

This section explains how to solve common API errors.

### GetOrCreateChannel failed

The full error you receive is "GetOrCreateChannel failed with error: "either data.created_by or data.created_by_id must be provided when using server side auth." with error code 4. This error is only triggered when using server side authentication.

You can encounter this error when calling channel.watch(), channel.create() or channel.query(). All three methods call get or create a channel. There are two possible causes for this error:

**1. You are trying to watch a channel that hasn't been created**

You are expecting that the channel is already created. For instance if you have the following code:

```js
const serverClient = new StreamChat("key", "secret");
const channel = serverClient.channel("messaging", 123);
channel.watch();
```

The above code works well if the channel with cid messaging:123 already exists. If it doesn't exist yet it will throw the above error. So you can get this error when calling channel.watch if another part of your code failed to create the channel.

**2. You want to create a channel but forgot the created_by_id param**

If you're actually intending to create a channel in this part of your code you need to specify the user as follows:

```js
const serverClient = new StreamChat("key", "secret");
// create the channel and set created_by to user id 4645
const channel = serverClient.channel("messaging", "123", {
  created_by_id: "4645",
});
channel.create();
```
