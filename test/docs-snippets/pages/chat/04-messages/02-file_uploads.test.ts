import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Channel, FileLike, FileReference, StreamChat } from '../../../../../src';
import {
  disconnectClients,
  getClientSideClient,
  getServerClient,
} from '../../../helpers/clients';
import { Cleanup } from '../../../helpers/cleanup';
import { grantMessagingMembers } from '../../../helpers/grants';
import { uniqueId } from '../../../helpers/ids';
import { getServerUser } from '../../../helpers/server';
import { waitForChannelTypePropagation } from '../../../helpers/wait';

// v10 builds multipart bodies with the global `FormData`, and Node's `File` is a `Blob`, so the
// snippets' browser `File`s upload as-is under Node.

// 1x1 transparent PNG.
const PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);

const makeImage = (name: string) => new File([PNG_BYTES], name, { type: 'image/png' });
const makeTextFile = (name: string) =>
  new File(['hello from the docs tests'], name, { type: 'text/plain' });

/** The upload responses type `file` as optional; it is always set on success. */
const uploadedUrl = ({ file }: { file?: string }) => {
  if (!file) throw new Error('upload returned no file URL');
  return file;
};

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

    client = await getClientSideClient({ id: userId });
    channel = client.channel(channelType, channelId, { members: [{ user_id: userId }] });
    cleanup.channels.push(`${channelType}:${channelId}`);
    await channel.watch();
  });

  afterAll(async () => {
    await disconnectClients(client);
    await cleanup.run();
  });

  it('uploads files to a channel and attaches them to a message', async () => {
    const file1 = makeImage('photo.png');
    const file2 = makeTextFile('notes.txt');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    // #region snippet docs="chat/_default/04-messages/02-file_uploads.md" heading="Uploading Files to a Channel" tab="JavaScript" index=1
    const response1 = await channel.uploadImage(
      { file: file1 },
      // Optional
      {
        onUploadProgress: (e) => {
          const pct = e.total ? Math.round((100 * e.loaded) / e.total) : 0;
          console.log(`Image upload: ${pct}%`);
        },
      },
    );

    const response2 = await channel.uploadFile(
      { file: file2 },
      // Optional
      {
        onUploadProgress: (e) => {
          const pct = e.total ? Math.round((100 * e.loaded) / e.total) : 0;
          console.log(`File upload: ${pct}%`);
        },
      },
    );

    await channel.sendMessage({
      message: {
        text: 'Check these out',
        attachments: [
          {
            type: 'image',
            asset_url: response1.file,
            thumb_url: response1.file,
            custom: {},
          },
          {
            type: 'file',
            asset_url: response2.file,
            title: file2.name,
            custom: {},
          },
        ],
      },
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
    expect(message.attachments.map((a) => a.type)).toEqual(['image', 'file']);
    expect(message.attachments[1].title).toBe('notes.txt');
  });

  it('uploads a standalone image and uses it as the user avatar', async () => {
    const imageFile = makeImage('avatar.png');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    // #region snippet docs="chat/_default/04-messages/02-file_uploads.md" heading="Uploading Standalone Files" tab="JavaScript" index=1
    const { file: imageUrl } = await client.uploadImage(
      { file: imageFile },
      // Optional
      {
        onUploadProgress: (e) => {
          const pct = e.total ? Math.round((100 * e.loaded) / e.total) : 0;
          console.log(`Image: ${pct}%`);
        },
      },
    );

    // Example: use the image URL as a user avatar
    await client.updateUsersPartial({
      users: [{ id: userId, set: { image: imageUrl } }],
    });
    // #endregion snippet

    // Standalone uploads aren't tied to the channel or removed with the user.
    const uploadedImageUrl = uploadedUrl({ file: imageUrl });
    await client.deleteImage({ url: uploadedImageUrl });
    const logs = logSpy.mock.calls.map(([line]) => String(line));
    logSpy.mockRestore();
    expect(uploadedImageUrl).toMatch(/^https:\/\//);
    expect(logs.some((line) => /^Image: \d+%$/.test(line))).toBe(true);

    const { image } = await getServerUser(serverClient, userId);
    expect(typeof image).toBe('string');
    // The stored URL is re-signed on read, so compare without the query string.
    expect(String(image).split('?')[0]).toBe(uploadedImageUrl.split('?')[0]);
  });

  it('deletes files from a channel', async () => {
    const fileURL = uploadedUrl(
      await channel.uploadFile({ file: makeTextFile('delete-me.txt') }),
    );
    const imageURL = uploadedUrl(
      await channel.uploadImage({ file: makeImage('delete-me.png') }),
    );

    const deleteFileSpy = vi.spyOn(channel, 'deleteFile');
    const deleteImageSpy = vi.spyOn(channel, 'deleteImage');

    // #region snippet docs="chat/_default/04-messages/02-file_uploads.md" heading="Deleting Files" tab="JavaScript" index=1
    // Delete from channel
    await channel.deleteFile({ url: fileURL });
    await channel.deleteImage({ url: imageURL });
    // #endregion snippet

    // The CDN may keep serving a cached copy for a while, so check the API responses instead.
    const responses = await Promise.all(
      [deleteFileSpy, deleteImageSpy].flatMap((spy) =>
        spy.mock.results.map((r) => r.value),
      ),
    );
    expect(deleteFileSpy).toHaveBeenCalledWith({ url: fileURL });
    expect(deleteImageSpy).toHaveBeenCalledWith({ url: imageURL });
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
    // A composer receives configuration changes once its subscriptions are registered (UI SDKs
    // do this when they mount it); composers created later get it on construction.
    const messageComposer = channel.messageComposer;
    messageComposer.registerSubscriptions();

    try {
      // #region snippet docs="chat/_default/04-messages/02-file_uploads.md" heading="Using Your Own CDN" tab="JavaScript" index=1
      client.config.set({
        messageComposer: {
          attachments: {
            // Uploads go to storage Stream doesn't host
            customCdn: true,
            doUploadRequest: async (file) => {
              const result = await customCDN.upload(file);
              return { file: result.url };
            },
          },
        },
      });
      // #endregion snippet

      const { attachmentManager } = messageComposer;
      expect(attachmentManager.hasCustomDoUploadRequest).toBe(true);
      expect(attachmentManager.config.customCdn).toBe(true);
      const file = makeImage('photo.png');
      const result = await attachmentManager.doUploadRequest(file);
      expect(result).toEqual({ file: 'https://cdn.example.com/uploads/photo.png' });
      expect(uploaded).toEqual([file]);
    } finally {
      client.config.reset('messageComposer');
      messageComposer.unregisterSubscriptions();
    }
  });
});
