# File Upload

`stream-chat` uploads files from the browser and from React Native. The upload methods take a
request object whose `file` is a `FileUploadInput`:

```ts
type FileReferenceBase = { uri: string; type: string; name?: string };
type FileLike = File | Blob;
type FileUploadInput = FileLike | FileReferenceBase | string;
```

- **Browser** — a `File` or `Blob` (typically from an `<input type="file">`). A `File` already
  carries its name and MIME type, so nothing else is needed.
- **React Native** — a `FileReferenceBase`; the `FileReference` produced by the pickers in
  `stream-chat-react-native` satisfies it. There is no `Blob` with a real body behind a picker
  URI, so RN's `FormData` reads `uri`, `name` and `type` off the object: `type` becomes the
  part's `Content-Type` and `name` its filename. `type` is required — nothing can infer a MIME
  type from a URI. `name` falls back to the URI's last path segment.

A bare URI `string` is also accepted and normalized into `{ uri }`, with the file name derived
from the last path segment. Prefer the object form: a URI alone yields an untyped part.

There are four upload methods, all taking `(request, requestOptions?)`:

| Method                                                | Endpoint                                       |
| ----------------------------------------------------- | ---------------------------------------------- |
| `client.uploadFile({ file, user? })`                  | `POST /api/v2/uploads/file`                    |
| `client.uploadImage({ file, upload_sizes?, user? })`  | `POST /api/v2/uploads/image`                   |
| `channel.uploadFile({ file, user? })`                 | `POST /api/v2/chat/channels/{type}/{id}/file`  |
| `channel.uploadImage({ file, upload_sizes?, user? })` | `POST /api/v2/chat/channels/{type}/{id}/image` |

`channel.uploadFile` / `channel.uploadImage` are aliases for `channel.uploadChannelFile` /
`channel.uploadChannelImage`; either name works.

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

## Node.js — not officially supported

`stream-chat` is a client-side SDK and there is no supported Node upload path. v9 accepted a
`Buffer` or a readable stream because it bundled the `form-data` package; v10 dropped that
dependency in favor of the platform's global `FormData`, so `Buffer` and stream sources are gone.
A Node `File` will reach the wire (the encoder no longer gates on `window`), but this is not a
tested or supported configuration.

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
const response = await channel.uploadFile({
  file: {
    uri: localUri, // e.g. 'file:///.../IMG_0001.HEIC' from the image picker
    name: 'IMG_0001.HEIC',
    type: 'image/heic', // required — pass the MIME type explicitly
  },
});
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
        channel.uploadFile({ file: e.target.files[0] }).then((response) => {
          const link = document.getElementById('link');
          link.setAttribute('href', response.file);
          link.text = response.file;
        });
      };

      document.getElementById('input').addEventListener('change', handleFiles, false);
    </script>
  </body>
</html>
```

## `requestOptions`

Every upload method takes the same narrow `requestOptions` (`StreamRequestOptions`) as its last
argument that every other request-issuing method on `StreamChat` and `Channel` takes:

- **`onUploadProgress`** — `(event: StreamProgressEvent) => void`, called as bytes are sent.
  `StreamProgressEvent` is `{ loaded, total?, lengthComputable?, progress? }`.
- **`signal`** — an `AbortSignal` from an `AbortController`, to cancel an in-flight upload.

Uploads used to be the one exception that took a full `AxiosRequestConfig`; they no longer are.
The multipart transport applies `timeout: 0` and unbounded `maxContentLength` / `maxBodyLength`
automatically, and these are not caller-overridable — an upload must never inherit the axios
instance's 3s default timeout. The `Content-Type` is set to `multipart/form-data` without a
boundary; the boundary is filled in from the `FormData` body by the browser, React Native, or
axios' node adapter. A `Content-Type` in `StreamChatOptions.axiosRequestConfig.headers` does not
override it — headers the SDK sets for a request always win over that global config.

`client.createAbortControllerForNextRequest()` is removed — it armed one controller that whichever
request went out next would consume. See `v9-to-v10-migration-guide-methods.md` for the
before/after.

### Upload progress (`onUploadProgress`)

```js
const response = await client.uploadFile(
  { file },
  {
    onUploadProgress: (progressEvent) => {
      const percent = progressEvent.total
        ? Math.round((progressEvent.loaded * 100) / progressEvent.total)
        : 0;
      console.log(`Upload: ${percent}%`);
    },
  },
);

// channel uploads take the same second argument
const imageResponse = await channel.uploadImage(
  { file },
  {
    onUploadProgress: (progressEvent) => {
      const percent = progressEvent.total
        ? Math.round((progressEvent.loaded * 100) / progressEvent.total)
        : 0;
      console.log(`Image upload: ${percent}%`);
    },
  },
);
```

## Message composer / attachment manager

When using the message composer’s attachment manager, upload progress is tracked when `config.attachments.trackUploadProgress` is `true` (the default). Progress is stored on each attachment’s `localMetadata.uploadProgress` (0–100 for the default upload path, from the axios progress event; the initial state is 0% when the upload starts).

With a custom `doUploadRequest`, the function receives an optional second argument `options` with:

- `onProgress?: (percent: number | undefined) => void` — call this from your upload implementation to drive the same `localMetadata.uploadProgress` updates. If you do not call it, `uploadProgress` stays at 0 until the upload finishes.
- `abortSignal?: AbortSignal` — the SDK aborts this signal when the upload is cancelled (for example the user removes the attachment, or `client.uploadManager.reset()` runs on disconnect). Forward it to your transport (axios `signal`, `fetch` `signal`, etc.) if you want to cancel upload request.

Set `trackUploadProgress` to `false` to skip setting `uploadProgress` (will be `undefined` in this case) and to omit `onProgress` to both the default channel upload and custom `doUploadRequest`.
