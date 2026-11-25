import { WithSubscriptions } from '../utils/WithSubscriptions';
import { CORE_NOTIFICATION_TYPE } from '../notifications';
import {
  SCHEDULED_MESSAGE_STATUS,
  ScheduledMessageBlockReason,
  ScheduledMessageCompositionEndReason,
  ScheduledMessageEventType,
} from '../scheduledMessages/constants';
import { getCurrentCommand } from './middleware/textComposer/commandUtils';
import { toScheduledMessagePayload } from '../scheduledMessages/composition';
import { nsToDate } from '../utils/time';
import {
  resolveMessageById,
  resolveUsersByIds,
} from '../scheduledMessages/editResolvers';
import { chatLoggerSystem } from '../logger';
import type { Unsubscribe } from '@stream-io/state-store';
import type { ScheduledMessageResponse } from '../gen/models';
import type { DraftResponse, LocalMessage } from '../types';
import type {
  MessageComposer,
  MessageComposerSnapshot,
  MessageComposerState,
} from './messageComposer';

const logger = chatLoggerSystem.getLogger('message-composer');

const END_REASON_BY_SCHEDULED_MESSAGE_EVENT = {
  [ScheduledMessageEventType.Deleted]: ScheduledMessageCompositionEndReason.Deleted,
  [ScheduledMessageEventType.Failed]: ScheduledMessageCompositionEndReason.Failed,
  [ScheduledMessageEventType.Sent]: ScheduledMessageCompositionEndReason.Sent,
} as const;

type ScheduledMessageEndEventType = keyof typeof END_REASON_BY_SCHEDULED_MESSAGE_EVENT;

type ScheduledMessageEditRestore = () => void;

type ScheduledSubmitRestorePoint = {
  snapshot: MessageComposerSnapshot;
  state: MessageComposerState;
};

export type ScheduledMessageSubmitResult = {
  status: 'scheduled' | 'sent' | 'nothing-to-send' | 'blocked' | 'failed';
  error?: unknown;
  scheduledMessage?: ScheduledMessageResponse;
};

export type ScheduledMessageCompositionOptions = {
  composer: MessageComposer;
};

export class ScheduledMessageComposition extends WithSubscriptions {
  private readonly composer: MessageComposer;
  private restoreAfterEdit: ScheduledMessageEditRestore | null = null;

  constructor({ composer }: ScheduledMessageCompositionOptions) {
    super();
    this.composer = composer;
  }

  get editedScheduledMessage(): ScheduledMessageResponse | undefined {
    return this.composer.editedScheduledMessage;
  }

  private get failedScheduledMessage(): ScheduledMessageResponse | undefined {
    const { editedScheduledMessage } = this;

    return editedScheduledMessage?.status === SCHEDULED_MESSAGE_STATUS.Failed
      ? editedScheduledMessage
      : undefined;
  }

  get scheduleBlockReason(): ScheduledMessageBlockReason | undefined {
    const { channel, locationComposer } = this.composer;

    if (!channel.scheduledMessagesEnabled) {
      return ScheduledMessageBlockReason.Unavailable;
    }

    if (getCurrentCommand(this.composer)) {
      return ScheduledMessageBlockReason.Command;
    }

    if (locationComposer.validLocation) {
      return ScheduledMessageBlockReason.SharedLocation;
    }

    return undefined;
  }

  get pausesDrafts(): boolean {
    return !!this.editedScheduledMessage;
  }

  get blocksNewComposition(): boolean {
    return !!this.editedScheduledMessage && !this.failedScheduledMessage;
  }

  public handleDraftWhileEditing = (draft?: DraftResponse): boolean => {
    if (!this.editedScheduledMessage) return false;
    if (draft) {
      this.restoreAfterEdit = () => this.composer.initState({ composition: draft });
    }
    return true;
  };

  public clearDraftWhileEditing = (): boolean => {
    if (!this.editedScheduledMessage) return false;
    this.restoreAfterEdit = this.composer.clear;
    return true;
  };

  public claimSend = (): { onSent: () => void } | null => {
    const { failedScheduledMessage } = this;
    if (!failedScheduledMessage) return null;

    this.endEdit();

    return { onSent: () => this.removeFailedScheduledMessage(failedScheduledMessage) };
  };

  private endEdit = () => {
    const restore = this.restoreAfterEdit ?? this.composer.clear;

    this.restoreAfterEdit = null;
    this.composer.state.partialNext({ editedScheduledMessage: null });

    restore();
  };

  private saveCompositionBeforeEdit = () => {
    if (this.editedScheduledMessage) return;

    const snapshot = this.composer.getSnapshot();
    const state = this.composer.state.getLatestValue();

    this.restoreAfterEdit = () => {
      this.composer.restoreSnapshot(snapshot);
      this.composer.state.next(state);
    };
  };

  private removeFailedScheduledMessage = (
    failedScheduledMessage: ScheduledMessageResponse,
  ) => {
    this.composer.channel.messageOperations
      .deleteScheduledMessage(failedScheduledMessage.id)
      .catch((error) =>
        logger
          .withExtraTags('removeFailedScheduledMessage', this.composer.channel.cid)
          .error('Deleting the failed scheduled message failed.', { error }),
      );
  };

  private refreshEditedScheduledMessage = ({
    scheduled_message: incoming,
  }: {
    scheduled_message?: ScheduledMessageResponse;
  }) => {
    const { editedScheduledMessage } = this;

    if (!incoming || incoming.id !== editedScheduledMessage?.id) return;

    if (incoming.updated_at < editedScheduledMessage.updated_at) return;

    this.composer.state.partialNext({ editedScheduledMessage: incoming });
  };

  private endWhenScheduledMessageEnds = ({
    scheduled_message: incoming,
    type,
  }: {
    scheduled_message?: ScheduledMessageResponse;
    type: ScheduledMessageEndEventType;
  }) => {
    const { editedScheduledMessage, failedScheduledMessage } = this;
    const reason = END_REASON_BY_SCHEDULED_MESSAGE_EVENT[type];

    if (!incoming || incoming.id !== editedScheduledMessage?.id) return;

    const isFailedMessageStillThere =
      !!failedScheduledMessage && reason !== ScheduledMessageCompositionEndReason.Deleted;

    if (isFailedMessageStillThere) return;

    this.endEdit();
    this.composer.notifyWarning('The scheduled message can no longer be edited', {
      type: CORE_NOTIFICATION_TYPE.scheduledMessageCompositionEnded,
      metadata: { reason },
    });
  };

  public registerSubscriptions = (): Unsubscribe => {
    if (!this.hasSubscriptions) {
      const { client } = this.composer;
      const endEventTypes = Object.keys(
        END_REASON_BY_SCHEDULED_MESSAGE_EVENT,
      ) as ScheduledMessageEndEventType[];

      this.addUnsubscribeFunction(
        client.on(ScheduledMessageEventType.Updated, this.refreshEditedScheduledMessage)
          .unsubscribe,
      );
      endEventTypes.forEach((eventType) =>
        this.addUnsubscribeFunction(
          client.on(eventType, this.endWhenScheduledMessageEnds).unsubscribe,
        ),
      );
    }

    this.incrementRefCount();

    return () => this.unregisterSubscriptions();
  };

  public editScheduledMessage = async (scheduledMessage: ScheduledMessageResponse) => {
    const { composer } = this;
    const { message } = scheduledMessage;
    const { mentioned_users: mentionedUserIds, quoted_message_id: quotedMessageId } =
      message;

    const quotedMessagePromise = quotedMessageId
      ? resolveMessageById(composer.client, quotedMessageId)
      : null;

    const [mentionedUsers, loadedQuotedMessage] = await Promise.all([
      resolveUsersByIds(composer.client, mentionedUserIds),
      quotedMessagePromise,
    ]);

    let quotedMessage = loadedQuotedMessage;

    if (!quotedMessage && quotedMessageId) {
      quotedMessage = { id: quotedMessageId } as LocalMessage;
    }

    this.saveCompositionBeforeEdit();

    composer.initState({ composition: scheduledMessage });
    // A scheduled message stores only the ids of its quoted message and mentioned users,
    // so initState cannot fill them; they are fetched above and set here.
    composer.setQuotedMessage(quotedMessage);
    composer.textComposer.setMentionedUsers(mentionedUsers);
  };

  public schedule = async (scheduledAt: Date): Promise<ScheduledMessageSubmitResult> => {
    const { composer } = this;

    if (composer.hasEditInProgress) return { status: 'nothing-to-send' };

    if (this.scheduleBlockReason) {
      await composer.compose({ sendOptions: { scheduled_at: scheduledAt } });
      return { status: 'blocked' };
    }

    const { failedScheduledMessage } = this;

    const composition = await composer.compose({
      sendOptions: { scheduled_at: scheduledAt },
    });

    if (!composition?.message) return { status: 'nothing-to-send' };

    const { localMessage, sendOptions } = composition;

    let message = composition.message;

    if (failedScheduledMessage) {
      message = {
        ...message,
        parent_id: failedScheduledMessage.message.parent_id,
      };
    }

    let restorePoint: ScheduledSubmitRestorePoint | null = null;

    if (!failedScheduledMessage) {
      restorePoint = {
        snapshot: composer.getSnapshotKeepingUploads(),
        state: composer.state.getLatestValue(),
      };

      composer.releaseSubmittedComposition();
    }

    try {
      const { scheduled_message: scheduledMessage } =
        await composer.channel.messageOperations.scheduleMessage({
          localMessage,
          message,
          options: sendOptions,
        });

      if (failedScheduledMessage) {
        this.endEdit();
        this.removeFailedScheduledMessage(failedScheduledMessage);
      }

      if (!scheduledMessage) return { status: 'sent' };

      return { scheduledMessage, status: 'scheduled' };
    } catch (error) {
      if (restorePoint && composer.compositionIsEmpty) {
        composer.restoreSnapshot(restorePoint.snapshot);
        composer.state.next(restorePoint.state);
      }

      composer.reportSubmitFailure(
        CORE_NOTIFICATION_TYPE.scheduledMessageCreateFailed,
        'Failed to schedule the message',
        error,
      );

      return { error, status: 'failed' };
    }
  };

  public update = async (): Promise<ScheduledMessageSubmitResult> => {
    const { composer } = this;
    const { editedScheduledMessage } = this;

    if (!editedScheduledMessage || this.failedScheduledMessage) {
      return { status: 'nothing-to-send' };
    }

    const sendOptions = {
      scheduled_at: nsToDate(editedScheduledMessage.scheduled_at),
    };

    if (this.scheduleBlockReason) {
      await composer.compose({ sendOptions });
      return { status: 'blocked' };
    }

    const composition = await composer.compose({ sendOptions });

    if (!composition?.message) return { status: 'nothing-to-send' };

    if (this.editedScheduledMessage?.id !== editedScheduledMessage.id) {
      return { status: 'nothing-to-send' };
    }

    const message = toScheduledMessagePayload(
      composition.message,
      editedScheduledMessage,
    );

    try {
      const scheduledMessage =
        await composer.channel.messageOperations.updateScheduledMessage(
          editedScheduledMessage.id,
          { localMessage: composition.localMessage, request: { message } },
        );

      this.endEdit();

      return { scheduledMessage, status: 'scheduled' };
    } catch (error) {
      composer.reportSubmitFailure(
        CORE_NOTIFICATION_TYPE.scheduledMessageUpdateFailed,
        'Failed to update the scheduled message',
        error,
      );
      return { error, status: 'failed' };
    }
  };

  public cancelEdit = () => {
    if (!this.editedScheduledMessage) return;

    this.endEdit();
  };
}
