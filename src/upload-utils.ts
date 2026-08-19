import type { FileReferenceBase, FileUploadInput } from './types';

const isWebFile = (value: unknown): value is Blob =>
  typeof Blob !== 'undefined' && value instanceof Blob;

const isFileReferenceBase = (value: unknown): value is FileReferenceBase =>
  !!value &&
  typeof value === 'object' &&
  typeof (value as FileReferenceBase).uri === 'string';

/**
 * Turns a bare URI string into a {@link FileReferenceBase} so the multipart encoder can derive a
 * file name from it. `File`, `Blob` and picker objects pass through untouched.
 */
export const normalizeUploadFile = (file?: FileUploadInput) =>
  typeof file === 'string' ? { uri: file } : file;

/**
 * Appends one request-body entry to a multipart form using Stream's encoding rules.
 *
 * Callers must pass **raw** values - objects and arrays are JSON-encoded here (that is what
 * the API expects for `user` and `upload_sizes`), so pre-stringifying them double-encodes.
 */
export function appendToFormData(data: FormData, key: string, value: unknown) {
  if (value === undefined || value === null) return;

  if (isWebFile(value)) {
    const name = (value as File).name;
    if (name) data.append(key, value, name);
    else data.append(key, value);
  } else if (isFileReferenceBase(value)) {
    // React Native reads `uri`, `name` and `type` off this object.
    data.append(key, {
      uri: value.uri,
      name: value.name || value.uri.split('/').reverse()[0],
      type: value.type || undefined,
    } as unknown as Blob);
  } else if (typeof value === 'object') {
    data.append(key, JSON.stringify(value));
  } else {
    data.append(key, String(value));
  }
}

/**
 * Encodes a request body as `multipart/form-data`. Used by `ApiClient.sendRequest` for every
 * generated operation declaring that content type.
 */
export function toFormData(body: Record<string, unknown>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(body)) appendToFormData(data, key, value);
  return data;
}
