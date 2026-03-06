## Authentication

Stream uses JWT (JSON Web Tokens) to authenticate users so they can open WebSocket connections and send API requests. When a user opens your app, they first pass through your own authentication system. After that, the Stream SDK is initialized and a client instance is created. The device then requests a Stream token from your server. Your server verifies the request and returns a valid token. Once the device receives this token, the user is authenticated and ready to start using chat.

## Generating Tokens

You can generate tokens on the server by creating a Server Client and then using the Create Token method.

If generating a token to use client-side, the token must include the userID claim in the token payload, whereas server tokens do not. When using the create token method, pass the user_id parameter to generate a client-side token.

```js
// Define values.
const api_key = "{{ api_key }}";
const api_secret = "{{ api_secret }}";
const user_id = "john";

// Initialize a Server Client
const serverClient = StreamChat.getInstance(api_key, api_secret);
// Create User Token
const token = serverClient.createToken(user_id);
```

### Manually Generating Tokens

You can use the JWT generator on this page to generate a User Token JWT without needing to set up a server client. You can use this token for prototyping and debugging; usually by hardcoding this into your application or passing it as an environment value at initialization.

You will need the following values to generate a token:

- `User ID` : A unique string to identify a user.

- `API Secret` : You can find this value in the [Dashboard](https://getstream.io/dashboard/).

To generate a token, provide a `User ID` and your `API Secret` to the following generator:

_Use the [Stream Dashboard](https://getstream.io/dashboard/) to generate tokens for testing._

For more information on how JWT works, please visit <https://jwt.io>.

## Setting Automatic Token Expiration

By default, user tokens are valid indefinitely. You can set an expiration to tokens by passing it as the second parameter. The expiration should contain the number of seconds since Unix epoch (00:00:00 UTC on 1 January 1970).

```js
// creates a token that expires in 1 hour using moment.js
const timestamp = Number(moment().add("1h").format("X"));
const token1 = client.createToken("john", timestamp);

// the same can be done with plain javascript
const token2 = client.createToken(
  "john",
  Math.floor(Date.now() / 1000) + 60 * 60,
);
```

## Token Providers

A concept we will refer to throughout the docs is a Token Provider. At a high level, the Token Provider is an endpoint on your server that can perform the following sequence of tasks:

1. Receive information about a user from the front end.

2. Validate that user information against your system.

3. Provide a User-ID corresponding to that user to the server client's token creation method.

4. Return that token to the front end.

To learn more about Token Providers, read on in our [Initialization & Users](/chat/docs/node/init_and_users/) section.

## Developer Tokens

For development applications, it is possible to disable token authentication and use client-side generated tokens or a manually generated static token. Disabling auth checks is not suitable for a production application and should only be done for proofs-of-concept and applications in the early development stage. To enable development tokens, you need to change your application configuration.

On the [Dashboard](https://getstream.io/dashboard/):

1. Select the App you want to enable developer tokens on and ensure it is in Development mode

2. Click _App_ name to enter the _Chat Overview_

3. Scroll to the _General_ section

4. Toggle _Disable Authentication Checks_

This disables the authentication check, but does not remove the requirement to send a token. Send either a client generated development token, or manually create one and hard code it into your application.

```js
await client.connectUser(
  {
    id: "john",
    name: "John Doe",
    image: "https://getstream.io/random_svg/?name=John",
  },
  client.devToken("john"),
);
```

## Manual Token Expiration

Token Revocation is a way to manually expire tokens for a single user or for many users by setting a `revoke_tokens_issued_before` time, and any tokens issued before this will be considered expired and will fail to authenticate.  This can be reversed by setting the field to null.

### Token Revocation by User

You can revoke all tokens that belong to a certain user or a list of users.

```js
await client.revokeUserToken("user-id", revokeDate);
await client.revokeUsersToken(["user1-id", "user2-id"], revokeDate);
```

Note: Your tokens must include the `iat` (issued at time) claim, which will be compared to the time in the `revoke_tokens_issued_before` field to determine whether the token is valid or expired.  Tokens which have no `iat` will be considered invalid.

### Undoing the revoke

To undo user-level token revocation, you can simply set revocation date to `null`:

```js
await client.revokeUserToken("user-id", null);
await client.revokeUsersToken(["user1-id", "user2-id"], null);
```

### Token Revocation by Application

It is possible to revoke tokens for all users of an application. This should be used with caution as it will expire every user's token, regardless of whether the token has an `iat` claim.

```js
await client.revokeTokens(revokeDate);
// you can pass Date or ISOstring as value here
```

### Undoing the revoke

To undo app-level token revocation, you can simply set revocation date to `null`:

```js
await client.revokeTokens(null);
```

### Adding iat claim to token

By default, user tokens generated through the createToken function do not contain information about time of issue. You can change that by passing the issue date as the third parameter while creating tokens. This is a security best practice, as it enables revoking tokens.

```js
client.createToken("user-id", expireTime, issuedAt);
// issuedAt should be unix timestamp
// issuedAt = Math.floor(Date.now() / 1000)
```
