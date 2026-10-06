import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import type { Channel, FileLike, FileReference, StreamChat } from '../../../../src';
import { disconnectClients, getServerClient } from '../../helpers/clients';
import { Cleanup } from '../../helpers/cleanup';
import { grantMessagingMembers } from '../../helpers/grants';
import { uniqueId } from '../../helpers/ids';
import { waitForChannelTypePropagation } from '../../helpers/wait';

// The snippets upload browser `File`s. Under Node the SDK builds the multipart body with the
// `form-data` package (which only takes streams and Buffers) and only detects `File`s when
// `window` exists. Emulate the browser bundle: native `FormData` (what `form-data` resolves to in
// browsers) and a `window` with `File`/`Blob`, stubbed only while each test runs.
vi.mock('form-data', () => ({ default: globalThis.FormData }));

/**
 * Like `getClientSideClient`, but from a fresh import of src: `setup.ts` already loaded src (and
 * the real `form-data`) before the mock above was registered.
 */
const getBrowserLikeClientSideClient = async (userId: string): Promise<StreamChat> => {
  const serverClient = getServerClient();
  await serverClient.upsertUser({ id: userId });
  vi.resetModules();
  const { StreamChat: FreshStreamChat } = await import('../../../../src');
  const client = new FreshStreamChat(process.env.STREAM_API_KEY as string, {
    allowServerSideConnect: true,
  });
  await client.connectUser({ id: userId }, serverClient.createToken(userId));
  return client;
};

// 1x1 transparent PNG.
const PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);

const makeImage = (name: string) => new File([PNG_BYTES], name, { type: 'image/png' });
const makeTextFile = (name: string) =>
  new File(['hello from the docs tests'], name, { type: 'text/plain' });

describe('_default/04-messages/02-file_uploads.md', () => {
  const serverClient = getServerClient();
  const cleanup = new Cleanup(serverClient);
  const userId = uniqueId('user');
  const channelType = 'messaging';
  const channelId = uniqueId('general');
  let client: StreamChat;
  let channel: Channel;

  beforeAll(async () => {
    cleanup.users.push(userId);
    // `messaging` doesn't grant channel members `CreateAttachment` in the test app.
    await grantMessagingMembers(serverClient, cleanup, ['create-attachment']);
    await waitForChannelTypePropagation();

    client = await getBrowserLikeClientSideClient(userId);
    channel = client.channel(channelType, channelId, { members: [userId] });
    cleanup.channels.push(`${channelType}:${channelId}`);
    await channel.watch();
  });

  beforeEach(() => {
    vi.stubGlobal('window', { File, Blob });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  afterAll(async () => {
    await disconnectClients(client);
    await cleanup.run();
  });

  it('uploads files to a channel and attaches them to a message', async () => {
    const file1 = makeImage('photo.png');
    const file2 = makeTextFile('notes.txt');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    // #region snippet docs="_default/04-messages/02-file_uploads.md" heading="Uploading Files to a Channel" tab="JavaScript" index=1
    const response1 = await channel.sendImage(
      file1,
      file1.name,
      file1.type,
      undefined,
      // Optional
      {
        onUploadProgress: (e) => {
          const pct = e.total ? Math.round((100 * e.loaded) / e.total) : 0;
          console.log(`Image upload: ${pct}%`);
        },
      },
    );

    const response2 = await channel.sendFile(
      file2,
      file2.name,
      file2.type,
      undefined,
      // Optional
      {
        onUploadProgress: (e) => {
          const pct = e.total ? Math.round((100 * e.loaded) / e.total) : 0;
          console.log(`File upload: ${pct}%`);
        },
      },
    );

    await channel.sendMessage({
      text: 'Check these out',
      attachments: [
        {
          type: 'image',
          asset_url: response1.file,
          thumb_url: response1.file,
        },
        {
          type: 'file',
          asset_url: response2.file,
          title: file2.name,
        },
      ],
    });
    // #endregion snippet

    const logs = logSpy.mock.calls.map(([line]) => String(line));
    logSpy.mockRestore();
    expect(response1.file).toMatch(/^https:\/\//);
    expect(response2.file).toMatch(/^https:\/\//);
    expect(logs.some((line) => /^Image upload: \d+%$/.test(line))).toBe(true);
    expect(logs.some((line) => /^File upload: \d+%$/.test(line))).toBe(true);

    const { messages } = await channel.query({ messages: { limit: 1 } });
    const [message] = messages;
    expect(message.text).toBe('Check these out');
    expect(message.attachments?.map((a) => a.type)).toEqual(['image', 'file']);
    expect(message.attachments?.[1].title).toBe('notes.txt');
  });

  it('uploads a standalone image and uses it as the user avatar', async () => {
    const imageFile = makeImage('avatar.png');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    // #region snippet docs="_default/04-messages/02-file_uploads.md" heading="Uploading Standalone Files" tab="JavaScript" index=1
    const { file: imageUrl } = await client.uploadImage(
      imageFile,
      imageFile.name,
      imageFile.type,
      undefined,
      // Optional
      {
        onUploadProgress: (e) => {
          const pct = e.total ? Math.round((100 * e.loaded) / e.total) : 0;
          console.log(`Image: ${pct}%`);
        },
      },
    );

    // Example: use the image URL as a user avatar
    await client.partialUpdateUser({
      id: userId,
      set: { image: imageUrl },
    });
    // #endregion snippet

    // Standalone uploads aren't tied to the channel or removed with the user.
    await client.deleteImage(imageUrl);
    const logs = logSpy.mock.calls.map(([line]) => String(line));
    logSpy.mockRestore();
    expect(imageUrl).toMatch(/^https:\/\//);
    expect(logs.some((line) => /^Image: \d+%$/.test(line))).toBe(true);

    const { users } = await serverClient.queryUsers({ id: userId });
    const image = users[0].image;
    expect(typeof image).toBe('string');
    // The stored URL is re-signed on read, so compare without the query string.
    expect(String(image).split('?')[0]).toBe(imageUrl.split('?')[0]);
  });

  it('deletes files from a channel', async () => {
    const { file: fileURL } = await channel.sendFile(makeTextFile('delete-me.txt'));
    const { file: imageURL } = await channel.sendImage(makeImage('delete-me.png'));

    const deleteFileSpy = vi.spyOn(channel, 'deleteFile');
    const deleteImageSpy = vi.spyOn(channel, 'deleteImage');

    // #region snippet docs="_default/04-messages/02-file_uploads.md" heading="Deleting Files" tab="JavaScript" index=1
    // Delete from channel
    await channel.deleteFile(fileURL);
    await channel.deleteImage(imageURL);
    // #endregion snippet

    // The CDN may keep serving a cached copy for a while, so check the API responses instead.
    const responses = await Promise.all(
      [deleteFileSpy, deleteImageSpy].flatMap((spy) =>
        spy.mock.results.map((r) => r.value),
      ),
    );
    expect(deleteFileSpy).toHaveBeenCalledWith(fileURL);
    expect(deleteImageSpy).toHaveBeenCalledWith(imageURL);
    expect(responses).toHaveLength(2);
    responses.forEach((response) => expect(response.duration).toBeDefined());
  });

  it('uses a custom CDN for composer uploads', async () => {
    const uploaded: Array<FileLike | FileReference> = [];
    // The docs' `customCDN` is the app's own storage client.
    const customCDN = {
      upload: (file: FileLike | FileReference) => {
        uploaded.push(file);
        return Promise.resolve({ url: 'https://cdn.example.com/uploads/photo.png' });
      },
    };
    const messageComposer = channel.messageComposer;

    // #region snippet docs="_default/04-messages/02-file_uploads.md" heading="Using Your Own CDN" tab="JavaScript" index=1
    messageComposer.attachmentManager.setCustomUploadFn(async (file) => {
      const result = await customCDN.upload(file);
      return { file: result.url };
    });
    // #endregion snippet

    expect(messageComposer.attachmentManager.hasCustomDoUploadRequest).toBe(true);
    const file = makeImage('photo.png');
    const result = await messageComposer.attachmentManager.doUploadRequest(file);
    expect(result).toEqual({ file: 'https://cdn.example.com/uploads/photo.png' });
    expect(uploaded).toEqual([file]);
  });
});
