# User Token

## Static token

```js
const client = new StreamChat('api_key');
client.setUser({ id: 'vishal' }, 'user_token_string');
```

## Token Provider

```js
const client = new StreamChat('api_key');
client.setUser(
    { id: 'vishal' },
    async () => {
        const token = await fetchTokenFromApi();

        return token;
    }
);
```