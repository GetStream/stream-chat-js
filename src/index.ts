export * from './client';
export * from './client_state';
export * from './channel';
export * from './channel_state';
// The configuration exports are listed by name, not `export *`, which can break module augmentation
// (https://github.com/microsoft/TypeScript/issues/46617).
// `DeepPartial` is named in the signatures of `client.config.set` / `setConfig`.
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
export * from './logger';
export * from './messageComposer';
export * from './messageDelivery';
export { EntityStore } from './entityStore/EntityStore';
export type {
  EntityStoreChangeBatch,
  EntityStoreClaim,
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
export * from './languageNames';
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
// Type-only, so it is erased from the bundle. Declaration emit keeps it, which carries the
// `DateConstructor` augmentation (`new Date(timestampNs)` is a compile error) into the published
// types.
export type {} from './gen/models/timestamp-guard';
export * from './uploadManager';
export * from './offline-support';
export * from './LiveLocationManager';
// Don't use * here, that can break module augmentation
// https://github.com/microsoft/TypeScript/issues/46617
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
export {
  asTimestampNS,
  convertTimestampToDate,
  dateToNs,
  msToNs,
  nowNs,
  NS_PER_MS,
  nsToDate,
  nsToMs,
  nsToRfc3339,
} from './utils/time';
/**
 * Tag-keyed async runners. Tags share one process-wide map, so namespace yours
 * (`my-app/thing/${id}`).
 */
export {
  hasPending,
  settled,
  withCancellation,
  withoutConcurrency,
} from './utils/concurrency';
export * from './ChannelManager';
export * from './EventHandlerPipeline';
