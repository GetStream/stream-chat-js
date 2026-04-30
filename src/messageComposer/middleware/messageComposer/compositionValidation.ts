import { textIsEmpty } from '../../textComposer';
import type { CommandResponse } from '../../../types';
import type {
  MessageComposerMiddlewareState,
  MessageCompositionMiddleware,
  MessageDraftComposerMiddlewareValueState,
  MessageDraftCompositionMiddleware,
} from './types';
import type { MessageComposer } from '../../messageComposer';
import type { MiddlewareHandlerParams } from '../../../middleware';

const getRawCommandName = (text?: string) => text?.match(/^\/(\S+)(?:\s.*)?$/)?.[1];

const getCommandByName = (
  composer: MessageComposer,
  commandName?: string,
): CommandResponse | undefined => {
  if (!commandName) return;

  return composer.channel
    .getConfig()
    ?.commands?.find(
      (command) => command.name?.toLowerCase() === commandName.toLowerCase(),
    );
};

const getDisabledRawCommand = (
  composer: MessageComposer,
  text?: string,
): CommandResponse | undefined => {
  const rawCommand = getCommandByName(composer, getRawCommandName(text));
  if (rawCommand && composer.isCommandDisabled(rawCommand)) {
    return rawCommand;
  }
};

export const notifyCommandDisabled = (
  composer: MessageComposer,
  command: CommandResponse,
) => {
  const disabledReason = composer.getCommandDisabledReason(command);
  if (!disabledReason) return;

  composer.client.notifications.addWarning({
    message:
      disabledReason === 'editing'
        ? 'Command not available while editing'
        : 'Command not available while replying',
    origin: {
      emitter: 'MessageComposer',
      context: { command, composer },
    },
    options: {
      type: 'validation:command:disabled',
      metadata: {
        command: command.name,
        reason: disabledReason,
      },
    },
  });

  return true;
};

export const createCompositionValidationMiddleware = (
  composer: MessageComposer,
): MessageCompositionMiddleware => ({
  id: 'stream-io/message-composer-middleware/data-validation',
  handlers: {
    compose: async ({
      state,
      discard,
      forward,
    }: MiddlewareHandlerParams<MessageComposerMiddlewareState>) => {
      const { maxLengthOnSend } = composer.config.text ?? {};
      const inputText = state.message.text ?? '';

      const disabledRawCommand = getDisabledRawCommand(composer, inputText);
      if (disabledRawCommand) {
        notifyCommandDisabled(composer, disabledRawCommand);
        return await discard();
      }

      const hasExceededMaxLength =
        typeof maxLengthOnSend === 'number' && inputText.length > maxLengthOnSend;

      if (composer.compositionIsEmpty || hasExceededMaxLength) {
        return await discard();
      }

      return await forward();
    },
  },
});

export const createDraftCompositionValidationMiddleware = (
  composer: MessageComposer,
): MessageDraftCompositionMiddleware => ({
  id: 'stream-io/message-composer-middleware/draft-data-validation',
  handlers: {
    compose: async ({
      state,
      discard,
      forward,
    }: MiddlewareHandlerParams<MessageDraftComposerMiddlewareValueState>) => {
      const hasData =
        !textIsEmpty(state.draft.text ?? '') ||
        state.draft.attachments?.length ||
        state.draft.poll_id ||
        state.draft.quoted_message_id;

      const shouldCreateDraft = composer.lastChangeOriginIsLocal && hasData;

      if (!shouldCreateDraft) {
        return await discard();
      }

      return await forward();
    },
  },
});
