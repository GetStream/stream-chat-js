import { textIsEmpty } from '../../textComposer';
import type { Command } from '../../../types';
import {
  getCommandByName,
  getCurrentCommand,
  getRawCommandName,
  notifyCommandDisabled,
  notifyCommandNotReady,
} from '../textComposer/commandUtils';
import type {
  MessageComposerMiddlewareState,
  MessageCompositionMiddleware,
  MessageDraftComposerMiddlewareValueState,
  MessageDraftCompositionMiddleware,
} from './types';
import type { MessageComposer } from '../../messageComposer';
import type { MiddlewareHandlerParams } from '../../../middleware';

const getDisabledRawCommand = (
  composer: MessageComposer,
  text?: string,
): Command | undefined => {
  const rawCommand = getCommandByName(
    composer.commandSearchSource,
    getRawCommandName(text),
  );
  if (rawCommand && composer.isCommandDisabled(rawCommand)) {
    return rawCommand;
  }
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

      const currentCommand = getCurrentCommand(composer, inputText);
      if (
        currentCommand &&
        notifyCommandNotReady({
          composer,
          sendability: composer.validateCommandSendability(currentCommand, inputText),
        })
      ) {
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
