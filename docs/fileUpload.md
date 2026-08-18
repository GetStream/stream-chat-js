# File Upload

`stream-chat` uploads files from the browser and from React Native. The upload
methods accept `string | File`:

- **Browser** — a `File` or `Blob` (typically from an `<input type="file">`).
- **React Native** — a local URI `string`, in which case you must also pass
  `contentType`, since there is nothing to infer the MIME type from.

## Token

You can get your API key in the [Stream Dashboard](https://getstream.io/dashboard/).
A user token can be generated for testing with the
[Stream Token Generator](https://getstream.io/chat/docs/javascript/token_generator/);
in production, mint it on your backend with
[`@stream-io/node-sdk`](https://github.com/GetStream/stream-node) and never ship
the API secret to a client.

```js
const apiKey = 'swde2zgm3549';
const userId = 'dawn-union-6';
const userToken =
  'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJ1c2VyX2lkIjoiZGF3bi11bmlvbi02In0.mpf8pgxn5r02EqsChMaw6SdCFCyBBl7VJhyleTqEwho';
```

## Node.js — not supported

There is no Node upload path. `stream-chat` v9 accepted a `Buffer` or a
readable stream because it bundled the `form-data` package; v10 dropped that
dependency in favor of the platform's global `FormData`, so `Buffer` and
stream sources are gone and the `Blob` branch only runs where `window` exists.

Upload from your backend with `@stream-io/node-sdk` instead:

```js
const { readFile } = require('node:fs/promises');
const { File } = require('node:buffer');
const { StreamClient } = require('@stream-io/node-sdk');

const client = new StreamClient(process.env.STREAM_KEY, process.env.STREAM_SECRET);
const buffer = await readFile('./helloworld.txt');

const response = await client.uploadFile({
  file: new File([buffer], 'helloworld.txt', { type: 'text/plain' }),
  user: { id: 'user_id' },
});
console.log('file url: ', response.file);
```

## React Native

```js
const response = await channel.sendFile(
  localUri, // e.g. 'file:///.../IMG_0001.HEIC' from the image picker
  'IMG_0001.HEIC',
  'image/heic', // required — pass the MIME type explicitly
);
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

Channel uploads use Axios under the hood. Both **`channel.sendFile`** and **`channel.sendImage`** accept an optional **fifth argument** `axiosRequestConfig` (`AxiosRequestConfig` from axios). The same optional argument exists on **`client.uploadFile_`** and **`client.uploadImage_`** — the trailing-underscore names are the positional-argument uploads; the underscore-less `client.uploadFile` / `client.uploadImage` are the generated request-object methods (`{ file? }`) and take `requestOptions`, not an axios config.

The client merges your config **after** its upload defaults (`timeout: 0`, large `maxContentLength` / `maxBodyLength`). Any property you set can override or extend those defaults. Multipart headers — including the boundary — are set by axios from the `FormData` body; the SDK no longer computes them itself (v9 took them from `form-data`'s `getHeaders()`).

Typical uses:

- **`onUploadProgress`** — track bytes sent (see below)
- **`signal`** — pass `AbortSignal` from an `AbortController` to cancel an in-flight upload
- Other Axios per-request options your runtime supports

> **Uploads are the exception.** They are the only methods that still take a full axios config; every other request-issuing method on `StreamChat` and `Channel` takes a narrow `requestOptions` (`StreamRequestOptions`, currently `{ signal?: AbortSignal }`) as its **last** argument instead — e.g. `client.search(request, { signal })`. Either way you cancel by passing a `signal`: v9's `client.createAbortControllerForNextRequest()` is removed, because it armed one controller that whichever request went out next would consume. See `v9-to-v10-migration-guide-methods.md` for the before/after.

### Upload progress (`onUploadProgress`)

```js
// client.uploadFile_ with progress
const response = await client.uploadFile_(file, file.name, file.type, undefined, {
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
