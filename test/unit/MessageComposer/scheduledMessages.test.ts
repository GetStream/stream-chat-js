import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  Channel,
  CORE_NOTIFICATION_TYPE,
  LocalMessage,
  LocalUploadAttachment,
  MessageComposer,
  ScheduledMessageBlockReason,
  ScheduledMessageCompositionEndReason,
  ScheduledMessageEventType,
  ScheduledMessageResponse,
  SCHEDULED_MESSAGE_FAILURE_REASON,
  SCHEDULED_MESSAGE_STATUS,
  StreamChat,
  Thread,
  toScheduledMessagePreview,
} from '../../../src';
import { chatLoggerSystem } from '../../../src/logger';
import { msToNs, nowNs, nsToDate } from '../../../src/utils/time';
import { getClientWithUser } from '../test-utils/getClient';
import { generateAPIError } from '../test-utils/generateAPIError';
import { stubServerConfig } from '../test-utils/stubServerConfig';
import { MockOfflineDB } from '../offline-support/MockOfflineDB';

const user = { id: 'user1', name: 'User One' };
const channelType = 'messaging';
const channelId = 'general';
const cid = `${channelType}:${channelId}`;
const scheduledAt = new Date('2030-01-01T10:00:00.000Z');
const createdAt = msToNs(Date.UTC(2026, 9, 15));
const giphyCommand = { name: 'giphy', args: '[text]', description: 'Post a random gif' };
const scheduledMessageLimits = {
  scheduled_messages_max_lead_time_seconds: 120 * 24 * 60 * 60,
  scheduled_messages_max_per_channel: 10,
  scheduled_messages_max_per_user: 100,
  scheduled_messages_min_lead_time_seconds: 60,
};

const generateScheduledMessage = (
  data: Partial<ScheduledMessageResponse> = {},
): ScheduledMessageResponse =>
  ({
    id: 'sm-1',
    cid,
    user,
    message: { text: 'see you tomorrow', custom: {} },
    scheduled_at: msToNs(scheduledAt.getTime()),
    status: SCHEDULED_MESSAGE_STATUS.Scheduled,
    created_at: createdAt,
    updated_at: createdAt,
    ...data,
  }) as ScheduledMessageResponse;

const generateFailedMessage = (data: Partial<ScheduledMessageResponse> = {}) =>
  generateScheduledMessage({
    failure_reason: SCHEDULED_MESSAGE_FAILURE_REASON.ChannelFrozen,
    status: SCHEDULED_MESSAGE_STATUS.Failed,
    ...data,
  });

const uploadAttachment = (
  uploadState: 'uploading' | 'finished' | 'failed',
): LocalUploadAttachment =>
  ({
    type: 'image',
    image_url: uploadState === 'finished' ? 'https://cdn.example.com/a.png' : undefined,
    localMetadata: {
      id: 'upload-1',
      file: new File([''], 'a.png', { type: 'image/png' }),
      uploadState,
    },
  }) as LocalUploadAttachment;

const getThread = (client: StreamChat, threadId: string) =>
  new Thread({
    client,
    threadData: {
      parent_message_id: threadId,
      parent_message: {
        id: threadId,
        text: 'parent',
        type: 'regular' as const,
        user,
        created_at: nowNs(),
        updated_at: nowNs(),
      },
      channel: {
        id: channelId,
        type: channelType,
        cid,
        disabled: false,
        frozen: false,
      },
      title: 'thread',
      created_at: nowNs(),
      updated_at: nowNs(),
      channel_cid: cid,
      latest_replies: [],
      thread_participants: [],
      created_by_user_id: user.id,
    },
  } as never);

const setup = ({
  pendingUploadsEnabled = false,
  threadId,
}: { pendingUploadsEnabled?: boolean; threadId?: string } = {}) => {
  const client = getClientWithUser(user) as StreamChat;
  vi.spyOn(client, 'queryScheduledMessages').mockResolvedValue({
    scheduled_messages: [],
    duration: '',
  } as never);
  const channel = client.channelManager.ensure({ type: channelType, id: channelId });
  // Loaded and empty, so the scheduled messages the composer's actions return are listed.
  channel.scheduledMessagesPaginator.hydrate([]);
  const compositionContext = threadId ? getThread(client, threadId) : channel;
  const composer = new MessageComposer({
    client,
    compositionContext,
    config: { attachments: { pendingUploadsEnabled }, drafts: { enabled: true } },
  });
  return { channel, client, composer };
};

const addGiphyCommand = (channel: Channel) =>
  stubServerConfig(channel, { ...scheduledMessageLimits, commands: [giphyCommand] });

const blockedWarning = (reason: ScheduledMessageBlockReason) =>
  expect.objectContaining({
    options: {
      type: CORE_NOTIFICATION_TYPE.scheduledMessageBlocked,
      metadata: { reason },
    },
  });

const mockScheduledSend = (
  client: StreamChat,
  scheduledMessage: ScheduledMessageResponse | null,
) =>
  vi.spyOn(client, 'sendMessage').mockResolvedValue({
    duration: '',
    message: { id: scheduledMessage?.id ?? 'm-1', text: 'see you tomorrow' },
    ...(scheduledMessage ? { scheduled_message: scheduledMessage } : {}),
  } as never);

const mockScheduledUpdate = (
  client: StreamChat,
  scheduledMessage: ScheduledMessageResponse,
) =>
  vi
    .spyOn(client, 'updateScheduledMessage')
    .mockResolvedValue({ scheduled_message: scheduledMessage, duration: '' } as never);

const sentRequest = (sendSpy: ReturnType<typeof mockScheduledSend>) =>
  sendSpy.mock.calls[0][1];

const updatedMessage = (updateSpy: ReturnType<typeof mockScheduledUpdate>) =>
  (updateSpy.mock.calls[0][1] as { message: Record<string, unknown> }).message;

const scheduledEvent = (type: string, scheduledMessage: ScheduledMessageResponse) =>
  ({
    type,
    cid,
    created_at: nowNs(),
    scheduled_message: scheduledMessage,
  }) as never;

describe('MessageComposer scheduled messages', () => {
  afterEach(() => {
    chatLoggerSystem.restoreDefaults();
    vi.restoreAllMocks();
  });

  describe('schedule', () => {
    it('sends the composition with scheduled_at and stores the scheduled message', async () => {
      const { channel, client, composer } = setup();
      const scheduledMessage = generateScheduledMessage();
      const sendSpy = mockScheduledSend(client, scheduledMessage);
      composer.textComposer.setText('see you tomorrow');
      const composerId = composer.id;

      const result = await composer.schedule(scheduledAt);

      expect(sendSpy).toHaveBeenCalledWith(
        { id: channelId, type: channelType },
        expect.objectContaining({
          message: expect.objectContaining({ id: composerId, text: 'see you tomorrow' }),
          scheduled_at: scheduledAt,
        }),
        undefined,
      );
      expect(result).toEqual({ scheduledMessage, status: 'scheduled' });
      expect(channel.scheduledMessagesPaginator.items).toEqual([scheduledMessage]);
      expect(channel.messagePaginator.getItem(composerId)).toBeUndefined();
    });

    it('sends through channel.sendMessage with the scheduled_at request field', async () => {
      const { channel, client, composer } = setup();
      mockScheduledSend(client, generateScheduledMessage());
      const channelSendSpy = vi.spyOn(channel, 'sendMessage');
      composer.textComposer.setText('see you tomorrow');

      await composer.schedule(scheduledAt);

      expect(channelSendSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.objectContaining({ text: 'see you tomorrow' }),
          scheduled_at: scheduledAt,
        }),
      );
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
      const queueTask = vi.spyOn(offlineDb, 'queueTask').mockResolvedValue({} as never);
      mockScheduledSend(client, generateScheduledMessage());
      composer.textComposer.setText('see you tomorrow');

      await composer.schedule(scheduledAt);

      expect(queueTask).not.toHaveBeenCalled();
    });

    it('sends parent_id from a thread composer', async () => {
      const { client, composer } = setup({ threadId: 'parent-1' });
      const sendSpy = mockScheduledSend(client, generateScheduledMessage());
      composer.textComposer.setText('reply later');

      await composer.schedule(scheduledAt);

      expect(sentRequest(sendSpy)).toEqual(
        expect.objectContaining({
          message: expect.objectContaining({ parent_id: 'parent-1' }),
        }),
      );
    });

    it('deletes the draft through the composer subscriptions, like a normal send', async () => {
      const { channel, client, composer } = setup();
      mockScheduledSend(client, generateScheduledMessage());
      const deleteDraftSpy = vi
        .spyOn(channel, 'deleteDraft')
        .mockResolvedValue({ duration: '' } as never);
      composer.registerSubscriptions();
      composer.textComposer.setText('see you tomorrow');
      composer.state.partialNext({ draftId: 'draft-1' });

      await composer.schedule(scheduledAt);

      await vi.waitFor(() =>
        expect(deleteDraftSpy).toHaveBeenCalledWith({ parent_id: undefined }),
      );
    });

    it('returns sent when the response has no scheduled_message', async () => {
      const { client, composer } = setup();
      mockScheduledSend(client, null);
      composer.textComposer.setText('too late to schedule');

      const result = await composer.schedule(scheduledAt);

      expect(result).toEqual({ status: 'sent' });
      expect(client.scheduledMessageStore.values()).toEqual([]);
      expect(composer.textComposer.text).toBe('');
    });

    it('returns nothing-to-send for an empty composition', async () => {
      const { client, composer } = setup();
      const sendSpy = mockScheduledSend(client, generateScheduledMessage());

      const result = await composer.schedule(scheduledAt);

      expect(result).toEqual({ status: 'nothing-to-send' });
      expect(sendSpy).not.toHaveBeenCalled();
    });

    it('keeps the composition and reports the error when scheduling fails', async () => {
      const { client, composer } = setup();
      const error = generateAPIError(4, 'boom');
      vi.spyOn(client, 'sendMessage').mockRejectedValue(error);
      const addErrorSpy = vi.spyOn(client.notifications, 'addError');
      composer.textComposer.setText('see you tomorrow');
      const composerId = composer.id;

      const result = await composer.schedule(scheduledAt);

      expect(result).toEqual({ error, status: 'failed' });
      expect(composer.textComposer.text).toBe('see you tomorrow');
      expect(composer.id).toBe(composerId);
      expect(addErrorSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Failed to schedule the message',
          options: expect.objectContaining({
            type: CORE_NOTIFICATION_TYPE.scheduledMessageCreateFailed,
            originalError: error,
          }),
        }),
      );
    });

    it('blocks a typed slash command', async () => {
      const { channel, client, composer } = setup();
      addGiphyCommand(channel);
      const sendSpy = vi.spyOn(client, 'sendMessage');
      const addWarningSpy = vi.spyOn(client.notifications, 'addWarning');
      composer.textComposer.setText('/giphy cats');

      const result = await composer.schedule(scheduledAt);

      expect(result).toEqual({ status: 'blocked' });
      expect(sendSpy).not.toHaveBeenCalled();
      expect(composer.textComposer.text).toBe('/giphy cats');
      expect(addWarningSpy).toHaveBeenCalledWith(
        blockedWarning(ScheduledMessageBlockReason.Command),
      );
    });

    it('blocks a selected command', async () => {
      const { client, composer } = setup();
      const sendSpy = vi.spyOn(client, 'sendMessage');
      const addWarningSpy = vi.spyOn(client.notifications, 'addWarning');
      composer.textComposer.state.partialNext({ command: giphyCommand, text: 'cats' });

      const result = await composer.schedule(scheduledAt);

      expect(result).toEqual({ status: 'blocked' });
      expect(sendSpy).not.toHaveBeenCalled();
      expect(addWarningSpy).toHaveBeenCalledWith(
        blockedWarning(ScheduledMessageBlockReason.Command),
      );
    });

    it('schedules a poll as a message of its own', async () => {
      const { client, composer } = setup();
      const sendSpy = mockScheduledSend(client, generateScheduledMessage());
      const addWarningSpy = vi.spyOn(client.notifications, 'addWarning');
      composer.state.partialNext({ pollId: 'poll-1' });

      const result = await composer.schedule(scheduledAt);

      expect(result.status).toBe('scheduled');
      expect(sentRequest(sendSpy)).toEqual(
        expect.objectContaining({
          message: { id: expect.any(String), poll_id: 'poll-1' },
          scheduled_at: scheduledAt,
        }),
      );
      expect(addWarningSpy).not.toHaveBeenCalled();
      expect(composer.pollId).toBeNull();
    });

    it('schedules a static shared location', async () => {
      const { client, composer } = setup();
      const sendSpy = mockScheduledSend(client, generateScheduledMessage());
      const addWarningSpy = vi.spyOn(client.notifications, 'addWarning');
      const messageId = composer.id;
      composer.locationComposer.state.partialNext({
        location: {
          created_by_device_id: 'device-1',
          latitude: 1,
          longitude: 2,
          message_id: messageId,
        },
      });

      const result = await composer.schedule(scheduledAt);

      expect(result.status).toBe('scheduled');
      expect(addWarningSpy).not.toHaveBeenCalled();
      expect(sentRequest(sendSpy).message.shared_location).toEqual({
        created_by_device_id: 'device-1',
        latitude: 1,
        longitude: 2,
        message_id: messageId,
      });
    });

    it("counts a live location's sharing time from the send time", async () => {
      const { client, composer } = setup();
      const sendSpy = mockScheduledSend(client, generateScheduledMessage());
      const durationMs = 15 * 60 * 1000;
      composer.locationComposer.state.partialNext({
        location: {
          created_by_device_id: 'device-1',
          durationMs,
          latitude: 1,
          longitude: 2,
          message_id: composer.id,
        },
      });

      await composer.schedule(scheduledAt);

      expect(sentRequest(sendSpy).message.shared_location?.end_at).toEqual(
        new Date(scheduledAt.getTime() + durationMs),
      );
    });

    it('composes a poll when scheduled_at is passed', async () => {
      const { client, composer } = setup();
      const addWarningSpy = vi.spyOn(client.notifications, 'addWarning');
      composer.state.partialNext({ pollId: 'poll-1' });

      const composition = await composer.compose({
        sendOptions: { scheduled_at: scheduledAt },
      });

      expect(composition?.message).toEqual(
        expect.objectContaining({ poll_id: 'poll-1' }),
      );
      expect(composition?.sendOptions).toEqual({ scheduled_at: scheduledAt });
      expect(addWarningSpy).not.toHaveBeenCalled();
    });

    it('leaves polls, commands and locations alone in a normal composition', async () => {
      const { client, composer } = setup();
      const addWarningSpy = vi.spyOn(client.notifications, 'addWarning');
      composer.state.partialNext({ pollId: 'poll-1' });

      const composition = await composer.compose();

      expect(composition?.message).toEqual(
        expect.objectContaining({ poll_id: 'poll-1' }),
      );
      expect(addWarningSpy).not.toHaveBeenCalled();
    });

    it('passes the compose send options through the middleware', async () => {
      const { composer } = setup();
      composer.textComposer.setText('see you tomorrow');

      const composition = await composer.compose({
        sendOptions: { scheduled_at: scheduledAt, skip_push: true },
      });

      expect(composition?.sendOptions).toEqual({
        scheduled_at: scheduledAt,
        skip_push: true,
      });
    });

    it('refuses while uploads run without pending uploads, like a normal send', async () => {
      const { client, composer } = setup();
      const sendSpy = vi.spyOn(client, 'sendMessage');
      const addWarningSpy = vi.spyOn(client.notifications, 'addWarning');
      composer.textComposer.setText('see you tomorrow');
      composer.attachmentManager.state.partialNext({
        attachments: [uploadAttachment('uploading')],
      });

      const result = await composer.schedule(scheduledAt);

      expect(result).toEqual({ status: 'nothing-to-send' });
      expect(sendSpy).not.toHaveBeenCalled();
      expect(addWarningSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          options: { type: CORE_NOTIFICATION_TYPE.attachmentUploadInProgress },
        }),
      );
    });

    it('waits for uploads in progress when pending uploads are allowed', async () => {
      const { client, composer } = setup({ pendingUploadsEnabled: true });
      const sendSpy = mockScheduledSend(client, generateScheduledMessage());
      composer.attachmentManager.state.partialNext({
        attachments: [uploadAttachment('uploading')],
      });

      const scheduling = composer.schedule(scheduledAt);
      await Promise.resolve();

      expect(sendSpy).not.toHaveBeenCalled();

      composer.attachmentManager.state.partialNext({
        attachments: [uploadAttachment('finished')],
      });

      await expect(scheduling).resolves.toEqual(
        expect.objectContaining({ status: 'scheduled' }),
      );
      expect(sentRequest(sendSpy)).toEqual(
        expect.objectContaining({
          message: expect.objectContaining({
            attachments: [
              expect.objectContaining({ image_url: 'https://cdn.example.com/a.png' }),
            ],
          }),
        }),
      );
    });

    it('fails and keeps the composition when an upload failed', async () => {
      const { client, composer } = setup({ pendingUploadsEnabled: true });
      const sendSpy = mockScheduledSend(client, generateScheduledMessage());
      const addErrorSpy = vi.spyOn(client.notifications, 'addError');
      composer.textComposer.setText('see you tomorrow');
      composer.attachmentManager.state.partialNext({
        attachments: [uploadAttachment('failed')],
      });

      const result = await composer.schedule(scheduledAt);

      expect(result).toEqual({ error: expect.any(Error), status: 'failed' });
      expect(sendSpy).not.toHaveBeenCalled();
      expect(composer.textComposer.text).toBe('see you tomorrow');
      expect(composer.attachmentManager.attachments).toHaveLength(1);
      expect(addErrorSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          options: expect.objectContaining({
            type: CORE_NOTIFICATION_TYPE.scheduledMessageCreateFailed,
          }),
        }),
      );
    });

    it('fails when an upload in progress fails while waiting', async () => {
      const { client, composer } = setup({ pendingUploadsEnabled: true });
      const sendSpy = mockScheduledSend(client, generateScheduledMessage());
      composer.attachmentManager.state.partialNext({
        attachments: [uploadAttachment('uploading')],
      });

      const scheduling = composer.schedule(scheduledAt);
      composer.attachmentManager.state.partialNext({
        attachments: [uploadAttachment('failed')],
      });

      await expect(scheduling).resolves.toEqual(
        expect.objectContaining({ status: 'failed' }),
      );
      expect(sendSpy).not.toHaveBeenCalled();
    });

    it('includes an attachment whose real upload finishes while scheduling', async () => {
      const { channel, client } = setup();
      const composer = channel.messageComposer;
      composer.updateConfig({ attachments: { pendingUploadsEnabled: true } });
      channel.data = {
        ...channel.data,
        own_capabilities: ['schedule-message', 'upload-file'],
      } as never;
      const appSettings = { app: { file_upload_config: {}, image_upload_config: {} } };
      client.appSettingsPromise = Promise.resolve(appSettings as never);
      vi.spyOn(client, 'getAppSettings').mockResolvedValue(appSettings as never);
      const sendSpy = mockScheduledSend(client, generateScheduledMessage());
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

      expect(sentRequest(sendSpy)).toEqual(
        expect.objectContaining({
          message: expect.objectContaining({
            attachments: [
              expect.objectContaining({ image_url: 'https://cdn.example.com/p.png' }),
            ],
          }),
        }),
      );
    });

    it('does nothing while a scheduled message is being edited', async () => {
      const { client, composer } = setup();
      const sendSpy = vi.spyOn(client, 'sendMessage');
      await composer.editScheduledMessage(generateScheduledMessage());

      const result = await composer.schedule(scheduledAt);

      expect(result).toEqual({ status: 'nothing-to-send' });
      expect(sendSpy).not.toHaveBeenCalled();
    });
  });

  describe('scheduleBlockReason', () => {
    it('is undefined for plain text', () => {
      const { composer } = setup();
      composer.textComposer.setText('see you tomorrow');

      expect(composer.scheduleBlockReason).toBeUndefined();
    });

    it('is command for a typed slash command', () => {
      const { channel, composer } = setup();
      addGiphyCommand(channel);
      composer.textComposer.setText('/giphy cats');

      expect(composer.scheduleBlockReason).toBe(ScheduledMessageBlockReason.Command);
    });

    it('is command for a selected command', () => {
      const { composer } = setup();
      composer.textComposer.state.partialNext({ command: giphyCommand, text: 'cats' });

      expect(composer.scheduleBlockReason).toBe(ScheduledMessageBlockReason.Command);
    });

    it('ignores a slash command the channel does not know', () => {
      const { composer } = setup();
      composer.textComposer.setText('/giphy cats');

      expect(composer.scheduleBlockReason).toBeUndefined();
    });

    it('is nothing for a poll', () => {
      const { composer } = setup();
      composer.state.partialNext({ pollId: 'poll-1' });

      expect(composer.scheduleBlockReason).toBeUndefined();
    });

    it('is nothing for a shared location', () => {
      const { composer } = setup();
      vi.spyOn(composer.locationComposer, 'validLocation', 'get').mockReturnValue({
        created_by_device_id: 'device-1',
        latitude: 1,
        longitude: 2,
        message_id: 'm-1',
      } as never);

      expect(composer.scheduleBlockReason).toBeUndefined();
    });
  });

  describe('edit mode', () => {
    it('pre-fills the composer from the scheduled message', async () => {
      const { client, composer } = setup();
      const quoted = {
        id: 'quoted-1',
        text: 'quoted',
        type: 'regular' as const,
        user,
        created_at: nowNs(),
        updated_at: nowNs(),
      } as LocalMessage;
      client.messageStore.upsert(quoted);
      client.state.updateUsers([{ id: 'known', name: 'Known User' } as never]);
      const queryUsersSpy = vi.spyOn(client, 'queryUsers').mockResolvedValue({
        users: [{ id: 'unknown', name: 'Fetched User' }],
        duration: '',
      } as never);
      const getMessageSpy = vi.spyOn(client, 'getMessage');
      const scheduledMessage = generateScheduledMessage({
        message: {
          text: 'hi @Known User and @Fetched User',
          custom: { mood: 'happy' },
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
      expect(getMessageSpy).not.toHaveBeenCalled();
      expect(composer.textComposer.mentionedUsers).toEqual([
        expect.objectContaining({ id: 'known', name: 'Known User' }),
        expect.objectContaining({ id: 'unknown', name: 'Fetched User' }),
      ]);
      expect(queryUsersSpy).toHaveBeenCalledWith({
        payload: { filter_conditions: { id: { $in: ['unknown'] } } },
      });
      expect(composer.customDataManager.customMessageData).toEqual({ mood: 'happy' });
      expect(composer.draftId).toBeNull();
    });

    it('fetches a quoted message missing from the message store', async () => {
      const { client, composer } = setup();
      const getMessageSpy = vi.spyOn(client, 'getMessage').mockResolvedValue({
        duration: '',
        message: {
          id: 'quoted-2',
          text: 'fetched quote',
          type: 'regular',
          user,
          created_at: nowNs(),
          updated_at: nowNs(),
        },
      } as never);

      await composer.editScheduledMessage(
        generateScheduledMessage({
          message: { text: 'reply', custom: {}, quoted_message_id: 'quoted-2' },
        }),
      );

      expect(getMessageSpy).toHaveBeenCalledWith({ id: 'quoted-2' });
      expect(composer.quotedMessage).toEqual(
        expect.objectContaining({ id: 'quoted-2', text: 'fetched quote' }),
      );
    });

    it('still opens the edit when the mentioned users and quoted message cannot be loaded', async () => {
      const { client, composer } = setup();
      vi.spyOn(client, 'queryUsers').mockRejectedValue(new Error('users down'));
      vi.spyOn(client, 'getMessage').mockRejectedValue(new Error('message gone'));
      const scheduledMessage = generateScheduledMessage({
        message: {
          text: 'hi',
          custom: {},
          mentioned_users: ['unknown'],
          quoted_message_id: 'quoted-3',
        },
      });

      await composer.editScheduledMessage(scheduledMessage);

      expect(composer.editedScheduledMessage).toBe(scheduledMessage);
      expect(composer.quotedMessage).toBeNull();
      expect(composer.textComposer.mentionedUsers).toEqual([
        expect.objectContaining({ id: 'unknown' }),
      ]);
    });

    it('sends the whole message on update without server-only fields', async () => {
      const { client, composer } = setup();
      const pinExpires = msToNs(Date.UTC(2030, 1, 1));
      const scheduledMessage = generateScheduledMessage({
        message: {
          text: 'see you tomorrow',
          custom: { mood: 'happy' },
          html: '<p>see you tomorrow</p>',
          mml: '<mml></mml>',
          type: 'system',
          parent_id: 'parent-1',
          pin_expires: pinExpires,
          pinned: true,
          silent: true,
          shared_location: { created_by_device_id: 'device-1' },
        },
      });
      const updated = generateScheduledMessage({
        message: { text: 'see you the day after', custom: {} },
        updated_at: msToNs(Date.UTC(2026, 9, 16)),
      });
      const updateSpy = mockScheduledUpdate(client, updated);
      await composer.editScheduledMessage(scheduledMessage);
      composer.textComposer.setText('see you the day after');

      const result = await composer.updateScheduledMessage();

      const message = updatedMessage(updateSpy);
      expect(updateSpy.mock.calls[0][0]).toEqual({ id: 'sm-1' });
      expect(message).toEqual(
        expect.objectContaining({
          custom: { mood: 'happy' },
          parent_id: 'parent-1',
          pin_expires: nsToDate(pinExpires),
          pinned: true,
          silent: true,
          text: 'see you the day after',
        }),
      );
      expect(message).not.toHaveProperty('html');
      expect(message).not.toHaveProperty('mml');
      expect(message).not.toHaveProperty('type');
      expect(message).not.toHaveProperty('id');
      expect(message).not.toHaveProperty('user');
      expect(message).not.toHaveProperty('shared_location');
      expect(result).toEqual({ scheduledMessage: updated, status: 'scheduled' });
      expect(client.scheduledMessageStore.get('sm-1')).toEqual(updated);
    });

    it('keeps the shared location in the update, with its end time', async () => {
      const { client, composer } = setup();
      const endAt = msToNs(scheduledAt.getTime() + 60 * 60 * 1000);
      const scheduledMessage = generateScheduledMessage({
        message: {
          custom: {},
          shared_location: {
            created_by_device_id: 'device-1',
            end_at: endAt,
            latitude: 1,
            longitude: 2,
          },
          text: 'meet me here',
        },
      });
      const updateSpy = mockScheduledUpdate(client, scheduledMessage);
      await composer.editScheduledMessage(scheduledMessage);
      composer.textComposer.setText('meet me there');

      await composer.updateScheduledMessage();

      expect(updatedMessage(updateSpy).shared_location).toEqual({
        created_by_device_id: 'device-1',
        end_at: nsToDate(endAt),
        latitude: 1,
        longitude: 2,
        message_id: 'sm-1',
      });
    });

    it('drops a shared location removed in the composer from the update', async () => {
      const { client, composer } = setup();
      const scheduledMessage = generateScheduledMessage({
        message: {
          custom: {},
          shared_location: {
            created_by_device_id: 'device-1',
            latitude: 1,
            longitude: 2,
          },
          text: 'meet me here',
        },
      });
      const updateSpy = mockScheduledUpdate(client, scheduledMessage);
      await composer.editScheduledMessage(scheduledMessage);
      composer.locationComposer.initState();

      await composer.updateScheduledMessage();

      expect(updatedMessage(updateSpy)).not.toHaveProperty('shared_location');
    });

    it('drops content removed in the composer from the update', async () => {
      const { client, composer } = setup();
      const updateSpy = mockScheduledUpdate(client, generateScheduledMessage());
      await composer.editScheduledMessage(
        generateScheduledMessage({
          message: {
            text: 'with attachment',
            custom: {},
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

      expect(updatedMessage(updateSpy)).not.toHaveProperty('attachments');
    });

    it('restores the previous draft after a successful update', async () => {
      const { client, composer } = setup();
      mockScheduledUpdate(client, generateScheduledMessage());
      composer.textComposer.setText('my draft');
      composer.state.partialNext({ draftId: 'draft-1' });
      await composer.editScheduledMessage(generateScheduledMessage());

      await composer.updateScheduledMessage();

      expect(composer.editedScheduledMessage).toBeUndefined();
      expect(composer.textComposer.text).toBe('my draft');
      expect(composer.draftId).toBe('draft-1');
    });

    it('waits for uploads in progress before saving the edit', async () => {
      const { client, composer } = setup({ pendingUploadsEnabled: true });
      const updateSpy = mockScheduledUpdate(client, generateScheduledMessage());
      await composer.editScheduledMessage(generateScheduledMessage());
      composer.attachmentManager.state.partialNext({
        attachments: [uploadAttachment('uploading')],
      });

      const updating = composer.updateScheduledMessage();
      await Promise.resolve();
      expect(updateSpy).not.toHaveBeenCalled();
      composer.attachmentManager.state.partialNext({
        attachments: [uploadAttachment('finished')],
      });

      await expect(updating).resolves.toEqual(
        expect.objectContaining({ status: 'scheduled' }),
      );
      expect(updatedMessage(updateSpy)).toEqual(
        expect.objectContaining({
          attachments: [
            expect.objectContaining({ image_url: 'https://cdn.example.com/a.png' }),
          ],
        }),
      );
    });

    it('keeps the edit and does not save it when an upload failed', async () => {
      const { client, composer } = setup({ pendingUploadsEnabled: true });
      const updateSpy = mockScheduledUpdate(client, generateScheduledMessage());
      const addErrorSpy = vi.spyOn(client.notifications, 'addError');
      const scheduledMessage = generateScheduledMessage();
      await composer.editScheduledMessage(scheduledMessage);
      composer.attachmentManager.state.partialNext({
        attachments: [uploadAttachment('failed')],
      });

      const result = await composer.updateScheduledMessage();

      expect(result).toEqual({ error: expect.any(Error), status: 'failed' });
      expect(updateSpy).not.toHaveBeenCalled();
      expect(composer.editedScheduledMessage).toBe(scheduledMessage);
      expect(addErrorSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          options: expect.objectContaining({
            type: CORE_NOTIFICATION_TYPE.scheduledMessageUpdateFailed,
          }),
        }),
      );
    });

    it('keeps the edit when the update fails', async () => {
      const { client, composer } = setup();
      const error = generateAPIError(4, 'boom');
      vi.spyOn(client, 'updateScheduledMessage').mockRejectedValue(error);
      const addErrorSpy = vi.spyOn(client.notifications, 'addError');
      const scheduledMessage = generateScheduledMessage();
      await composer.editScheduledMessage(scheduledMessage);
      composer.textComposer.setText('edited');

      const result = await composer.updateScheduledMessage();

      expect(result).toEqual({ error, status: 'failed' });
      expect(composer.editedScheduledMessage).toBe(scheduledMessage);
      expect(composer.textComposer.text).toBe('edited');
      expect(addErrorSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Failed to update the scheduled message',
          options: expect.objectContaining({
            type: CORE_NOTIFICATION_TYPE.scheduledMessageUpdateFailed,
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
        generateScheduledMessage({ id: 'sm-2', message: { text: 'second', custom: {} } }),
      );

      composer.cancelEditScheduledMessage();

      expect(composer.textComposer.text).toBe('my draft');
    });

    it('fills the composer through initState and keeps the scheduled values', async () => {
      const { composer } = setup();
      const initStateSpy = vi.spyOn(composer, 'initState');
      const scheduledMessage = generateScheduledMessage({
        message: {
          poll_id: 'poll-1',
          show_in_channel: true,
          text: 'see you tomorrow',
          custom: {},
        },
      });

      await composer.editScheduledMessage(scheduledMessage);

      expect(initStateSpy).toHaveBeenCalledTimes(1);
      expect(initStateSpy).toHaveBeenCalledWith({
        composition: expect.objectContaining({
          channel_cid: cid,
          message: expect.objectContaining({ id: 'sm-1', text: 'see you tomorrow' }),
        }),
        stateOverrides: expect.objectContaining({
          draftId: null,
          editedScheduledMessage: scheduledMessage,
          showReplyInChannel: true,
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

    it('blocks a slash command typed during the edit', async () => {
      const { channel, client, composer } = setup();
      addGiphyCommand(channel);
      const updateSpy = vi.spyOn(client, 'updateScheduledMessage');
      const addWarningSpy = vi.spyOn(client.notifications, 'addWarning');
      await composer.editScheduledMessage(generateScheduledMessage());
      composer.textComposer.setText('/giphy cats');

      const result = await composer.updateScheduledMessage();

      expect(result).toEqual({ status: 'blocked' });
      expect(updateSpy).not.toHaveBeenCalled();
      expect(composer.editedScheduledMessage).toBeDefined();
      expect(addWarningSpy).toHaveBeenCalledWith(
        blockedWarning(ScheduledMessageBlockReason.Command),
      );
    });

    it('neither creates nor deletes drafts while editing', async () => {
      const { channel, composer } = setup();
      const createDraftSpy = vi.spyOn(channel, 'createDraft');
      const deleteDraftSpy = vi.spyOn(channel, 'deleteDraft');
      const getDraftSpy = vi.spyOn(channel, 'getDraft');
      composer.state.partialNext({ draftId: 'draft-1' });
      await composer.editScheduledMessage(generateScheduledMessage());

      await composer.createDraft();
      await composer.deleteDraft();
      await composer.getDraft();

      expect(createDraftSpy).not.toHaveBeenCalled();
      expect(deleteDraftSpy).not.toHaveBeenCalled();
      expect(getDraftSpy).not.toHaveBeenCalled();
    });

    describe('draft changed elsewhere during the edit', () => {
      const draftEvent = (type: 'draft.updated' | 'draft.deleted', text: string) =>
        ({
          type,
          cid,
          created_at: nowNs(),
          draft: {
            channel_cid: cid,
            created_at: nowNs(),
            message: { id: 'draft-2', text },
          },
        }) as never;

      const setupEditWithDraft = async () => {
        const { channel, client, composer } = setup();
        vi.spyOn(channel, 'createDraft').mockResolvedValue({ draft: {} } as never);
        vi.spyOn(channel, 'deleteDraft').mockResolvedValue({ duration: '' } as never);
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
      const updateSpy = vi.spyOn(client, 'updateScheduledMessage');
      composer.textComposer.setText('my draft');

      const result = await composer.updateScheduledMessage();
      composer.cancelEditScheduledMessage();

      expect(result).toEqual({ status: 'nothing-to-send' });
      expect(updateSpy).not.toHaveBeenCalled();
      expect(composer.textComposer.text).toBe('my draft');
    });
  });

  describe('rescheduling a failed message', () => {
    it('fills the composer with the failed message as a new composition', async () => {
      const { composer } = setup();
      const failedMessage = generateFailedMessage();

      await composer.editScheduledMessage(failedMessage);

      expect(composer.textComposer.text).toBe('see you tomorrow');
      expect(composer.editedScheduledMessage).toBe(failedMessage);
      expect(composer.draftId).toBeNull();
    });

    // the server refuses to edit a failed message; it is scheduled or sent again instead
    it('does not save a failed message as an edit', async () => {
      const { client, composer } = setup();
      const updateSpy = vi.spyOn(client, 'updateScheduledMessage');

      await composer.editScheduledMessage(generateFailedMessage());
      const result = await composer.updateScheduledMessage();

      expect(result).toEqual({ status: 'nothing-to-send' });
      expect(updateSpy).not.toHaveBeenCalled();
    });

    it('schedules a new message and deletes the failed one', async () => {
      const { channel, client, composer } = setup();
      const failedMessage = generateFailedMessage();
      const newScheduledMessage = generateScheduledMessage({ id: 'sm-2' });
      const sendSpy = mockScheduledSend(client, newScheduledMessage);
      const deleteSpy = vi
        .spyOn(channel, 'deleteScheduledMessage')
        .mockResolvedValue(failedMessage);
      await composer.editScheduledMessage(failedMessage);
      const composerId = composer.id;

      const result = await composer.schedule(scheduledAt);

      expect(sentRequest(sendSpy)).toEqual(
        expect.objectContaining({
          message: expect.objectContaining({ id: composerId, text: 'see you tomorrow' }),
          scheduled_at: scheduledAt,
        }),
      );
      expect(result).toEqual({
        scheduledMessage: newScheduledMessage,
        status: 'scheduled',
      });
      expect(deleteSpy).toHaveBeenCalledWith(failedMessage.id);
      expect(composer.editedScheduledMessage).toBeUndefined();
    });

    it('restores the earlier composition after scheduling', async () => {
      const { channel, client, composer } = setup();
      mockScheduledSend(client, generateScheduledMessage({ id: 'sm-2' }));
      vi.spyOn(channel, 'deleteScheduledMessage').mockResolvedValue(
        generateFailedMessage(),
      );
      composer.textComposer.setText('my draft');
      await composer.editScheduledMessage(generateFailedMessage());

      await composer.schedule(scheduledAt);

      expect(composer.textComposer.text).toBe('my draft');
    });

    it('keeps the failed message and the composition when scheduling fails', async () => {
      const { channel, client, composer } = setup();
      const failedMessage = generateFailedMessage();
      const error = generateAPIError(4, 'boom');
      vi.spyOn(client, 'sendMessage').mockRejectedValue(error);
      const deleteSpy = vi.spyOn(channel, 'deleteScheduledMessage');
      await composer.editScheduledMessage(failedMessage);

      const result = await composer.schedule(scheduledAt);

      expect(result).toEqual({ error, status: 'failed' });
      expect(deleteSpy).not.toHaveBeenCalled();
      expect(composer.editedScheduledMessage).toBe(failedMessage);
      expect(composer.textComposer.text).toBe('see you tomorrow');
    });

    it('logs instead of failing when deleting the failed message fails', async () => {
      const { channel, client, composer } = setup();
      const sink = vi.fn();
      chatLoggerSystem.configureLoggers({
        'message-composer': { sink, level: 'trace' },
      } as never);
      const newScheduledMessage = generateScheduledMessage({ id: 'sm-2' });
      mockScheduledSend(client, newScheduledMessage);
      vi.spyOn(channel, 'deleteScheduledMessage').mockRejectedValue(new Error('gone'));
      await composer.editScheduledMessage(generateFailedMessage());

      await expect(composer.schedule(scheduledAt)).resolves.toEqual({
        scheduledMessage: newScheduledMessage,
        status: 'scheduled',
      });
      await vi.waitFor(() =>
        expect(sink).toHaveBeenCalledWith(
          'error',
          expect.stringContaining('Deleting the failed scheduled message failed.'),
          expect.objectContaining({ error: expect.any(Error) }),
        ),
      );
    });

    it('does not schedule when cancelled while uploads finish', async () => {
      const { channel, client, composer } = setup({ pendingUploadsEnabled: true });
      const sendSpy = mockScheduledSend(client, generateScheduledMessage({ id: 'sm-2' }));
      const deleteSpy = vi.spyOn(channel, 'deleteScheduledMessage');
      composer.textComposer.setText('my draft');
      await composer.editScheduledMessage(generateFailedMessage());
      composer.attachmentManager.state.partialNext({
        attachments: [uploadAttachment('uploading')],
      });

      const scheduling = composer.schedule(scheduledAt);
      composer.cancelEditScheduledMessage();
      composer.attachmentManager.state.partialNext({ attachments: [] });

      await expect(scheduling).resolves.toEqual({ status: 'nothing-to-send' });
      expect(sendSpy).not.toHaveBeenCalled();
      expect(deleteSpy).not.toHaveBeenCalled();
      expect(composer.textComposer.text).toBe('my draft');
    });

    it('restores the earlier composition when cancelled', async () => {
      const { composer } = setup();
      composer.textComposer.setText('my draft');
      composer.state.partialNext({ draftId: 'draft-1' });
      await composer.editScheduledMessage(generateFailedMessage());

      composer.cancelEditScheduledMessage();

      expect(composer.editedScheduledMessage).toBeUndefined();
      expect(composer.textComposer.text).toBe('my draft');
      expect(composer.draftId).toBe('draft-1');
    });

    it('neither creates nor deletes drafts while holding the failed message', async () => {
      const { channel, composer } = setup();
      const createDraftSpy = vi.spyOn(channel, 'createDraft');
      const deleteDraftSpy = vi.spyOn(channel, 'deleteDraft');
      composer.state.partialNext({ draftId: 'draft-1' });
      await composer.editScheduledMessage(generateFailedMessage());

      await composer.createDraft();
      await composer.deleteDraft();

      expect(createDraftSpy).not.toHaveBeenCalled();
      expect(deleteDraftSpy).not.toHaveBeenCalled();
    });

    describe('sending the failed message now', () => {
      const stubSendRequest = (channel: Channel, sendMessageRequest: () => unknown) =>
        channel.configState.partialNext({
          requestHandlers: { sendMessageRequest },
        } as never);

      it('deletes the failed message after the send succeeds and restores the earlier composition', async () => {
        const { channel, client, composer } = setup();
        const failedMessage = generateFailedMessage();
        let resolveSend: (value: unknown) => void = () => undefined;
        const sendRequest = vi.fn(
          () =>
            new Promise((resolve) => {
              resolveSend = resolve;
            }),
        );
        stubSendRequest(channel, sendRequest);
        const deleteSpy = vi
          .spyOn(channel, 'deleteScheduledMessage')
          .mockResolvedValue(failedMessage);
        composer.textComposer.setText('my draft');
        await composer.editScheduledMessage(failedMessage);
        const composerId = composer.id;

        const sending = composer.send();
        await vi.waitFor(() => expect(sendRequest).toHaveBeenCalled());

        expect(composer.editedScheduledMessage).toBeUndefined();
        expect(composer.textComposer.text).toBe('my draft');
        expect(deleteSpy).not.toHaveBeenCalled();

        resolveSend({
          message: {
            id: composerId,
            text: 'see you tomorrow',
            type: 'regular',
            user,
            created_at: nowNs(),
            updated_at: nowNs(),
          },
        });

        await expect(sending).resolves.toBe('sent');
        expect(deleteSpy).toHaveBeenCalledWith(failedMessage.id);
      });

      it('keeps the failed message when the send fails', async () => {
        const { channel, client, composer } = setup();
        stubSendRequest(channel, () => Promise.reject(new Error('boom')));
        const deleteSpy = vi.spyOn(channel, 'deleteScheduledMessage');
        await composer.editScheduledMessage(generateFailedMessage());

        const result = await composer.send();

        expect(result).toBe('failed');
        expect(deleteSpy).not.toHaveBeenCalled();
      });
    });
  });

  describe('scheduled message changed elsewhere', () => {
    it.each([
      [ScheduledMessageEventType.Sent, ScheduledMessageCompositionEndReason.Sent],
      [ScheduledMessageEventType.Deleted, ScheduledMessageCompositionEndReason.Deleted],
      [ScheduledMessageEventType.Failed, ScheduledMessageCompositionEndReason.Failed],
    ])('ends the edit and restores the draft on %s', async (type, reason) => {
      const { client, composer } = setup();
      const addWarningSpy = vi.spyOn(client.notifications, 'addWarning');
      composer.registerSubscriptions();
      composer.textComposer.setText('my draft');
      const scheduledMessage = generateScheduledMessage();
      await composer.editScheduledMessage(scheduledMessage);

      client.dispatchEvent(scheduledEvent(type, scheduledMessage));

      expect(composer.editedScheduledMessage).toBeUndefined();
      expect(composer.textComposer.text).toBe('my draft');
      expect(addWarningSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          options: {
            type: CORE_NOTIFICATION_TYPE.scheduledMessageCompositionEnded,
            metadata: { reason },
          },
        }),
      );
    });

    it('ignores events of other scheduled messages', async () => {
      const { client, composer } = setup();
      composer.registerSubscriptions();
      const scheduledMessage = generateScheduledMessage();
      await composer.editScheduledMessage(scheduledMessage);

      client.dispatchEvent(
        scheduledEvent(
          ScheduledMessageEventType.Sent,
          generateScheduledMessage({ id: 'sm-2' }),
        ),
      );

      expect(composer.editedScheduledMessage).toBe(scheduledMessage);
    });

    it('keeps the newest stored copy of the edited message', async () => {
      const { client, composer } = setup();
      composer.registerSubscriptions();
      const scheduledMessage = generateScheduledMessage();
      await composer.editScheduledMessage(scheduledMessage);
      const newer = generateScheduledMessage({
        updated_at: msToNs(Date.UTC(2026, 9, 16)),
      });
      const older = generateScheduledMessage({
        updated_at: msToNs(Date.UTC(2026, 9, 14)),
      });

      client.dispatchEvent(scheduledEvent(ScheduledMessageEventType.Updated, newer));
      client.dispatchEvent(scheduledEvent(ScheduledMessageEventType.Updated, older));

      expect(composer.editedScheduledMessage).toBe(newer);
      expect(composer.textComposer.text).toBe('see you tomorrow');
    });

    it('ends scheduling a failed message again only when it is deleted', async () => {
      const { client, composer } = setup();
      composer.registerSubscriptions();
      const failedMessage = generateFailedMessage();
      await composer.editScheduledMessage(failedMessage);

      client.dispatchEvent(
        scheduledEvent(ScheduledMessageEventType.Failed, failedMessage),
      );

      expect(composer.editedScheduledMessage).toBe(failedMessage);

      client.dispatchEvent(
        scheduledEvent(ScheduledMessageEventType.Deleted, failedMessage),
      );

      expect(composer.editedScheduledMessage).toBeUndefined();
    });
  });

  describe('channel state arriving during a scheduled composition', () => {
    const channelResponseWithDraft = (text: string) =>
      ({
        channel: { cid, id: channelId, type: channelType },
        draft: {
          channel_cid: cid,
          created_at: nowNs(),
          message: { id: 'draft-2', text },
        },
      }) as unknown as Parameters<MessageComposer['initStateFromChannelResponse']>[0];

    it('keeps the edit and restores the newer draft when the edit ends', async () => {
      const { composer } = setup();
      composer.textComposer.setText('my draft');
      await composer.editScheduledMessage(generateScheduledMessage());

      composer.initStateFromChannelResponse(channelResponseWithDraft('newer draft'));

      expect(composer.textComposer.text).toBe('see you tomorrow');
      expect(composer.editedScheduledMessage).toBeDefined();

      composer.cancelEditScheduledMessage();

      expect(composer.textComposer.text).toBe('newer draft');
    });

    it('keeps a failed message being scheduled again', async () => {
      const { composer } = setup();
      const failedMessage = generateFailedMessage();
      await composer.editScheduledMessage(failedMessage);

      composer.initStateFromChannelResponse(channelResponseWithDraft('newer draft'));

      expect(composer.editedScheduledMessage).toBe(failedMessage);
      expect(composer.textComposer.text).toBe('see you tomorrow');
    });
  });

  describe('toScheduledMessagePreview', () => {
    it('maps the scheduled message to a local message shown at its scheduled time', () => {
      const scheduledMessage = generateScheduledMessage({
        message: {
          text: 'see you tomorrow',
          custom: { mood: 'happy' },
          parent_id: 'parent-1',
          quoted_message_id: 'quoted-1',
          show_in_channel: true,
          silent: true,
          attachments: [{ type: 'image', image_url: 'https://cdn.example.com/a.png' }],
        },
      });

      const preview = toScheduledMessagePreview(scheduledMessage);

      expect(preview).toEqual(
        expect.objectContaining({
          attachments: [{ type: 'image', image_url: 'https://cdn.example.com/a.png' }],
          cid,
          created_at: createdAt,
          custom: { mood: 'happy' },
          id: 'sm-1',
          parent_id: 'parent-1',
          quoted_message_id: 'quoted-1',
          show_in_channel: true,
          silent: true,
          status: 'received',
          text: 'see you tomorrow',
          type: 'regular',
          updated_at: scheduledMessage.scheduled_at,
          user,
        }),
      );
    });

    it('fills defaults for the fields the scheduled message leaves out', () => {
      const preview = toScheduledMessagePreview(
        generateScheduledMessage({ message: { text: 'plain' } as never }),
      );

      expect(preview).toEqual(
        expect.objectContaining({
          attachments: [],
          custom: {},
          latest_reactions: [],
          mentioned_channel: false,
          mentioned_here: false,
          mentioned_users: [],
          own_reactions: [],
          pinned: false,
          reply_count: 0,
          silent: false,
          text: 'plain',
        }),
      );
    });
  });
});
