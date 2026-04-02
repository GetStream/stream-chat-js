import { describe, expect, it } from 'vitest';
import {
  getPendingTaskChannelData,
  isAttachmentReplayable,
  isLocalUrl,
  isMessageUpdateReplayable,
} from '../../../src/offline-support/util';

describe('offline-support util', () => {
  describe('isLocalUrl', () => {
    it.each([
      [undefined, false],
      ['', false],
      ['https://example.com/image.jpg', false],
      ['http://example.com/image.jpg', false],
      ['file://local-image.jpg', true],
      ['content://local-image.jpg', true],
    ])('returns %s => %s', (value, expected) => {
      expect(isLocalUrl(value)).toBe(expected);
    });
  });

  describe('isAttachmentReplayable', () => {
    it('treats missing attachments as replayable', () => {
      expect(isAttachmentReplayable(undefined as never)).toBe(true);
    });

    it.each([
      [{ asset_url: 'https://example.com/file.pdf' }, true],
      [{ image_url: 'https://example.com/image.jpg' }, true],
      [
        {
          asset_url: 'https://example.com/file.pdf',
          image_url: 'https://example.com/image.jpg',
        },
        true,
      ],
      [{ asset_url: 'file://local-file.pdf' }, false],
      [{ image_url: 'file://local-image.jpg' }, false],
      [
        {
          asset_url: 'https://example.com/file.pdf',
          image_url: 'file://local-image.jpg',
        },
        false,
      ],
      [
        {
          asset_url: 'file://local-file.pdf',
          image_url: 'https://example.com/image.jpg',
        },
        false,
      ],
      [{}, true],
    ])('returns %s => %s', (attachment, expected) => {
      expect(isAttachmentReplayable(attachment as never)).toBe(expected);
    });
  });

  describe('isMessageUpdateReplayable', () => {
    it('returns true when the message has no attachments', () => {
      expect(isMessageUpdateReplayable({ id: 'msg-1' })).toBe(true);
    });

    it('returns true when all attachments are replayable', () => {
      expect(
        isMessageUpdateReplayable({
          id: 'msg-1',
          attachments: [
            { asset_url: 'https://example.com/file.pdf' },
            { image_url: 'https://example.com/image.jpg' },
          ],
        }),
      ).toBe(true);
    });

    it('returns false when any attachment is not replayable', () => {
      expect(
        isMessageUpdateReplayable({
          id: 'msg-1',
          attachments: [
            { asset_url: 'https://example.com/file.pdf' },
            { image_url: 'file://local-image.jpg' },
          ],
        }),
      ).toBe(false);
    });
  });

  describe('getPendingTaskChannelData', () => {
    it.each([
      [undefined, {}],
      ['', {}],
      ['invalid-cid', {}],
      [':channel-123', {}],
      ['messaging:', {}],
      ['messaging:channel-123', { channelId: 'channel-123', channelType: 'messaging' }],
    ])('returns %s => %j', (cid, expected) => {
      expect(getPendingTaskChannelData(cid)).toEqual(expected);
    });
  });
});
