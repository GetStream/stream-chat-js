import type { MessageComposer } from '../../messageComposer';
import type { CommandResponse, UserResponse } from '../../../types';
import type { CommandSendability } from '../../configuration';
import type { CommandSearchSource } from './commands';

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

export const stripMentionTokens = (
  text: string,
  mentionedUsersInText: UserResponse[],
  trigger = '@',
) =>
  mentionedUsersInText.reduce((value, user) => {
    let next = value.replace(`${trigger}${user.id}`, '');

    if (user.name) {
      next = next.replace(`${trigger}${user.name}`, '');
    }

    return next.trim();
  }, text.trim());

export const getMentionedUsersInText = (text: string, mentionedUsers: UserResponse[]) =>
  Array.from(
    new Set(
      mentionedUsers.filter(
        ({ id, name }) =>
          text.includes(`@${id}`) || (!!name && text.includes(`@${name}`)),
      ),
    ),
  );

export const getCommandByName = (
  searchSource: CommandSearchSource,
  commandName?: string,
): CommandResponse | undefined => {
  if (!commandName) return;

  const normalizedCommandName = commandName.toLowerCase();
  return searchSource
    .query(normalizedCommandName)
    .items.find((command) => command.name?.toLowerCase() === normalizedCommandName);
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

export const notifyCommandNotReady = ({
  composer,
  sendability,
}: {
  composer: MessageComposer;
  sendability: CommandSendability;
}) => {
  if (sendability.ready) return;

  composer.client.notifications.addWarning({
    message: 'Command not ready to be sent',
    origin: {
      emitter: 'MessageComposer',
      context: { command: sendability.command, composer },
    },
    options: {
      type: 'validation:command:not-ready',
      metadata: {
        command: sendability.command.name,
        ...(sendability.reason ? { reason: sendability.reason } : {}),
        ...(sendability.metadata ?? {}),
      },
    },
  });

  return true;
};
