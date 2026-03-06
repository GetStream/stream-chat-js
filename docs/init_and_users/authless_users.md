Stream Chat also lets you give unauthenticated users access to a limited subset of Stream's capabilities. This is done by using either Guest or Anonymous users.

These two user types are ideal for use cases where users either need to be able to see chat activity prior to authenticating or in scenarios where the additional friction of creating a user account might be unnecessary for a user.

## Guest Users

Guest sessions can be created client-side and do not require any server-side authentication. Support and livestreams are common use cases for guest users because often you want a visitor to be able to use chat on your application without (or before) they have a regular user account.

Guest users are not available to applications using multi-tenancy (teams).

> [!NOTE]
> Guest users are counted towards your MAU usage.


Guest users have a limited set of permissions. You can read more about how to configure permissions [here](/chat/docs/node/chat_permission_policies/). You can create a guest user session by using `setGuestUser` instead of `connectUser`.

You can generate a guest user in a front end client by using the following code:

```js
await client.setGuestUser({ id: "tommaso" });
```

> [!NOTE]
> The user object schema is the same as the one described in the [Initialization and Users](/chat/docs/node/init_and_users/) portion of the docs.


> [!NOTE]
> Creation of guest users can be disabled for your application in the [dashboard](https://getstream.io/dashboard/).


## Anonymous Users

If a user is not logged in, you can call the `connectAnonymousUser` method. While you're anonymous, you can't do much by default, but for the **livestream** channel type, you're still allowed to read the chat conversation.

```js
const connectResponse = await client.connectAnonymousUser();

console.log(connectResponse.me);
```

> [!NOTE]
> Anonymous users are not counted toward your MAU number and only have an impact on the number of concurrent connected clients.


> [!NOTE]
> Anonymous users are not allowed to perform any write operations.
