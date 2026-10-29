import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  Channel,
  createSendWithPendingUploadsAttachmentsMiddleware,
  LocalUploadAttachment,
  MessageComposer,
  ScheduledMessageBlockReason,
  ScheduledMessageResponse,
  StreamChat,
  Thread,
} from '../../../src';
import { getClientWithUser } from '../test-utils/getClient';
import { MockOfflineDB } from '../offline-support/MockOfflineDB';

const user = { id: 'user1', name: 'User One' };
const cid = 'messaging:general';
const scheduledAt = new Date('2030-01-01T10:00:00.000Z');

const generateScheduledMessage = (
  data: Partial<ScheduledMessageResponse> = {},
): ScheduledMessageResponse => ({
  id: 'sm-1',
  cid,
  user,
  message: { text: 'see you tomorrow' },
  scheduled_at: scheduledAt.toISOString(),
  status: 'scheduled',
  created_at: '2026-10-15T00:00:00.000Z',
  updated_at: '2026-10-15T00:00:00.000Z',
  ...data,
});

const uploadAttachment = (uploadState: 'uploading' | 'finished'): LocalUploadAttachment =>
  ({
    type: 'image',
    image_url: uploadState === 'finished' ? 'https://cdn.example.com/a.png' : undefined,
    localMetadata: {
      id: 'upload-1',
      file: new File([''], 'a.png', { type: 'image/png' }),
      uploadState,
    },
  }) as LocalUploadAttachment;

const setup = ({ threadId }: { threadId?: string } = {}) => {
  const client = getClientWithUser(user) as StreamChat;
  const channel = client.channel('messaging', 'general');
  const compositionContext = threadId
    ? new Thread({
        client,
        threadData: {
          parent_message_id: threadId,
          parent_message: {
            id: threadId,
            text: 'parent',
            type: 'regular',
            user,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          channel: {
            id: 'general',
            type: 'messaging',
            cid,
            disabled: false,
            frozen: false,
          },
          title: 'thread',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          channel_cid: cid,
          latest_replies: [],
          thread_participants: [],
          created_by_user_id: user.id,
        },
      })
    : channel;
  const composer = new MessageComposer({
    client,
    compositionContext,
    config: { drafts: { enabled: true } },
  });
  return { channel, client, composer };
};

const giphyCommand = { name: 'giphy', args: '[text]', description: 'Post a random gif' };

const addGiphyCommand = (client: StreamChat, channel: Channel) => {
  client.configs[channel.cid] = {
    commands: [giphyCommand],
    created_at: '',
    reminders: false,
    updated_at: '',
  };
};

const blockedWarning = (reason: ScheduledMessageBlockReason) =>
  expect.objectContaining({
    options: {
      type: 'validation:scheduled-message:blocked',
      metadata: { reason },
    },
  });

const mockScheduledSend = (
  client: StreamChat,
  scheduledMessage: ScheduledMessageResponse | null,
) =>
  vi.spyOn(client, 'post').mockResolvedValue({
    message: { id: scheduledMessage?.id ?? 'm-1', text: 'see you tomorrow' },
    ...(scheduledMessage ? { scheduled_message: scheduledMessage } : {}),
  });

describe('MessageComposer scheduled messages', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('schedule', () => {
    it('sends the composition with scheduled_at and returns the stored scheduled message', async () => {
      const { channel, client, composer } = setup();
      const scheduledMessage = generateScheduledMessage();
      const postSpy = mockScheduledSend(client, scheduledMessage);
      composer.textComposer.setText('see you tomorrow');
      const composerId = composer.id;

      const result = await composer.schedule(scheduledAt);

      expect(postSpy).toHaveBeenCalledWith(
        `${client.baseURL}/channels/messaging/general/message`,
        expect.objectContaining({
          message: expect.objectContaining({ id: composerId, text: 'see you tomorrow' }),
          scheduled_at: scheduledAt.toISOString(),
        }),
      );
      expect(result).toEqual(scheduledMessage);
      expect(client.scheduledMessages.getFromState(scheduledMessage.id)).toEqual(
        scheduledMessage,
      );
      expect(channel.state.messages).toHaveLength(0);
    });

    it('clears the composition and refreshes the id after scheduling', async () => {
      const { client, composer } = setup();
      mockScheduledSend(client, generateScheduledMessage());
      composer.textComposer.setText('see you tomorrow');
      const composerId = composer.id;

      await composer.schedule(scheduledAt);

      expect(composer.textComposer.text).toBe('');
      expect(composer.id).not.toBe(composerId);
    });

    it('does not queue the send in the offline DB', async () => {
      const { client, composer } = setup();
      const offlineDb = new MockOfflineDB({ client });
      client.setOfflineDBApi(offlineDb);
      const queueTask = vi.spyOn(offlineDb, 'queueTask').mockResolvedValue({});
      mockScheduledSend(client, generateScheduledMessage());
      composer.textComposer.setText('see you tomorrow');

      await composer.schedule(scheduledAt);

      expect(queueTask).not.toHaveBeenCalled();
    });

    it('sends parent_id from a thread composer', async () => {
      const { client, composer } = setup({ threadId: 'parent-1' });
      const postSpy = mockScheduledSend(client, generateScheduledMessage());
      composer.textComposer.setText('reply later');

      await composer.schedule(scheduledAt);

      expect(postSpy.mock.calls[0][1]).toEqual(
        expect.objectContaining({
          message: expect.objectContaining({ parent_id: 'parent-1' }),
        }),
      );
    });

    it('deletes the draft through the composer subscriptions, like a normal send', async () => {
      const { channel, client, composer } = setup();
      mockScheduledSend(client, generateScheduledMessage());
      const deleteDraftSpy = vi.spyOn(channel, 'deleteDraft').mockResolvedValue({
        duration: '',
      });
      composer.registerSubscriptions();
      composer.textComposer.setText('see you tomorrow');
      composer.state.partialNext({ draftId: 'draft-1' });

      await composer.schedule(scheduledAt);

      expect(deleteDraftSpy).toHaveBeenCalledWith({ parent_id: undefined });
    });

    it('treats a response without scheduled_message as a completed send', async () => {
      const { client, composer } = setup();
      mockScheduledSend(client, null);
      composer.textComposer.setText('too late to schedule');

      const result = await composer.schedule(scheduledAt);

      expect(result).toBeUndefined();
      expect(client.scheduledMessages.scheduledMessages.size).toBe(0);
      expect(composer.textComposer.text).toBe('');
    });

    it('keeps the composition and reports the error when scheduling fails', async () => {
      const { client, composer } = setup();
      const error = new Error('boom');
      vi.spyOn(client, 'post').mockRejectedValue(error);
      const addErrorSpy = vi.spyOn(client.notifications, 'addError');
      composer.textComposer.setText('see you tomorrow');

      await expect(composer.schedule(scheduledAt)).rejects.toThrow('boom');

      expect(composer.textComposer.text).toBe('see you tomorrow');
      expect(addErrorSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Failed to schedule the message',
          options: expect.objectContaining({
            type: 'api:scheduled-message:create:failed',
          }),
        }),
      );
    });

    it('rejects a typed slash command before waiting for uploads or composing', async () => {
      const { channel, client, composer } = setup();
      addGiphyCommand(client, channel);
      const postSpy = vi.spyOn(client, 'post');
      const composeSpy = vi.spyOn(composer, 'compose');
      const addWarningSpy = vi.spyOn(client.notifications, 'addWarning');
      composer.textComposer.setText('/giphy cats');

      const result = await composer.schedule(scheduledAt);

      expect(result).toBeUndefined();
      expect(composeSpy).not.toHaveBeenCalled();
      expect(postSpy).not.toHaveBeenCalled();
      expect(composer.textComposer.text).toBe('/giphy cats');
      expect(addWarningSpy).toHaveBeenCalledWith(
        blockedWarning(ScheduledMessageBlockReason.Command),
      );
    });

    it('rejects a selected command', async () => {
      const { client, composer } = setup();
      const postSpy = vi.spyOn(client, 'post');
      const addWarningSpy = vi.spyOn(client.notifications, 'addWarning');
      composer.textComposer.state.partialNext({ command: giphyCommand, text: 'cats' });

      await composer.schedule(scheduledAt);

      expect(postSpy).not.toHaveBeenCalled();
      expect(addWarningSpy).toHaveBeenCalledWith(
        blockedWarning(ScheduledMessageBlockReason.Command),
      );
    });

    it('rejects a poll', async () => {
      const { client, composer } = setup();
      const postSpy = vi.spyOn(client, 'post');
      const addWarningSpy = vi.spyOn(client.notifications, 'addWarning');
      composer.state.partialNext({ pollId: 'poll-1' });

      await composer.schedule(scheduledAt);

      expect(postSpy).not.toHaveBeenCalled();
      expect(addWarningSpy).toHaveBeenCalledWith(
        blockedWarning(ScheduledMessageBlockReason.Poll),
      );
    });

    it('rejects a shared location', async () => {
      const { client, composer } = setup();
      const postSpy = vi.spyOn(client, 'post');
      const addWarningSpy = vi.spyOn(client.notifications, 'addWarning');
      vi.spyOn(composer.locationComposer, 'validLocation', 'get').mockReturnValue({
        created_by_device_id: 'device-1',
        latitude: 1,
        longitude: 2,
        message_id: 'm-1',
      });

      await composer.schedule(scheduledAt);

      expect(postSpy).not.toHaveBeenCalled();
      expect(addWarningSpy).toHaveBeenCalledWith(
        blockedWarning(ScheduledMessageBlockReason.SharedLocation),
      );
    });

    it('refuses while uploads run, like a normal send', async () => {
      const { client, composer } = setup();
      const postSpy = vi.spyOn(client, 'post');
      const addWarningSpy = vi.spyOn(client.notifications, 'addWarning');
      composer.textComposer.setText('see you tomorrow');
      composer.attachmentManager.state.partialNext({
        attachments: [uploadAttachment('uploading')],
      });

      const result = await composer.schedule(scheduledAt);

      expect(result).toBeUndefined();
      expect(postSpy).not.toHaveBeenCalled();
      expect(addWarningSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          options: { type: 'validation:attachment:upload:in-progress' },
        }),
      );
    });

    it('waits for uploads in progress when sending with pending uploads', async () => {
      const { client, composer } = setup();
      composer.compositionMiddlewareExecutor.replace([
        createSendWithPendingUploadsAttachmentsMiddleware(composer),
      ]);
      const postSpy = mockScheduledSend(client, generateScheduledMessage());
      composer.attachmentManager.state.partialNext({
        attachments: [uploadAttachment('uploading')],
      });

      const scheduling = composer.schedule(scheduledAt);
      await Promise.resolve();

      expect(postSpy).not.toHaveBeenCalled();

      composer.attachmentManager.state.partialNext({
        attachments: [uploadAttachment('finished')],
      });
      await scheduling;

      expect(postSpy.mock.calls[0][1]).toEqual(
        expect.objectContaining({
          message: expect.objectContaining({
            attachments: [
              expect.objectContaining({ image_url: 'https://cdn.example.com/a.png' }),
            ],
          }),
        }),
      );
    });

    it('includes an attachment whose real upload finishes while scheduling', async () => {
      const { channel, client } = setup();
      const composer = channel.messageComposer;
      channel.data = { own_capabilities: ['upload-file'] };
      const appSettings = { app: { file_upload_config: {}, image_upload_config: {} } };
      client.appSettingsPromise = Promise.resolve(appSettings);
      vi.spyOn(client, 'getAppSettings').mockResolvedValue(appSettings);
      composer.compositionMiddlewareExecutor.replace([
        createSendWithPendingUploadsAttachmentsMiddleware(composer),
      ]);
      const postSpy = mockScheduledSend(client, generateScheduledMessage());
      let finishUpload: () => void = () => undefined;
      vi.spyOn(composer.attachmentManager, 'doUploadRequest').mockImplementation(
        () =>
          new Promise((resolve) => {
            finishUpload = () => resolve({ file: 'https://cdn.example.com/p.png' });
          }),
      );
      composer.textComposer.setText('photo');
      const uploading = composer.attachmentManager.uploadFile(
        new File([''], 'p.png', { type: 'image/png' }),
      );
      await vi.waitFor(() =>
        expect(composer.attachmentManager.uploadsInProgressCount).toBe(1),
      );

      const scheduling = composer.schedule(scheduledAt);
      finishUpload();
      await uploading;
      await scheduling;

      expect(postSpy.mock.calls[0][1]).toEqual(
        expect.objectContaining({
          message: expect.objectContaining({
            attachments: [
              expect.objectContaining({ image_url: 'https://cdn.example.com/p.png' }),
            ],
          }),
        }),
      );
    });

    it('does nothing while a message is being edited', async () => {
      const { client, composer } = setup();
      const postSpy = vi.spyOn(client, 'post');
      await composer.editScheduledMessage(generateScheduledMessage());

      const result = await composer.schedule(scheduledAt);

      expect(result).toBeUndefined();
      expect(postSpy).not.toHaveBeenCalled();
    });
  });

  describe('edit mode', () => {
    it('pre-fills the composer from the scheduled message', async () => {
      const { channel, client, composer } = setup();
      const quoted = {
        id: 'quoted-1',
        text: 'quoted',
        type: 'regular' as const,
        user,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      channel.state.addMessageSorted(quoted);
      client.state.updateUsers([{ id: 'known', name: 'Known User' }]);
      const queryUsersSpy = vi.spyOn(client, 'queryUsers').mockResolvedValue({
        users: [{ id: 'unknown', name: 'Fetched User' }],
        duration: '',
      });
      const scheduledMessage = generateScheduledMessage({
        message: {
          text: 'hi @Known User and @Fetched User',
          attachments: [{ type: 'image', image_url: 'https://cdn.example.com/a.png' }],
          mentioned_users: ['known', 'unknown'],
          quoted_message_id: 'quoted-1',
        },
      });

      await composer.editScheduledMessage(scheduledMessage);

      expect(composer.editedScheduledMessage).toBe(scheduledMessage);
      expect(composer.textComposer.text).toBe('hi @Known User and @Fetched User');
      expect(composer.attachmentManager.attachments).toEqual([
        expect.objectContaining({ image_url: 'https://cdn.example.com/a.png' }),
      ]);
      expect(composer.quotedMessage?.id).toBe('quoted-1');
      expect(composer.textComposer.mentionedUsers).toEqual([
        expect.objectContaining({ id: 'known', name: 'Known User' }),
        expect.objectContaining({ id: 'unknown', name: 'Fetched User' }),
      ]);
      expect(queryUsersSpy).toHaveBeenCalledWith({ id: { $in: ['unknown'] } });
      expect(composer.draftId).toBeNull();
    });

    it('sends the whole message on update without server-only fields', async () => {
      const { client, composer } = setup();
      const scheduledMessage = generateScheduledMessage({
        message: {
          text: 'see you tomorrow',
          html: '<p>see you tomorrow</p>',
          mml: '<mml></mml>',
          type: 'system',
          parent_id: 'parent-1',
          silent: true,
          mood: 'happy',
          i18n: { language: 'en' },
          user: { id: 'someone-else' },
        },
      });
      const updated = generateScheduledMessage({
        message: { text: 'see you the day after' },
        updated_at: '2026-10-16T00:00:00.000Z',
      });
      const patchSpy = vi
        .spyOn(client, 'patch')
        .mockResolvedValue({ scheduled_message: updated, duration: '' });
      await composer.editScheduledMessage(scheduledMessage);
      composer.textComposer.setText('see you the day after');

      const result = await composer.updateScheduledMessage();

      const { message } = patchSpy.mock.calls[0][1] as {
        message: Record<string, unknown>;
      };
      expect(patchSpy.mock.calls[0][0]).toBe(`${client.baseURL}/scheduled_messages/sm-1`);
      expect(message).toEqual(
        expect.objectContaining({
          mood: 'happy',
          parent_id: 'parent-1',
          silent: true,
          text: 'see you the day after',
        }),
      );
      expect(message).not.toHaveProperty('html');
      expect(message).not.toHaveProperty('mml');
      expect(message).not.toHaveProperty('type');
      expect(message).not.toHaveProperty('id');
      expect(message).not.toHaveProperty('i18n');
      expect(message).not.toHaveProperty('user');
      expect(result).toEqual(updated);
      expect(client.scheduledMessages.getFromState('sm-1')).toEqual(updated);
    });

    it('drops content removed in the composer from the update', async () => {
      const { client, composer } = setup();
      const patchSpy = vi.spyOn(client, 'patch').mockResolvedValue({
        scheduled_message: generateScheduledMessage(),
        duration: '',
      });
      await composer.editScheduledMessage(
        generateScheduledMessage({
          message: {
            text: 'with attachment',
            attachments: [{ type: 'image', image_url: 'https://cdn.example.com/a.png' }],
          },
        }),
      );
      composer.attachmentManager.removeAttachments(
        composer.attachmentManager.attachments.map(
          ({ localMetadata }) => localMetadata.id,
        ),
      );

      await composer.updateScheduledMessage();

      const { message } = patchSpy.mock.calls[0][1] as {
        message: Record<string, unknown>;
      };
      expect(message).not.toHaveProperty('attachments');
    });

    it('restores the previous draft after a successful update', async () => {
      const { client, composer } = setup();
      vi.spyOn(client, 'patch').mockResolvedValue({
        scheduled_message: generateScheduledMessage(),
        duration: '',
      });
      composer.textComposer.setText('my draft');
      composer.state.partialNext({ draftId: 'draft-1' });
      await composer.editScheduledMessage(generateScheduledMessage());

      await composer.updateScheduledMessage();

      expect(composer.editedScheduledMessage).toBeUndefined();
      expect(composer.textComposer.text).toBe('my draft');
      expect(composer.draftId).toBe('draft-1');
    });

    it('keeps the edit when the update fails', async () => {
      const { client, composer } = setup();
      vi.spyOn(client, 'patch').mockRejectedValue(new Error('boom'));
      const addErrorSpy = vi.spyOn(client.notifications, 'addError');
      const scheduledMessage = generateScheduledMessage();
      await composer.editScheduledMessage(scheduledMessage);
      composer.textComposer.setText('edited');

      await expect(composer.updateScheduledMessage()).rejects.toThrow('boom');

      expect(composer.editedScheduledMessage).toBe(scheduledMessage);
      expect(composer.textComposer.text).toBe('edited');
      expect(addErrorSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          options: expect.objectContaining({
            type: 'api:scheduled-message:update:failed',
          }),
        }),
      );
    });

    it('restores the previous draft when the edit is cancelled', async () => {
      const { composer } = setup();
      composer.textComposer.setText('my draft');
      composer.state.partialNext({ draftId: 'draft-1' });
      await composer.editScheduledMessage(generateScheduledMessage());

      composer.cancelEditScheduledMessage();

      expect(composer.editedScheduledMessage).toBeUndefined();
      expect(composer.textComposer.text).toBe('my draft');
      expect(composer.draftId).toBe('draft-1');
    });

    it('keeps the first restore point when another scheduled message is edited', async () => {
      const { composer } = setup();
      composer.textComposer.setText('my draft');
      await composer.editScheduledMessage(generateScheduledMessage());
      await composer.editScheduledMessage(
        generateScheduledMessage({ id: 'sm-2', message: { text: 'second' } }),
      );

      composer.cancelEditScheduledMessage();

      expect(composer.textComposer.text).toBe('my draft');
    });

    it('fills the composer through initState and keeps the scheduled values', async () => {
      const { composer } = setup();
      const initStateSpy = vi.spyOn(composer, 'initState');
      const scheduledMessage = generateScheduledMessage({
        message: { poll_id: 'poll-1', show_in_channel: true, text: 'see you tomorrow' },
      });

      await composer.editScheduledMessage(scheduledMessage);

      expect(initStateSpy).toHaveBeenCalledWith({
        composition: expect.objectContaining({
          channel_cid: cid,
          message: expect.objectContaining({ id: 'sm-1', text: 'see you tomorrow' }),
        }),
      });
      expect(composer.draftId).toBeNull();
      expect(composer.pollId).toBe('poll-1');
      expect(composer.showReplyInChannel).toBe(true);
      expect(composer.editedScheduledMessage).toBe(scheduledMessage);
    });

    it('disables commands while a scheduled message is edited', async () => {
      const { composer } = setup();

      await composer.editScheduledMessage(generateScheduledMessage());

      expect(composer.getCommandDisabledReason(giphyCommand)).toBe('editing');
      expect(composer.isCommandDisabled(giphyCommand)).toBe(true);
    });

    it('rejects a slash command typed during the edit', async () => {
      const { channel, client, composer } = setup();
      addGiphyCommand(client, channel);
      const patchSpy = vi.spyOn(client, 'patch');
      const addWarningSpy = vi.spyOn(client.notifications, 'addWarning');
      await composer.editScheduledMessage(generateScheduledMessage());
      composer.textComposer.setText('/giphy cats');

      const result = await composer.updateScheduledMessage();

      expect(result).toBeUndefined();
      expect(patchSpy).not.toHaveBeenCalled();
      expect(composer.editedScheduledMessage).toBeDefined();
      expect(addWarningSpy).toHaveBeenCalledWith(
        blockedWarning(ScheduledMessageBlockReason.Command),
      );
    });

    it('neither creates nor deletes drafts while editing', async () => {
      const { channel, composer } = setup();
      const createDraftSpy = vi.spyOn(channel, 'createDraft');
      const deleteDraftSpy = vi.spyOn(channel, 'deleteDraft');
      composer.state.partialNext({ draftId: 'draft-1' });
      await composer.editScheduledMessage(generateScheduledMessage());

      await composer.createDraft();
      await composer.deleteDraft();

      expect(createDraftSpy).not.toHaveBeenCalled();
      expect(deleteDraftSpy).not.toHaveBeenCalled();
    });

    describe('draft changed elsewhere during the edit', () => {
      const draftEvent = (type: 'draft.updated' | 'draft.deleted', text: string) => ({
        type,
        draft: {
          channel_cid: cid,
          created_at: new Date().toISOString(),
          message: { id: 'draft-2', text },
        },
      });

      const setupEditWithDraft = async () => {
        const { channel, client, composer } = setup();
        vi.spyOn(channel, 'createDraft').mockResolvedValue({ draft: {}, duration: '' });
        vi.spyOn(channel, 'deleteDraft').mockResolvedValue({ duration: '' });
        composer.registerSubscriptions();
        composer.textComposer.setText('my draft');
        composer.state.partialNext({ draftId: 'draft-1' });
        const scheduledMessage = generateScheduledMessage();
        await composer.editScheduledMessage(scheduledMessage);
        return { client, composer, scheduledMessage };
      };

      it('keeps the edit and loads the newer draft when the edit ends', async () => {
        const { client, composer, scheduledMessage } = await setupEditWithDraft();

        client.dispatchEvent(draftEvent('draft.updated', 'newer draft'));

        expect(composer.editedScheduledMessage).toBe(scheduledMessage);
        expect(composer.textComposer.text).toBe('see you tomorrow');

        composer.cancelEditScheduledMessage();

        expect(composer.editedScheduledMessage).toBeUndefined();
        expect(composer.textComposer.text).toBe('newer draft');
        expect(composer.draftId).toBe('draft-2');
      });

      it('keeps the edit and clears the composer when the edit ends', async () => {
        const { client, composer, scheduledMessage } = await setupEditWithDraft();

        client.dispatchEvent(draftEvent('draft.deleted', 'my draft'));

        expect(composer.editedScheduledMessage).toBe(scheduledMessage);
        expect(composer.textComposer.text).toBe('see you tomorrow');

        composer.cancelEditScheduledMessage();

        expect(composer.editedScheduledMessage).toBeUndefined();
        expect(composer.textComposer.text).toBe('');
        expect(composer.draftId).toBeNull();
      });

      it('uses the latest draft event', async () => {
        const { client, composer } = await setupEditWithDraft();

        client.dispatchEvent(draftEvent('draft.deleted', 'my draft'));
        client.dispatchEvent(draftEvent('draft.updated', 'written again'));
        composer.cancelEditScheduledMessage();

        expect(composer.textComposer.text).toBe('written again');
      });
    });

    it('does nothing on update or cancel without an edit', async () => {
      const { client, composer } = setup();
      const patchSpy = vi.spyOn(client, 'patch');
      composer.textComposer.setText('my draft');

      const result = await composer.updateScheduledMessage();
      composer.cancelEditScheduledMessage();

      expect(result).toBeUndefined();
      expect(patchSpy).not.toHaveBeenCalled();
      expect(composer.textComposer.text).toBe('my draft');
    });
  });
});
