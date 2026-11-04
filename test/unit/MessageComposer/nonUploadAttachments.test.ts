import { describe, expect, it, vi } from 'vitest';
import type { StreamChat } from '../../../src/client';
import {
  isNonUploadAttachment,
  isResolvableUpload,
  isSendableAttachment,
} from '../../../src/messageComposer/attachmentIdentity';
import type { LocalAttachment } from '../../../src/messageComposer/types';
import type {
  Attachment,
  DraftResponse,
  MessageResponse,
  StreamResponse,
} from '../../../src/types';
import { formatMessage } from '../../../src/utils';
import { nowNs } from '../../../src/utils/time';
import { getClientWithUser } from '../test-utils/getClient';

const SEND_MESSAGE_URL = '/api/v2/chat/channels/{type}/{id}/message';
const UPDATE_MESSAGE_URL = '/api/v2/chat/messages/{id}';
const DRAFT_URL = '/api/v2/chat/channels/{type}/{id}/draft';

const product: Attachment = {
  custom: { price: '$45' },
  title: 'Camp stove',
  type: 'product',
};
const giphy: Attachment = {
  custom: {},
  thumb_url: 'https://example.com/cat.gif',
  title: 'cat',
  type: 'giphy',
};
const image: Attachment = {
  custom: {},
  fallback: 'a.jpg',
  image_url: 'https://example.com/a.jpg',
  type: 'image',
};

/** A custom-type attachment with only a local id: nothing to upload, so no upload fields. */
const localProduct: LocalAttachment = { ...product, localMetadata: { id: 'product' } };

/**
 * A composer on a channel whose requests are answered by echoing the message they carry, so the
 * request bodies can be read back by URL.
 */
const setup = () => {
  const client: StreamChat = getClientWithUser({ id: 'currentUser' });
  const channel = client.channel('messaging', 'channel-id');
  const sendRequest = vi
    .spyOn(client.api, 'sendRequest')
    .mockImplementation(async (_method, _url, _pathParams, _query, body) => {
      const message = (body as { message?: object } | undefined)?.message;
      return {
        message: message && {
          cid: channel.cid,
          created_at: nowNs(),
          type: 'regular',
          updated_at: nowNs(),
          user: { id: 'currentUser' },
          ...message,
        },
        metadata: {},
      } as never;
    });
  const composer = channel.messageComposer;

  /** The `message.attachments` of the last request sent to `url`. */
  const sentAttachments = (url: string) => {
    const call = sendRequest.mock.calls.filter(([, callUrl]) => callUrl === url).at(-1);
    return (call?.[4] as { message: { attachments?: Attachment[] } } | undefined)?.message
      .attachments;
  };

  return { channel, client, composer, sendRequest, sentAttachments };
};

const sentMessage = (attachments: Attachment[], text = 'text') =>
  formatMessage({
    attachments,
    created_at: nowNs(),
    id: 'message-id',
    text,
    type: 'regular',
    updated_at: nowNs(),
    user: { id: 'currentUser' },
  } as MessageResponse);

describe('attachments with nothing to upload', () => {
  describe('attachment predicates', () => {
    it('accepts a finished upload and an attachment that is not an upload', () => {
      expect(isSendableAttachment(localProduct)).toBe(true);
      expect(
        isSendableAttachment({
          ...image,
          localMetadata: {
            file: new File([], 'a.jpg'),
            id: 'image',
            uploadState: 'finished',
          },
        }),
      ).toBe(true);
    });

    it.each(['pending', 'uploading', 'failed', 'blocked'] as const)(
      'refuses an upload that is %s',
      (uploadState) => {
        expect(
          isSendableAttachment({
            ...image,
            localMetadata: { file: new File([], 'a.jpg'), id: 'image', uploadState },
          }),
        ).toBe(false);
      },
    );

    it('treats a file with no upload state as neither sendable nor a non-upload', () => {
      const unstartedUpload = {
        ...image,
        localMetadata: { file: new File([], 'a.jpg'), id: 'image' },
      };

      expect(isNonUploadAttachment(unstartedUpload)).toBe(false);
      expect(isSendableAttachment(unstartedUpload)).toBe(false);
      expect(isNonUploadAttachment(localProduct)).toBe(true);
      // Without a local id it is not a local attachment yet.
      expect(isNonUploadAttachment(product)).toBe(false);
    });

    it.each([
      ['pending', true],
      ['uploading', true],
      ['failed', true],
      ['blocked', false],
      ['finished', false],
    ] as const)(
      'isResolvableUpload: an upload that is %s -> %s',
      (uploadState, expected) => {
        expect(
          isResolvableUpload({
            ...image,
            localMetadata: { file: new File([], 'a.jpg'), id: 'image', uploadState },
          }),
        ).toBe(expected);
      },
    );
  });

  describe('sending', () => {
    it('sends a custom attachment alone, with no text', async () => {
      const { composer, sentAttachments } = setup();
      composer.attachmentManager.upsertAttachments([localProduct]);

      expect(composer.hasSendableData).toBe(true);
      expect(await composer.send()).toBe('sent');
      expect(sentAttachments(SEND_MESSAGE_URL)).toEqual([product]);
    });

    it('stores an attachment without localMetadata under a new local id and sends it', async () => {
      const { composer, sentAttachments } = setup();
      composer.attachmentManager.upsertAttachments([product]);

      const [stored] = composer.attachmentManager.attachments;
      expect(stored).toEqual({ ...product, localMetadata: { id: expect.any(String) } });
      expect(composer.hasSendableData).toBe(true);
      expect(await composer.send()).toBe('sent');
      expect(sentAttachments(SEND_MESSAGE_URL)).toEqual([product]);
    });

    it('keeps an appended attachment when the same upsert updates another one', () => {
      const { composer } = setup();
      const localGiphy = { ...giphy, localMetadata: { id: 'giphy' } };
      composer.attachmentManager.upsertAttachments([localProduct]);

      composer.attachmentManager.upsertAttachments([
        localGiphy,
        { ...localProduct, title: 'Camp stove XL' },
      ]);

      expect(composer.attachmentManager.attachments).toEqual([
        { ...localProduct, title: 'Camp stove XL' },
        localGiphy,
      ]);
    });

    it('keeps every update when one upsert updates several attachments', () => {
      const { composer } = setup();
      const localGiphy = { ...giphy, localMetadata: { id: 'giphy' } };
      composer.attachmentManager.upsertAttachments([localProduct, localGiphy]);

      composer.attachmentManager.upsertAttachments([
        { ...localProduct, title: 'Camp stove XL' },
        { ...localGiphy, title: 'dog' },
      ]);

      expect(composer.attachmentManager.attachments).toEqual([
        { ...localProduct, title: 'Camp stove XL' },
        { ...localGiphy, title: 'dog' },
      ]);
    });

    it('still sends a custom attachment built as a fake finished upload', async () => {
      const { composer, sentAttachments } = setup();
      composer.attachmentManager.upsertAttachments([
        {
          ...product,
          localMetadata: {
            file: new File([], 'product'),
            id: 'product',
            uploadState: 'finished',
          },
        },
      ]);

      expect(await composer.send()).toBe('sent');
      expect(sentAttachments(SEND_MESSAGE_URL)).toEqual([product]);
    });

    it('sends a custom attachment alone with pending uploads enabled', async () => {
      const { composer, sentAttachments } = setup();
      composer.updateConfig({ attachments: { pendingUploadsEnabled: true } });
      composer.attachmentManager.upsertAttachments([localProduct]);

      expect(composer.hasSendableData).toBe(true);
      expect(await composer.send()).toBe('sent');
      expect(sentAttachments(SEND_MESSAGE_URL)).toEqual([product]);
    });

    it('does not send or save a file whose upload has not started', async () => {
      const { composer, sendRequest, sentAttachments } = setup();
      composer.updateConfig({ drafts: { enabled: true } });
      composer.attachmentManager.upsertAttachments([
        { ...image, localMetadata: { file: new File([], 'a.jpg'), id: 'image' } },
      ]);

      expect(composer.hasSendableData).toBe(false);

      composer.textComposer.setText('text');
      await composer.createDraft();
      expect(sendRequest.mock.calls.some(([, url]) => url === DRAFT_URL)).toBe(true);
      expect(sentAttachments(DRAFT_URL)).toBeUndefined();
      expect(await composer.send()).toBe('sent');
      expect(sentAttachments(SEND_MESSAGE_URL)).toBeUndefined();
    });

    it('waits for an upload in progress next to a custom attachment', () => {
      const { composer } = setup();
      composer.attachmentManager.upsertAttachments([
        localProduct,
        {
          ...image,
          localMetadata: {
            file: new File([], 'a.jpg'),
            id: 'image',
            uploadState: 'uploading',
          },
        },
      ]);

      expect(composer.hasSendableData).toBe(false);
    });
  });

  describe('upload slots', () => {
    it('does not give a custom attachment an upload slot', () => {
      const { composer } = setup();
      composer.updateConfig({ attachments: { maxNumberOfFilesPerMessage: 1 } });

      composer.attachmentManager.upsertAttachments([localProduct, giphy]);

      expect(composer.attachmentManager.availableUploadSlots).toBe(1);
      expect(composer.attachmentManager.hasAvailableUploadSlots).toBe(true);
    });

    it('keeps uploads enabled when custom attachments outnumber the file limit', async () => {
      const { channel, composer } = setup();
      channel.data = { own_capabilities: ['upload-file'] } as typeof channel.data;
      composer.updateConfig({ attachments: { maxNumberOfFilesPerMessage: 1 } });
      composer.attachmentManager.upsertAttachments([localProduct, giphy]);
      const uploadFile = vi
        .spyOn(composer.attachmentManager, 'uploadFile')
        .mockResolvedValue(undefined as never);

      expect(composer.attachmentManager.isUploadEnabled).toBe(true);
      await composer.attachmentManager.uploadFiles([
        new File([], 'a.jpg', { type: 'image/jpeg' }),
        new File([], 'b.jpg', { type: 'image/jpeg' }),
      ]);

      // One slot, so one of the two files.
      expect(uploadFile).toHaveBeenCalledTimes(1);
    });

    it('does not give an edited message’s custom attachment an upload slot', () => {
      const { composer } = setup();
      composer.updateConfig({ attachments: { maxNumberOfFilesPerMessage: 2 } });

      composer.initState({ composition: sentMessage([product, image]) });

      // The image takes a slot, the product does not.
      expect(composer.attachmentManager.availableUploadSlots).toBe(1);
    });
  });

  describe('editing a message', () => {
    const editMessage = ({
      attachments,
      text,
    }: {
      attachments: Attachment[];
      text: string;
    }) => {
      const context = setup();
      context.composer.initState({ composition: sentMessage(attachments) });
      context.composer.textComposer.setText(text);
      return context;
    };

    it.each([
      ['with text', 'edited text'],
      ['without text', ''],
    ])('keeps a custom attachment alone, %s', async (_, text) => {
      const { composer, sentAttachments } = editMessage({ attachments: [product], text });

      expect(composer.editedMessage).toBeDefined();
      expect(composer.hasSendableData).toBe(true);
      expect(await composer.update()).toBe('sent');
      expect(sentAttachments(UPDATE_MESSAGE_URL)).toEqual([product]);
    });

    it.each([
      ['with text', 'edited text'],
      ['without text', ''],
    ])('keeps a custom attachment next to an image, %s', async (_, text) => {
      const { composer, sentAttachments } = editMessage({
        attachments: [product, image],
        text,
      });

      expect(composer.hasSendableData).toBe(true);
      expect(await composer.update()).toBe('sent');
      expect(sentAttachments(UPDATE_MESSAGE_URL)).toEqual([product, image]);
    });

    it('keeps a giphy attachment', async () => {
      const { composer, sentAttachments } = editMessage({
        attachments: [giphy],
        text: 'edited text',
      });

      expect(await composer.update()).toBe('sent');
      expect(sentAttachments(UPDATE_MESSAGE_URL)).toEqual([giphy]);
    });

    it('keeps a custom attachment with pending uploads enabled', async () => {
      const { composer, sentAttachments } = setup();
      composer.updateConfig({ attachments: { pendingUploadsEnabled: true } });
      composer.initState({ composition: sentMessage([product]) });
      composer.textComposer.setText('');

      expect(composer.hasSendableData).toBe(true);
      expect(await composer.update()).toBe('sent');
      expect(sentAttachments(UPDATE_MESSAGE_URL)).toEqual([product]);
    });
  });

  describe('drafts', () => {
    const draftWith = (attachments: Attachment[]): DraftResponse => ({
      channel_cid: 'messaging:channel-id',
      created_at: nowNs(),
      message: { attachments, id: 'draft-id', text: '' },
    });

    it('saves a custom attachment in the draft', async () => {
      const { composer, sentAttachments } = setup();
      composer.updateConfig({ drafts: { enabled: true } });
      composer.attachmentManager.upsertAttachments([localProduct]);

      await composer.createDraft();

      expect(sentAttachments(DRAFT_URL)).toEqual([product]);
    });

    it.each([
      ['alone', [product]],
      ['next to an image', [product, image]],
    ])(
      'restores a draft with a custom attachment %s and sends it',
      async (_, attachments) => {
        const { channel, composer, sentAttachments } = setup();
        composer.updateConfig({ drafts: { enabled: true } });
        vi.spyOn(channel, 'getDraft').mockResolvedValue({
          draft: draftWith(attachments),
          metadata: {},
        } as StreamResponse<{ draft: DraftResponse }>);

        await composer.getDraft();

        expect(composer.attachmentManager.attachments).toEqual(
          attachments.map((attachment) => ({
            ...attachment,
            localMetadata:
              attachment === image
                ? { id: expect.any(String), uploadState: 'finished' }
                : { id: expect.any(String) },
          })),
        );
        expect(composer.hasSendableData).toBe(true);
        expect(await composer.send()).toBe('sent');
        expect(sentAttachments(SEND_MESSAGE_URL)).toEqual(attachments);
      },
    );
  });
});
