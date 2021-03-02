# User Token

## Static token

```js
const client = StreamChat.getInstance('api_key');
client.connectUser({ id: 'vishal' }, 'user_token_string');
```

## Token Provider

You can use this feature to use short-lived token within your app. When the token expires, the WS connection will get a new token from the Token Provider and reconnect.

```js
const client = StreamChat.getInstance('api_key');
client.connectUser({ id: 'vishal' }, async () => await fetchTokenFromApi());
```

Make sure the TokenProvider function always resolves, you can wrap your async function with an async-retryable to not reject the promise immediately in case of a network issue. For example:

```js
const retry = require('async-retry');

const fetchTokenFromApi = async () => {
  const response = await fetch('https://my-api.com/token');
  const data = await response.json();
  return data.token;
};

const retryableTokenProvider = () => retry(fetchTokenFromApi, { minTimeout: 1000 });

client.connectUser({ id: 'vishal' }, retryableTokenProvider);
```
