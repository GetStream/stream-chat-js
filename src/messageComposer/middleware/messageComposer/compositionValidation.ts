import { textIsEmpty } from '../../textComposer';
import type { CommandResponse } from '../../../types';
import { CommandSearchSource } from '../textComposer/commands';
import {
  getCommandByName,
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
  searchSource: CommandSearchSource,
  text?: string,
): CommandResponse | undefined => {
  const rawCommand = getCommandByName(searchSource, getRawCommandName(text));
  if (rawCommand && composer.isCommandDisabled(rawCommand)) {
    return rawCommand;
  }
};

export const createCompositionValidationMiddleware = (
  composer: MessageComposer,
  commandSearchSource?: CommandSearchSource,
): MessageCompositionMiddleware => {
  const effectiveCommandSearchSource =
    commandSearchSource ?? new CommandSearchSource(composer.channel);

  return {
    id: 'stream-io/message-composer-middleware/data-validation',
    handlers: {
      compose: async ({
        state,
        discard,
        forward,
      }: MiddlewareHandlerParams<MessageComposerMiddlewareState>) => {
        const { maxLengthOnSend } = composer.config.text ?? {};
        const inputText = state.message.text ?? '';

        const disabledRawCommand = getDisabledRawCommand(
          composer,
          effectiveCommandSearchSource,
          inputText,
        );
        if (disabledRawCommand) {
          notifyCommandDisabled(composer, disabledRawCommand);
          return await discard();
        }

        const currentCommand =
          composer.textComposer.command ??
          getCommandByName(effectiveCommandSearchSource, getRawCommandName(inputText));
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
  };
};

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
