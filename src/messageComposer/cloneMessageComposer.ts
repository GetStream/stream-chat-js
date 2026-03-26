import { MessageComposer } from './messageComposer';
import type { LocationComposerState } from './LocationComposer';

/**
 * Deep-clone plain JSON-like data; keep function references (e.g. upload hooks) shared.
 * `structuredClone` cannot copy {@link MessageComposerConfig} because it contains functions.
 */
const deepClonePreservingFunctions = <T>(value: T): T => {
  if (typeof value === 'function') return value;
  if (value === null || typeof value !== 'object') return value;
  if (value instanceof Date) return new Date(value.getTime()) as T;
  if (Array.isArray(value)) return value.map(deepClonePreservingFunctions) as T;
  if (Object.getPrototypeOf(value) !== Object.prototype) return value;

  const out = {} as Record<string, unknown>;
  for (const key of Object.keys(value as object)) {
    out[key] = deepClonePreservingFunctions((value as Record<string, unknown>)[key]);
  }
  return out as T;
};

/**
 * Creates a new {@link MessageComposer} with the same client and composition context as
 * `source`, copying all composer and sub-manager state. The clone receives a fresh
 * {@link MessageComposer.id} so it does not collide with the live composer.
 */
export const cloneMessageComposerFrom = (source: MessageComposer): MessageComposer => {
  const target = new MessageComposer({
    client: source.client,
    compositionContext: source.compositionContext,
  });

  target.configState.next(
    deepClonePreservingFunctions(source.configState.getLatestValue()),
  );
  target.editingAuditState.next(
    structuredClone(source.editingAuditState.getLatestValue()),
  );

  const messageComposerState = structuredClone(source.state.getLatestValue());
  const newId = MessageComposer.generateId();
  messageComposerState.id = newId;
  target.state.next(messageComposerState);

  target.textComposer.state.next(
    structuredClone(source.textComposer.state.getLatestValue()),
  );
  target.attachmentManager.state.next(
    structuredClone(source.attachmentManager.state.getLatestValue()),
  );

  const { previews } = source.linkPreviewsManager.state.getLatestValue();
  target.linkPreviewsManager.state.next({
    previews: new Map(
      [...previews].map(([url, preview]) => [url, structuredClone(preview)]),
    ),
  });

  const locationState = structuredClone(
    source.locationComposer.state.getLatestValue(),
  ) as LocationComposerState;
  if (
    locationState.location &&
    typeof locationState.location === 'object' &&
    'message_id' in locationState.location &&
    locationState.location.message_id === source.id
  ) {
    target.locationComposer.state.next({
      location: { ...locationState.location, message_id: newId },
    });
  } else {
    target.locationComposer.state.next(locationState);
  }

  target.pollComposer.state.next(
    structuredClone(source.pollComposer.state.getLatestValue()),
  );
  target.customDataManager.state.next(
    structuredClone(source.customDataManager.state.getLatestValue()),
  );

  return target;
};
