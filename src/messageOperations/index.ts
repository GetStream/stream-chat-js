export { MessageOperations } from './MessageOperations';
export { createMessageOperationsPersistence } from './persistence';
export { MessageOperationStatePolicy } from './MessageOperationStatePolicy';
export {
  addReactionOptimistically,
  applyMessageChangeLocally,
  deleteReactionOptimistically,
  isQueuedForReplay,
  REMOVE_MESSAGE,
} from './optimistic';
export type {
  MessageChange,
  LocalMessageAccessor,
  MessageChangeProducer,
  RevertLocalChange,
} from './optimistic';
export type { OptimisticOutcome } from './MessageOperationStatePolicy';
export type {
  MessageOperationsContext,
  MessageOperationsHandlers,
  OperationKind,
  OperationParams,
  OperationRequestFn,
  OperationResponse,
} from './types';
