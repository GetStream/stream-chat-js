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

## `axiosRequestConfig` (channel and client uploads)

Channel uploads use Axios under the hood. Both **`channel.sendFile`** and **`channel.sendImage`** accept an optional **fifth argument** `axiosRequestConfig` (`AxiosRequestConfig` from axios). The same optional argument exists on **`client.uploadFile`** and **`client.uploadImage`**.

The client merges your config **after** its upload defaults (`timeout: 0`, large `maxContentLength` / `maxBodyLength`, and multipart headers from the form data). Any property you set can override or extend those defaults.

Typical uses:

- **`onUploadProgress`** — track bytes sent (see below)
- **`signal`** — pass `AbortSignal` from an `AbortController` to cancel an in-flight upload
- Other Axios per-request options your runtime supports

### Upload progress (`onUploadProgress`)

```js
// client.uploadFile with progress
const response = await client.uploadFile(file, file.name, file.type, undefined, {
  onUploadProgress: (progressEvent) => {
    const percent = progressEvent.total
      ? Math.round((progressEvent.loaded * 100) / progressEvent.total)
      : 0;
    console.log(`Upload: ${percent}%`);
  },
});

// channel.sendFile with progress
const response = await channel.sendFile(file, file.name, file.type, undefined, {
  onUploadProgress: (progressEvent) => {
    const percent = progressEvent.total
      ? Math.round((progressEvent.loaded * 100) / progressEvent.total)
      : 0;
    console.log(`Upload: ${percent}%`);
  },
});

// channel.sendImage with progress (same fifth argument)
const imageResponse = await channel.sendImage(file, file.name, file.type, undefined, {
  onUploadProgress: (progressEvent) => {
    const percent = progressEvent.total
      ? Math.round((progressEvent.loaded * 100) / progressEvent.total)
      : 0;
    console.log(`Image upload: ${percent}%`);
  },
});
```

## Message composer / attachment manager

When using the message composer’s attachment manager, upload progress is tracked when `config.attachments.trackUploadProgress` is `true` (the default). Progress is stored on each attachment’s `localMetadata.uploadProgress` (0–100 for the default upload path, from the axios progress event; the initial state is 0% when the upload starts).

With a custom `doUploadRequest`, the function receives an optional second argument `options` with:

- `onProgress?: (percent: number | undefined) => void` — call this from your upload implementation to drive the same `localMetadata.uploadProgress` updates. If you do not call it, `uploadProgress` stays at 0 until the upload finishes.
- `abortSignal?: AbortSignal` — the SDK aborts this signal when the upload is cancelled (for example the user removes the attachment, or `client.uploadManager.reset()` runs on disconnect). Forward it to your transport (axios `signal`, `fetch` `signal`, etc.) if you want to cancel upload request.

Set `trackUploadProgress` to `false` to skip setting `uploadProgress` (will be `undefined` in this case) and to omit `onProgress` to both the default channel upload and custom `doUploadRequest`.
