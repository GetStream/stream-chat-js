/**
 * Compile-time contract for `LocalAttachmentMetadata`. Type-checked, never executed.
 *
 * An attachment with nothing to upload needs only an `id`. A `file` comes with its `uploadState`, so
 * a file the composer would never send fails to compile.
 */
import type {
  AnyLocalAttachment,
  AttachmentLoadingState,
  FileReference,
  LocalAttachment,
} from 'stream-chat';

type Equals<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
const assertType = <T extends true>(value: T) => value;

declare const file: File;

export const nonUpload: AnyLocalAttachment = {
  custom: {},
  localMetadata: { id: 'product' },
  type: 'product',
};
export const upload: AnyLocalAttachment = {
  custom: {},
  localMetadata: { file, id: 'image', uploadState: 'pending' },
  type: 'image',
};
// The fake upload integrators built for a custom attachment keeps compiling.
export const fakedUpload: AnyLocalAttachment = {
  custom: {},
  localMetadata: { file, id: 'product', uploadState: 'finished' },
  type: 'product',
};
// An upload restored from a sent message or a draft has no file.
export const restoredUpload: AnyLocalAttachment = {
  custom: {},
  localMetadata: { id: 'image', uploadState: 'finished' },
  type: 'image',
};
export const unstartedUpload: AnyLocalAttachment = {
  custom: {},
  // @ts-expect-error -- a file without an upload state is never sent
  localMetadata: { file, id: 'image' },
  type: 'image',
};

declare const attachment: LocalAttachment;
assertType<
  Equals<typeof attachment.localMetadata.file, File | FileReference | undefined>
>(true);
assertType<
  Equals<typeof attachment.localMetadata.uploadState, AttachmentLoadingState | undefined>
>(true);
