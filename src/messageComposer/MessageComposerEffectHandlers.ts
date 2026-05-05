import type { MessageComposer, MessageComposerEffectHandler } from './messageComposer';
import type {
  TextComposerCommandActivationEffect,
  TextComposerCommandClearEffect,
} from './middleware/textComposer/types';

type RegisteredMessageComposerEffectHandler = (
  effect: { type: string },
  composer: MessageComposer,
) => void;

export type MessageComposerEffectHandlersOptions = {
  composer: MessageComposer;
};

const applyCommandActivationEffect: MessageComposerEffectHandler<
  TextComposerCommandActivationEffect
> = (effect, composer) => {
  const snapshot = composer.getSnapshot();
  if (effect.stateToRestore) {
    snapshot.textComposer = {
      ...snapshot.textComposer,
      ...effect.stateToRestore,
      command: null,
    };
  }
  composer.captureSnapshot(snapshot);

  // we manually clear because we want the command to still persist
  composer.textComposer.state.next({
    command: effect.command,
    mentionedUsers: [],
    suggestions: undefined,
    selection: { start: 0, end: 0 },
    text: '',
  });
  const attachmentsToCancel = composer.attachmentManager.attachments;
  composer.attachmentManager.initState();
  composer.attachmentManager.cancelAttachmentUploads(attachmentsToCancel);
  composer.linkPreviewsManager.initState();
  composer.locationComposer.initState();
  composer.pollComposer.initState();
  composer.customDataManager.initState();
};

const applyCommandClearEffect: MessageComposerEffectHandler<
  TextComposerCommandClearEffect
> = (_, composer) => {
  const snapshot = composer.popSnapshot();

  if (!snapshot) return;

  composer.restoreSnapshot(snapshot);
};

export class MessageComposerEffectHandlers {
  private handlers = new Map<string, RegisteredMessageComposerEffectHandler>();

  constructor(private options: MessageComposerEffectHandlersOptions) {
    this.registerDefaultHandlers();
  }

  private registerDefaultHandlers = () => {
    this.registerEffectHandler<TextComposerCommandActivationEffect>(
      'command.activate',
      applyCommandActivationEffect,
    );
    this.registerEffectHandler<TextComposerCommandClearEffect>(
      'command.clear',
      applyCommandClearEffect,
    );
  };

  registerEffectHandler = <T extends { type: string }>(
    type: T['type'],
    handler: MessageComposerEffectHandler<T>,
  ): void => {
    this.handlers.set(type, handler as RegisteredMessageComposerEffectHandler);
  };

  applyEffects = <T extends { type: string }>(effects: T[] = []) => {
    effects.forEach((effect) => this.applyEffect(effect));
  };

  private applyEffect = (effect: { type: string }) => {
    const handler = this.handlers.get(effect.type);
    handler?.(effect, this.options.composer);
  };
}
