import type { MessageComposer } from '../../messageComposer';
import type { CommandResponse } from '../../../types';

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
