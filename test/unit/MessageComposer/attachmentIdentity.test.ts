import { describe, expect, it } from 'vitest';
import {
  isScrapedContent,
  isLocalAttachment,
  isLocalUploadAttachment,
  isFileAttachment,
  isLocalFileAttachment,
  isImageAttachment,
  isLocalImageAttachment,
  isAudioAttachment,
  isLocalAudioAttachment,
  isVoiceRecordingAttachment,
  isLocalVoiceRecordingAttachment,
  isVideoAttachment,
  isLocalVideoAttachment,
} from '../../../src/messageComposer/attachmentIdentity';

describe('attachmentIdentity', () => {
  describe('isScrapedContent', () => {
    it('should return true for attachments with og_scrape_url', () => {
      const attachment = { og_scrape_url: 'https://example.com' };
      expect(isScrapedContent(attachment)).toBe(true);
    });

    it('should return true for attachments with title_link', () => {
      const attachment = { title_link: 'https://example.com' };
      expect(isScrapedContent(attachment)).toBe(true);
    });

    it('should return false for attachments without og_scrape_url or title_link', () => {
      const attachment = { type: 'image' };
      expect(isScrapedContent(attachment)).toBe(false);
    });
  });

  describe('isLocalAttachment', () => {
    it('should return true for attachments with localMetadata.id', () => {
      const attachment = { localMetadata: { id: 'test-id' } };
      expect(isLocalAttachment(attachment)).toBe(true);
    });

    it('should return false for attachments without localMetadata.id', () => {
      const attachment = { type: 'image' };
      expect(isLocalAttachment(attachment)).toBe(false);
    });

    it('should return false for attachments with empty localMetadata', () => {
      const attachment = { localMetadata: {} };
      expect(isLocalAttachment(attachment)).toBe(false);
    });

    it('should return false for non-objects', () => {
      expect(isLocalAttachment(null)).toBe(false);
      expect(isLocalAttachment(undefined)).toBe(false);
      expect(isLocalAttachment('string')).toBe(false);
    });
  });

  describe('isLocalUploadAttachment', () => {
    it('should return true for attachments with localMetadata.uploadState', () => {
      const attachment = { localMetadata: { id: 'test-id', uploadState: 'uploading' } };
      expect(isLocalUploadAttachment(attachment)).toBe(true);
    });

    it('should return false for attachments without localMetadata.uploadState', () => {
      const attachment = { localMetadata: { id: 'test-id' } };
      expect(isLocalUploadAttachment(attachment)).toBe(false);
    });

    it('should return false for non-objects', () => {
      expect(isLocalUploadAttachment(null)).toBe(false);
      expect(isLocalUploadAttachment(undefined)).toBe(false);
      expect(isLocalUploadAttachment('string')).toBe(false);
    });
  });

  describe('isFileAttachment', () => {
    it('should return true for attachments with type "file"', () => {
      const attachment = { type: 'file' };
      expect(isFileAttachment(attachment)).toBe(true);
    });

    it('should return true for attachments with mime_type not in supportedVideoFormat', () => {
      const attachment = { mime_type: 'application/pdf', type: 'audio' };
      expect(isFileAttachment(attachment, ['video/mp4'])).toBe(true);
    });

    it('should return false for attachments with mime_type not in supportedVideoFormat but declared as video type', () => {
      const attachment = { mime_type: 'application/pdf', type: 'video' };
      expect(isFileAttachment(attachment, ['video/mp4'])).toBe(false);
    });

    it('should return false for attachments with mime_type in supportedVideoFormat', () => {
      const attachment = { mime_type: 'video/mp4', type: 'video' };
      expect(isFileAttachment(attachment, ['video/mp4'])).toBe(false);
    });
  });

  describe('isLocalFileAttachment', () => {
    it('should return true for local file attachments', () => {
      const attachment = { type: 'file', localMetadata: { id: 'test-id' } };
      expect(isLocalFileAttachment(attachment)).toBe(true);
    });

    it('should return false for non-local file attachments', () => {
      const attachment = { type: 'file' };
      expect(isLocalFileAttachment(attachment)).toBe(false);
    });

    it('should return false for local non-file attachments', () => {
      const attachment = { type: 'image', localMetadata: { id: 'test-id' } };
      expect(isLocalFileAttachment(attachment)).toBe(false);
    });
  });

  describe('isImageAttachment', () => {
    it('should return true for attachments with type "image" and no scraped content', () => {
      const attachment = { type: 'image' };
      expect(isImageAttachment(attachment)).toBe(true);
    });

    it('should return false for attachments with type "image" and scraped content', () => {
      const attachment = { type: 'image', og_scrape_url: 'https://example.com' };
      expect(isImageAttachment(attachment)).toBe(false);
    });

    it('should return false for non-image attachments', () => {
      const attachment = { type: 'file' };
      expect(isImageAttachment(attachment)).toBe(false);
    });
  });

  describe('isLocalImageAttachment', () => {
    it('should return true for local image attachments', () => {
      const attachment = { type: 'image', localMetadata: { id: 'test-id' } };
      expect(isLocalImageAttachment(attachment)).toBe(true);
    });

    it('should return false for non-local image attachments', () => {
      const attachment = { type: 'image' };
      expect(isLocalImageAttachment(attachment)).toBe(false);
    });

    it('should return false for local non-image attachments', () => {
      const attachment = { type: 'file', localMetadata: { id: 'test-id' } };
      expect(isLocalImageAttachment(attachment)).toBe(false);
    });
  });

  describe('isAudioAttachment', () => {
    it('should return true for attachments with type "audio"', () => {
      const attachment = { type: 'audio' };
      expect(isAudioAttachment(attachment)).toBe(true);
    });

    it('should return false for non-audio attachments', () => {
      const attachment = { type: 'file' };
      expect(isAudioAttachment(attachment)).toBe(false);
    });
  });

  describe('isLocalAudioAttachment', () => {
    it('should return true for local audio attachments', () => {
      const attachment = { type: 'audio', localMetadata: { id: 'test-id' } };
      expect(isLocalAudioAttachment(attachment)).toBe(true);
    });

    it('should return false for non-local audio attachments', () => {
      const attachment = { type: 'audio' };
      expect(isLocalAudioAttachment(attachment)).toBe(false);
    });

    it('should return false for local non-audio attachments', () => {
      const attachment = { type: 'file', localMetadata: { id: 'test-id' } };
      expect(isLocalAudioAttachment(attachment)).toBe(false);
    });
  });

  describe('isVoiceRecordingAttachment', () => {
    it('should return true for attachments with type "voiceRecording"', () => {
      const attachment = { type: 'voiceRecording' };
      expect(isVoiceRecordingAttachment(attachment)).toBe(true);
    });

    it('should return false for non-voiceRecording attachments', () => {
      const attachment = { type: 'file' };
      expect(isVoiceRecordingAttachment(attachment)).toBe(false);
    });
  });

  describe('isLocalVoiceRecordingAttachment', () => {
    it('should return true for local voiceRecording attachments', () => {
      const attachment = { type: 'voiceRecording', localMetadata: { id: 'test-id' } };
      expect(isLocalVoiceRecordingAttachment(attachment)).toBe(true);
    });

    it('should return false for non-local voiceRecording attachments', () => {
      const attachment = { type: 'voiceRecording' };
      expect(isLocalVoiceRecordingAttachment(attachment)).toBe(false);
    });

    it('should return false for local non-voiceRecording attachments', () => {
      const attachment = { type: 'file', localMetadata: { id: 'test-id' } };
      expect(isLocalVoiceRecordingAttachment(attachment)).toBe(false);
    });
  });

  describe('isVideoAttachment', () => {
    it('should return true for attachments with type "video"', () => {
      const attachment = { type: 'video' };
      expect(isVideoAttachment(attachment)).toBe(true);
    });

    it('should return true for attachments with mime_type in supportedVideoFormat', () => {
      const attachment = { mime_type: 'video/mp4' };
      expect(isVideoAttachment(attachment, ['video/mp4'])).toBe(true);
    });

    it('should return false for attachments with mime_type not in supportedVideoFormat', () => {
      const attachment = { mime_type: 'application/pdf' };
      expect(isVideoAttachment(attachment, ['video/mp4'])).toBe(false);
    });
  });

  describe('isLocalVideoAttachment', () => {
    it('should return true for local video attachments', () => {
      const attachment = { type: 'video', localMetadata: { id: 'test-id' } };
      expect(isLocalVideoAttachment(attachment)).toBe(true);
    });

    it('should return false for non-local video attachments', () => {
      const attachment = { type: 'video' };
      expect(isLocalVideoAttachment(attachment)).toBe(false);
    });

    it('should return false for local non-video attachments', () => {
      const attachment = { type: 'file', localMetadata: { id: 'test-id' } };
      expect(isLocalVideoAttachment(attachment)).toBe(false);
    });
  });
});
