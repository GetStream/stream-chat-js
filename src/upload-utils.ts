import type { FileReferenceBase, FileUploadInput } from './types';

const isWebFile = (value: unknown): value is Blob =>
  typeof Blob !== 'undefined' && value instanceof Blob;

const isFileReferenceBase = (value: unknown): value is FileReferenceBase =>
  !!value &&
  typeof value === 'object' &&
  typeof (value as FileReferenceBase).uri === 'string';

/**
 * Wraps a bare URI string in a {@link FileReferenceBase}; `File`, `Blob` and picker objects pass
 * through.
 */
export const normalizeUploadFile = (file?: FileUploadInput) =>
  typeof file === 'string' ? { uri: file } : file;

/**
 * Appends one request-body entry to a multipart form. Pass **raw** values: objects and arrays are
 * JSON-encoded here, so pre-stringifying them double-encodes.
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

/** Encodes a request body as `multipart/form-data`. */
export function toFormData(body: Record<string, unknown>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(body)) appendToFormData(data, key, value);
  return data;
}
