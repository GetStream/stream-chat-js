import { describe, expect, it } from 'vitest';
import {
  getAttachmentPreviewUrl,
  resolveAttachmentFileSize,
  resolveAttachmentFullByteSize,
} from '../../../src/messageComposer/attachmentUtils';

describe('attachmentUtils', () => {
  describe('getAttachmentPreviewUrl', () => {
    const pending = {
      localMetadata: { id: 'a', previewUri: 'blob:preview', uploadState: 'uploading' },
      type: 'image',
    };

    it('prefers the first resolved URL it is given', () => {
      expect(getAttachmentPreviewUrl(pending, undefined, 'https://cdn/a.png')).toBe(
        'https://cdn/a.png',
      );
    });

    it('falls back to the local preview while the upload is in flight', () => {
      expect(getAttachmentPreviewUrl(pending, undefined)).toBe('blob:preview');
    });

    it('returns undefined when there is nothing to render yet', () => {
      expect(getAttachmentPreviewUrl({ type: 'image' }, undefined)).toBeUndefined();
      expect(getAttachmentPreviewUrl(undefined)).toBeUndefined();
    });
  });

  describe('resolveAttachmentFileSize', () => {
    it('reads the v10 location first', () => {
      expect(
        resolveAttachmentFileSize({ custom: { file_size: 10 }, file_size: 20 }),
      ).toBe(10);
    });

    it('falls back to the flat field for older payloads', () => {
      expect(resolveAttachmentFileSize({ file_size: 20 })).toBe(20);
    });

    it('returns undefined when neither is present', () => {
      expect(resolveAttachmentFileSize({})).toBeUndefined();
    });
  });

  describe('resolveAttachmentFullByteSize', () => {
    it('prefers the held File, the only exact figure during an upload', () => {
      expect(
        resolveAttachmentFullByteSize({
          custom: { file_size: 1 },
          localMetadata: { file: { size: 4096 } },
        }),
      ).toBe(4096);
    });

    it('parses a string size', () => {
      expect(resolveAttachmentFullByteSize({ custom: { file_size: '2048' } })).toBe(2048);
    });

    it('rejects negative and unparseable sizes', () => {
      expect(resolveAttachmentFullByteSize({ file_size: -1 })).toBeUndefined();
      expect(resolveAttachmentFullByteSize({ file_size: 'huge' })).toBeUndefined();
    });
  });
});
