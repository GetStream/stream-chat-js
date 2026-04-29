import type {
  MessageComposer,
  MessageComposerEffectHandler,
  MessageComposerSnapshot,
} from './messageComposer';
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
  captureSnapshot: (snapshot?: MessageComposerSnapshot) => void;
  restoreLatestSnapshot: () => MessageComposerSnapshot | undefined;
  restoreSnapshot: (snapshot: MessageComposerSnapshot) => void;
};

export class MessageComposerEffectHandlers {
  private handlers = new Map<string, RegisteredMessageComposerEffectHandler>();

  constructor(private options: MessageComposerEffectHandlersOptions) {
    this.registerDefaultHandlers();
  }

  private registerDefaultHandlers = () => {
    this.registerEffectHandler<TextComposerCommandActivationEffect>(
      'command.activate',
      this.applyCommandActivationEffect,
    );
    this.registerEffectHandler<TextComposerCommandClearEffect>(
      'command.clear',
      this.applyCommandClearEffect,
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

  private applyCommandActivationEffect: MessageComposerEffectHandler<TextComposerCommandActivationEffect> =
    (effect, composer) => {
      const snapshot = composer.getSnapshot();
      if (effect.stateToRestore) {
        snapshot.textComposer = composer.textComposer.getSnapshot({
          command: null,
          mentionedUsers: effect.stateToRestore.mentionedUsers,
          selection: effect.stateToRestore.selection,
          text: effect.stateToRestore.text,
        });
      }
      this.options.captureSnapshot(snapshot);

      composer.attachmentManager.clearAttachments();
      composer.linkPreviewsManager.clear();
      composer.locationComposer.clear();
      composer.pollComposer.initState();
      composer.customDataManager.initState();

      composer.textComposer.state.partialNext({
        command: effect.command,
        mentionedUsers: [],
        selection: { start: 0, end: 0 },
        suggestions: undefined,
        text: '',
      });
    };

  private applyCommandClearEffect: MessageComposerEffectHandler<TextComposerCommandClearEffect> =
    (_, composer) => {
      const snapshot = this.options.restoreLatestSnapshot();

      if (!snapshot) {
        composer.textComposer.state.partialNext({ command: null });
        return;
      }

      this.options.restoreSnapshot(snapshot);
    };
}
