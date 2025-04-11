import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createFileFromBlobs,
  ensureIsLocalAttachment,
  generateFileName,
  getAttachmentTypeFromMimeType,
  getExtensionFromMimeType,
  isBlobButNotFile,
  isFile,
  isFileList,
  isImageFile,
  isRNFile,
  readFileAsArrayBuffer,
} from '../../../src/messageComposer/fileUtils';
import type { LocalAttachment } from '../../../src/messageComposer/types';
import { generateUUIDv4 } from '../../../src/utils';
import type { Attachment } from '../../../src/types';

const generateUUIDv4Output = 'generated-id';

// Mock dependencies
vi.mock('../../../src/utils', () => ({
  generateUUIDv4: vi.fn(() => generateUUIDv4Output),
}));

// Mock DOM types
class MockFileList {
  private _files: File[] = [];

  constructor(files: File[]) {
    this._files = files;
  }

  item(index: number) {
    return this._files[index];
  }

  get length() {
    return this._files.length;
  }
}

class MockDataTransfer {
  private _files: File[] = [];

  constructor(files: File[]) {
    this._files = files;
  }

  get items() {
    return this._files.map((file) => ({
      kind: 'file',
      type: file.type,
      getAsFile: () => file,
    }));
  }

  get files() {
    return new MockFileList(this._files);
  }
}

// Mock FileReader
class MockFileReader {
  private _result: ArrayBuffer | null = null;
  static _error: Error | null = null;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;

  readAsArrayBuffer(blob: Blob) {
    if (MockFileReader._error) {
      setTimeout(() => this.onerror?.(), 0);
      return;
    }

    // Simulate successful read
    this._result = new ArrayBuffer(blob.size);
    setTimeout(() => this.onload?.(), 0);
  }

  get error() {
    return MockFileReader._error;
  }

  get result() {
    return this._result;
  }

  static setError(error: Error | null) {
    this._error = error;
  }
}

// Add to global scope
Object.defineProperty(global, 'FileList', {
  value: MockFileList,
});

Object.defineProperty(global, 'DataTransfer', {
  value: MockDataTransfer,
});

Object.defineProperty(global, 'FileReader', {
  value: MockFileReader,
});

describe('fileUtils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('isFile', () => {
    it('should return true for File objects', () => {
      const file = new File([''], 'test.txt', { type: 'text/plain' });
      expect(isFile(file)).toBe(true);
    });

    it('should return false for Blob objects', () => {
      const blob = new Blob([''], { type: 'text/plain' });
      expect(isFile(blob)).toBe(false);
    });

    it('should return false for RNFile objects', () => {
      const rnFile = {
        name: 'test.txt',
        uri: 'file://test.txt',
        size: 0,
        type: 'text/plain',
      };
      expect(isFile(rnFile)).toBe(false);
    });
  });

  describe('isFileList', () => {
    it('should return true for FileList objects', () => {
      const fileList = new DataTransfer().files;
      expect(isFileList(fileList)).toBe(true);
    });

    it('should return false for null or undefined', () => {
      expect(isFileList(null)).toBe(false);
      expect(isFileList(undefined)).toBe(false);
    });

    it('should return false for scalar values', () => {
      expect(isFileList('string')).toBe(false);
      expect(isFileList(123)).toBe(false);
      expect(isFileList(true)).toBe(false);
    });

    it('should return false for arrays', () => {
      expect(isFileList([])).toBe(false);
    });
  });

  describe('isBlobButNotFile', () => {
    it('should return true for Blob objects that are not Files', () => {
      const blob = new Blob([''], { type: 'text/plain' });
      expect(isBlobButNotFile(blob)).toBe(true);
    });

    it('should return false for File objects', () => {
      const file = new File([''], 'test.txt', { type: 'text/plain' });
      expect(isBlobButNotFile(file)).toBe(false);
    });

    it('should return false for non-Blob objects', () => {
      expect(isBlobButNotFile({})).toBe(false);
      expect(isBlobButNotFile('string')).toBe(false);
    });
  });

  describe('isRNFile', () => {
    it('should return true for RNFile objects', () => {
      const rnFile = {
        name: 'test.txt',
        uri: 'file://test.txt',
        size: 0,
        type: 'text/plain',
      };
      expect(isRNFile(rnFile)).toBe(true);
    });

    it('should return false for File objects', () => {
      const file = new File([''], 'test.txt', { type: 'text/plain' });
      expect(isRNFile(file)).toBe(false);
    });

    it('should return false for Blob objects', () => {
      const blob = new Blob([''], { type: 'text/plain' });
      expect(isRNFile(blob)).toBe(false);
    });

    it('should return false for incomplete RNFile objects', () => {
      // These objects are missing required properties for RNFile
      expect(isRNFile({ name: 'test.txt', type: 'text/plain', size: 0 } as any)).toBe(
        false,
      );
      expect(
        isRNFile({ uri: 'file://test.txt', type: 'text/plain', size: 0 } as any),
      ).toBe(false);
      expect(
        isRNFile({ name: 'test.txt', uri: 'file://test.txt', type: 'text/plain' } as any),
      ).toBe(false);
      expect(isRNFile({ name: 'test.txt', uri: 'file://test.txt', size: 0 } as any)).toBe(
        false,
      );
    });
  });

  describe('createFileFromBlobs', () => {
    it('should create a File from an array of Blobs', () => {
      const blob1 = new Blob(['part1'], { type: 'text/plain' });
      const blob2 = new Blob(['part2'], { type: 'text/plain' });
      const fileName = 'test.txt';
      const mimeType = 'text/plain';

      const file = createFileFromBlobs({
        blobsArray: [blob1, blob2],
        fileName,
        mimeType,
      });

      expect(file).toBeInstanceOf(File);
      expect(file.name).toBe(fileName);
      expect(file.type).toBe(mimeType);
    });
  });

  describe('getExtensionFromMimeType', () => {
    it('should extract the extension from a MIME type', () => {
      expect(getExtensionFromMimeType('text/plain')).toBe('plain');
      expect(getExtensionFromMimeType('image/jpeg')).toBe('jpeg');
      expect(getExtensionFromMimeType('application/pdf')).toBe('pdf');
    });

    it('should return undefined for invalid MIME types', () => {
      expect(getExtensionFromMimeType('invalid')).toBeUndefined();
      expect(getExtensionFromMimeType('')).toBeUndefined();
    });
  });

  describe('readFileAsArrayBuffer', () => {
    it('should read file as array buffer', async () => {
      const file = new File(['test'], 'test.txt', { type: 'text/plain' });
      const buffer = await readFileAsArrayBuffer(file);
      expect(buffer).toBeInstanceOf(ArrayBuffer);
      expect(buffer.byteLength).toBe(4); // 'test' is 4 bytes
    });

    it('should reject on read error', async () => {
      const file = new File(['test'], 'test.txt', { type: 'text/plain' });
      MockFileReader.setError(new Error('Read failed'));

      await expect(readFileAsArrayBuffer(file)).rejects.toThrow('Read failed');
      MockFileReader.setError(null);
    });
  });

  describe('generateFileName', () => {
    it('should generate a file name with the correct extension', () => {
      const mimeType = 'image/jpeg';
      const fileName = generateFileName(mimeType);
      expect(fileName).toMatch(/^file_\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/); // file_ followed by date ISO string
      expect(fileName).toMatch(/\.jpeg$/);
    });
  });

  describe('isImageFile', () => {
    it('should return true for image files', () => {
      const file = new File([''], 'test.jpg', { type: 'image/jpeg' });
      expect(isImageFile(file)).toBe(true);
    });

    it('should return false for non-image files', () => {
      const file = new File([''], 'test.txt', { type: 'text/plain' });
      expect(isImageFile(file)).toBe(false);
    });

    it('should return false for Photoshop files', () => {
      const file = new File([''], 'test.psd', { type: 'image/vnd.adobe.photoshop' });
      expect(isImageFile(file)).toBe(false);
    });
  });

  describe('getAttachmentTypeFromMimeType', () => {
    it('should return the correct attachment type for different MIME types', () => {
      expect(getAttachmentTypeFromMimeType('image/jpeg')).toBe('image');
      expect(getAttachmentTypeFromMimeType('video/mp4')).toBe('video');
      expect(getAttachmentTypeFromMimeType('audio/mp3')).toBe('audio');
      expect(getAttachmentTypeFromMimeType('application/pdf')).toBe('file');
    });
  });

  describe('ensureIsLocalAttachment', () => {
    beforeEach(() => {
      vi.mocked(generateUUIDv4).mockClear();
    });

    it('should return attachment if already local', () => {
      const localAttachment: LocalAttachment = {
        type: 'file',
        localMetadata: {
          id: 'local-id',
          file: new File([''], 'test.txt'),
          uploadState: 'pending',
        },
      };
      const result = ensureIsLocalAttachment(localAttachment);
      expect(result).toBe(localAttachment);
    });

    it('should add local properties to non-local attachment', () => {
      const attachment: Attachment = {
        type: 'file',
        asset_url: 'https://example.com/file.txt',
      };
      const result = ensureIsLocalAttachment(attachment);
      expect(result).toEqual({
        ...attachment,
        localMetadata: {
          id: generateUUIDv4Output,
        },
      });
      expect(generateUUIDv4).toHaveBeenCalled();
    });

    it('should handle undefined attachment', () => {
      const result = ensureIsLocalAttachment(undefined as unknown as Attachment);
      expect(result).toEqual(null);
      expect(generateUUIDv4).not.toHaveBeenCalled();
    });
  });
});
