# File Upload

Stream JS client supports uploading files in both browser and Node.js environment.

## Token

You can get your API key and API secret in [Stream Dashboard](https://getsream.io/dashboard/).
User token can be generated using your API Secret and any random User ID using [Stream Token Generator](https://getstream.io/chat/docs/javascript/token_generator/).

```js
const apiKey = 'swde2zgm3549';
const apiSecret = 'YOUR_SUPER_SECRET_TOKEN';
const userId = 'dawn-union-6';
const userToken =
  'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJ1c2VyX2lkIjoiZGF3bi11bmlvbi02In0.mpf8pgxn5r02EqsChMaw6SdCFCyBBl7VJhyleTqEwho';
```

## Node.js

In order to upload a file, you first need to create an instance of stream client, and a channel to send the files to it.

```js
const fs = require('fs');
const { StreamChat } = require('stream-chat');

const user = { id: 'user_id' };
const apiKey = 'swde2zgm3549'; // use your app key
const apiSecret = 'YOUR_SUPER_SECRET_TOKEN'; // use your app secret
const client = StreamChat.getInstance(apiKey, apiSecret);

const channel = client.channel('messaging', 'channel_id', { created_by: user });
await channel.create(); // if channel does not exist yet

const file = fs.createReadStream('./helloworld.txt');
const response = await channel.sendFile(file, 'helloworld.txt', 'text/plain', user);
console.log('file url: ', response.file);
```

## Browser

```html
<!DOCTYPE html>
<html lang="en">
  <body>
    <input id="input" type="file" />
    <a id="link" href=""></a>

    <script src="https://cdn.jsdelivr.net/npm/stream-chat"></script>

    <script>
      const apiKey = 'swde2zgm3549'; // use your app key
      const userId = 'dawn-union-6';
      const userToken =
        'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJ1c2VyX2lkIjoiZGF3bi11bmlvbi02In0.mpf8pgxn5r02EqsChMaw6SdCFCyBBl7VJhyleTqEwho';

      const chatClient = StreamChat.getInstance(apiKey);
      chatClient.connectUser({ id: userId }, userToken);
      const channel = chatClient.channel('messaging', userId, { members: [userId] });
      channel.create();

      const handleFiles = (e) => {
        channel.sendFile(e.target.files[0]).then((file) => {
          const link = document.getElementById('link');
          link.setAttribute('href', file.file);
          link.text = file.file;
        });
      };

      document.getElementById('input').addEventListener('change', handleFiles, false);
    </script>
  </body>
</html>
```
