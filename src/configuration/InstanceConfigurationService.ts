/**
 * InstanceConfigurationService is a singleton class that is used to store the configuration for the instances of classes exposed by the SKD such as:
 * - StreamChat
 * - Channel
 * - Thread
 * - MessageComposer
 *
 * Every existing and future instance configuration of the above classes will be setup using the following pattern:
 * - StreamChat: StreamChat.setClientSetupFunction(setupFunction)
 * - Channel: StreamChat.setChannelSetupFunction(setupFunction)
 * - Thread: StreamChat.setThreadSetupFunction(setupFunction)
 * - MessageComposer: StreamChat.setMessageComposerSetupFunction(setupFunction)
 *
 * The setupFunction is a function that is used to set up the instance configuration.
 */

import { StateStore } from '../store';
import type {
  ChannelSetupState,
  MessageComposerSetupState,
  SetInstanceConfigurationFunctions,
  SetInstanceConfigurationServiceStates,
  StreamChatSetupState,
  ThreadSetupState,
} from './types';

type InstanceKey = keyof SetInstanceConfigurationServiceStates;

export class InstanceConfigurationService {
  private static instance: InstanceConfigurationService;
  private setupStates: SetInstanceConfigurationServiceStates = {
    Channel: new StateStore<ChannelSetupState>({
      setupFunction: null,
    }),
    MessageComposer: new StateStore<MessageComposerSetupState>({
      setupFunction: null,
    }),
    StreamChat: new StateStore<StreamChatSetupState>({
      setupFunction: null,
    }),
    Thread: new StateStore<ThreadSetupState>({
      setupFunction: null,
    }),
  };

  setSetupFunctions(setupFunctions: SetInstanceConfigurationFunctions) {
    for (const [instance, setupFunction] of Object.entries(setupFunctions)) {
      const setupState =
        this.setupStates[instance as keyof SetInstanceConfigurationServiceStates];
      if (typeof setupState === 'undefined') return; // null is allowed
      // todo: fix typing
      (setupState as StateStore<{ setupFunction: unknown }>).partialNext({
        setupFunction: setupFunction as SetInstanceConfigurationFunctions[InstanceKey],
      });
    }
  }

  get Channel() {
    return this.setupStates.Channel;
  }

  get MessageComposer() {
    return this.setupStates.MessageComposer;
  }

  get StreamChat() {
    return this.setupStates.StreamChat;
  }

  get Thread() {
    return this.setupStates.Thread;
  }
}
