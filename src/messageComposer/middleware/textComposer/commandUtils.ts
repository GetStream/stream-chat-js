import type { MessageComposer } from '../../messageComposer';
import type { CommandResponse } from '../../../types';

export function escapeCommandRegExp(text: string) {
  return text.replace(/[-[\]{}()*+?.,/\\^$|#]/g, '\\$&');
}

export const getRawCommandName = (text?: string) =>
  text?.match(/^\/(\S+)(?:\s.*)?$/)?.[1];

export const getCompleteCommandInString = (text: string) => {
  // starts with "/" followed by 1+ non-whitespace chars followed by 1+ white-space chars
  // the command name is extracted into a separate group
  const match = text.match(/^\/(\S+)\s+.*/);
  const commandName = match && match[1];
  return commandName;
};

export const stripCommandFromText = (text: string, commandName: string) =>
  text.replace(new RegExp(`^${escapeCommandRegExp(`/${commandName}`)}\\s*`), '');

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
