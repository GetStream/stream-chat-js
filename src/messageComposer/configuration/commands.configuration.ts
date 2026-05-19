import type {
  CommandsConfig,
  CommandSendValidator,
  MessageComposerConfig,
} from './types';
import type { DeepPartial } from '../../types.utility';
import { stripMentionTokens } from '../middleware';

export const MENTION_ONLY_COMMANDS = new Set(['mute', 'unmute', 'unban']);
export const defaultCommandSendabilityValidator: CommandSendValidator = ({
  command,
  commandArgsText,
  mentionedUsersInText,
}) => {
  if (command.name !== 'ban' && !MENTION_ONLY_COMMANDS.has(command.name ?? '')) return;

  if (mentionedUsersInText.length === 0) {
    return { command, ready: false, reason: 'missing-mention' };
  }

  if (command.name !== 'ban') {
    return { command, ready: true };
  }

  const banReason = stripMentionTokens(commandArgsText, mentionedUsersInText);

  if (!banReason.length) {
    return { command, ready: false, reason: 'missing-ban-reason' };
  }

  return { command, ready: true };
};
export const DEFAULT_COMMANDS_CONFIG: CommandsConfig = {
  sendValidator: defaultCommandSendabilityValidator,
};
export const applyCommandValidatorOverride = (
  targetConfig: MessageComposerConfig,
  sourceConfig?: DeepPartial<MessageComposerConfig>,
) => {
  const overrideValidator = sourceConfig?.commands?.sendValidator as
    | CommandSendValidator
    | undefined;

  if (typeof overrideValidator === 'undefined') {
    return targetConfig;
  }

  return {
    ...targetConfig,
    commands: {
      ...targetConfig.commands,
      sendValidator: overrideValidator,
    },
  };
};
