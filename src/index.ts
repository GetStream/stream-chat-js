export * from './client';
export * from './client_state';
export * from './channel';
export * from './channel_state';
// Don't use * here: the `Custom*Data` interfaces below are augmented by integrators, and `export *` can
// break module augmentation (TS#46617). The configuration key types are deliberately *not* augmentable —
// they are type aliases — so they are listed for the same mechanical reason, not to invite extension.
// https://github.com/microsoft/TypeScript/issues/46617
// Named in the signatures of `client.config.set` / `setConfig`, so a caller has to be able to write it.
export type { DeepPartial } from './types.utility';
export {
  BUILT_IN_INSTANCE_KEYS,
  CONSTRUCTION_ONLY_CONFIG_PATHS,
  INSTANCE_CONFIG_TREE_KEYS,
} from './configuration/keys';
export type {
  ChannelDeclarativeConfig,
  ClientDeclarativeConfig,
  DeclarativeMessagePaginatorConfig,
  DeclarativePaginatorConfig,
  InstanceConfigOf,
  InstanceConfigState,
  InstanceConfigTree,
  InstanceSetupFunction,
  InstanceSetupFunctionArgs,
  InstanceSetupFunctionArgsOf,
  InstanceSetupKey,
  InstanceSetupState,
  InstanceSetupTearDownFunction,
  ThreadDeclarativeConfig,
  UnreadReferencePolicy,
} from './configuration/types';
export type {
  ConfiguredInstance,
  InstanceConfigurationRegistry,
} from './configuration/InstanceConfigurationRegistry';
export { mergeServerRestrictions } from './configuration/utils/serverAuthority';
export type {
  ServerRestrictions,
  ServerUpperBounds,
} from './configuration/utils/serverAuthority';
export { flattenConfigShape, INSTANCE_CONFIG_TREE_SHAPE } from './configuration/shape';
export type {
  ConfigGroupNode,
  ConfigNode,
  ConfigShape,
  ConfigValueNode,
  ConfigValueType,
} from './configuration/shape';
export * from './connection';
export { type CooldownTimerState } from './CooldownTimer';
export * from './insights';
export * from './logger';
export * from './messageComposer';
export * from './messageDelivery';
export { EntityStore } from './entityStore/EntityStore';
export type {
  EntityStoreChangeBatch,
  EntityStoreOptions,
  EntityStoreSubscriber,
} from './entityStore/EntityStore';
export * from './middleware';
export * from './moderation';
export * from './notifications';
export * from './pagination';
export * from './poll';
export * from './poll_manager';
export * from './reminders';
export * from './search';
export * from './signing';
export * from './store';
export { Thread } from './thread';
export type {
  CustomThreadMarkReadRequestFn,
  ThreadConfig,
  ThreadReadState,
  ThreadState,
  ThreadUserReadState,
} from './thread';
export * from './thread_manager';
export * from './token_manager';
export * from './types';
export * from './uploadManager';
export * from './offline-support';
export * from './LiveLocationManager';
// Don't use * here, that can break module augmentation https://github.com/microsoft/TypeScript/issues/46617
export type {
  CustomAttachmentData,
  CustomChannelData,
  CustomCommandData,
  CustomEventData,
  CustomEventTypes,
  CustomMemberData,
  CustomMessageComposerData,
  CustomMessageData,
  CustomPollOptionData,
  CustomPollData,
  CustomReactionData,
  CustomUserData,
  CustomThreadData,
} from './custom_types';
export {
  isOwnUser,
  chatCodes,
  logChatPromiseExecution,
  localMessageToNewMessagePayload,
  formatMessage,
} from './utils';
export { FixedSizeQueueCache } from './utils/FixedSizeQueueCache';
export * from './ChannelManager';
export * from './ConnectionRecoveryManager';
export * from './EventHandlerPipeline';
