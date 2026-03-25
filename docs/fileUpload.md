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

## Upload progress tracking (axios)

You can track upload progress by passing axios’s `onUploadProgress` in the optional request config. This works with `client.uploadFile`, `client.uploadImage`, and with `channel.sendFile` / `channel.sendImage`.

```js
// Client upload with progress
const response = await client.uploadFile(file, file.name, file.type, undefined, {
  onUploadProgress: (progressEvent) => {
    const percent = progressEvent.total
      ? Math.round((progressEvent.loaded * 100) / progressEvent.total)
      : 0;
    console.log(`Upload: ${percent}%`);
  },
});

// Channel sendFile with progress
const response = await channel.sendFile(file, file.name, file.type, undefined, {
  onUploadProgress: (progressEvent) => {
    const percent = progressEvent.total
      ? Math.round((progressEvent.loaded * 100) / progressEvent.total)
      : 0;
    console.log(`Upload: ${percent}%`);
  },
});
```

## Message composer / attachment manager

When using the message composer’s attachment manager, upload progress is tracked when `config.attachments.trackUploadProgress` is `true` (the default). Progress is stored on each attachment’s `localMetadata.uploadProgress` (0–100 for the default upload path, from the axios progress event; the initial state is 0% when the upload starts).

With a custom `doUploadRequest`, the function receives an optional second argument `options` with `onProgress?: (percent: number | undefined) => void`. Call `onProgress` from your upload implementation to drive the same `localMetadata.uploadProgress` updates. If you do not call it, `uploadProgress` stays at 0 until the upload finishes.

Set `trackUploadProgress` to `false` to skip setting `uploadProgress` and to omit progress callbacks to both the default channel upload and custom `doUploadRequest`.
