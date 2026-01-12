import type { StreamChat } from '../client';
import type { MessageComposer } from '../messageComposer';
import type { Channel } from '../channel';
import type { Thread } from '../thread';
import type { StateStore } from '../store';

export type MessageComposerTearDownFunction = () => void;

export type MessageComposerSetupFunction = ({
  composer,
}: {
  composer: MessageComposer;
}) => void | MessageComposerTearDownFunction;

export type MessageComposerSetupState = {
  /**
   * Each `MessageComposer` runs this function each time its signature changes or
   * whenever you run `MessageComposer.registerSubscriptions`. Function returned
   * from `applyModifications` will be used as a cleanup function - it will be stored
   * and ran before new modification is applied. Cleaning up only the
   * modified parts is the general way to go but if your setup gets a bit
   * complicated, feel free to restore the whole composer with `MessageComposer.restore`.
   */
  setupFunction: MessageComposerSetupFunction | null;
};

export type StreamChatTearDownFunction = () => void;

export type StreamChatSetupFunction = ({
  client,
}: {
  client: StreamChat;
}) => void | StreamChatTearDownFunction;

export type StreamChatSetupState = {
  setupFunction: StreamChatSetupFunction | null;
};

export type ChannelTearDownFunction = () => void;

export type ChannelSetupFunction = ({
  channel,
}: {
  channel: Channel;
}) => void | ChannelTearDownFunction;

export type ChannelSetupState = {
  setupFunction: ChannelSetupFunction | null;
};

export type ThreadTearDownFunction = () => void;

export type ThreadSetupFunction = ({
  thread,
}: {
  thread: Thread;
}) => void | ThreadTearDownFunction;

export type ThreadSetupState = {
  setupFunction: ThreadSetupFunction | null;
};

export type SetInstanceConfigurationServiceStates = {
  Channel: StateStore<ChannelSetupState>;
  MessageComposer: StateStore<MessageComposerSetupState>;
  StreamChat: StateStore<StreamChatSetupState>;
  Thread: StateStore<ThreadSetupState>;
};

export type SetupFnOf<T> =
  T extends StateStore<infer S>
    ? S extends { setupFunction?: infer F }
      ? F
      : never
    : never;

export type SetInstanceConfigurationFunctions = {
  [K in keyof SetInstanceConfigurationServiceStates]?: SetupFnOf<
    SetInstanceConfigurationServiceStates[K]
  >;
};
