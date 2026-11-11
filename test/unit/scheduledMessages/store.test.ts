import { describe, expect, it } from 'vitest';
import {
  isRemovedScheduledMessage,
  ScheduledMessageResponse,
  shouldReplaceScheduledMessage,
  StreamChat,
} from '../../../src';
import { getClientWithUser } from '../test-utils/getClient';
import { msToNs } from '../../../src/utils/time';

const at = (second: number) => msToNs(Date.UTC(2030, 0, 1, 0, 0, second));

const generateScheduledMessage = (
  data: Partial<ScheduledMessageResponse> = {},
): ScheduledMessageResponse =>
  ({
    cid: 'messaging:general',
    created_at: at(0),
    id: 'sm-1',
    message: { text: 'see you tomorrow' },
    scheduled_at: at(60),
    status: 'scheduled',
    updated_at: at(0),
    user: { id: 'user1' },
    ...data,
  }) as ScheduledMessageResponse;

describe('scheduled message store', () => {
  describe('isRemovedScheduledMessage', () => {
    it.each([
      ['sent', true],
      ['canceled', true],
      ['scheduled', false],
      ['sending', false],
      ['failed', false],
    ] as const)('is %s removed: %s', (status, removed) => {
      expect(isRemovedScheduledMessage(generateScheduledMessage({ status }))).toBe(
        removed,
      );
    });
  });

  describe('shouldReplaceScheduledMessage', () => {
    it('replaces with the copy with the later updated_at only', () => {
      const older = generateScheduledMessage({ updated_at: at(1) });
      const newer = generateScheduledMessage({ updated_at: at(2) });

      expect(shouldReplaceScheduledMessage(newer, older)).toBe(true);
      expect(shouldReplaceScheduledMessage(older, newer)).toBe(false);
    });

    it('replaces on a tie', () => {
      const stored = generateScheduledMessage();
      const incoming = generateScheduledMessage({ status: 'sending' });

      expect(shouldReplaceScheduledMessage(incoming, stored)).toBe(true);
    });

    it('replaces with a cancel, which is newer', () => {
      const scheduled = generateScheduledMessage({ updated_at: at(1) });
      const canceled = generateScheduledMessage({
        status: 'canceled',
        updated_at: at(2),
      });

      expect(shouldReplaceScheduledMessage(canceled, scheduled)).toBe(true);
    });

    it('keeps a cancel over a stale copy read before it', () => {
      const canceled = generateScheduledMessage({
        status: 'canceled',
        updated_at: at(2),
      });
      const stale = generateScheduledMessage({ updated_at: at(1) });

      expect(shouldReplaceScheduledMessage(stale, canceled)).toBe(false);
    });

    it('replaces a cancel with the message scheduled again under the same ID', () => {
      const canceled = generateScheduledMessage({
        status: 'canceled',
        updated_at: at(2),
      });
      const scheduledAgain = generateScheduledMessage({ updated_at: at(3) });

      expect(shouldReplaceScheduledMessage(scheduledAgain, canceled)).toBe(true);
    });

    it('removes a deleted failed message, whose removal ties with it', () => {
      const failed = generateScheduledMessage({ status: 'failed', updated_at: at(2) });
      const deleted = { ...failed, status: 'canceled' as const };

      expect(shouldReplaceScheduledMessage(deleted, failed)).toBe(true);
      expect(shouldReplaceScheduledMessage(failed, deleted)).toBe(false);
    });

    it('never replaces a sent copy, and a sent copy replaces anything', () => {
      const sent = generateScheduledMessage({ status: 'sent', updated_at: at(1) });
      const lateEdit = generateScheduledMessage({ updated_at: at(9) });

      expect(shouldReplaceScheduledMessage(sent, lateEdit)).toBe(true);
      expect(shouldReplaceScheduledMessage(lateEdit, sent)).toBe(false);
    });
  });

  describe('client.scheduledMessageStore', () => {
    const createStore = () =>
      (getClientWithUser({ id: 'user1' }) as StreamChat).scheduledMessageStore;

    it('does not bring back a sent message, whatever updated_at says', () => {
      const store = createStore();
      const sent = generateScheduledMessage({ status: 'sent', updated_at: at(1) });
      store.resolveCanonicalEntity(sent);

      expect(
        store.resolveCanonicalEntity(generateScheduledMessage({ updated_at: at(9) })),
      ).toBe(sent);
    });

    it('drops an entry once no list holds it', () => {
      const store = createStore();
      const holder = { onEntitiesChanged: () => undefined };
      store.link('sm-1', holder);
      store.upsert(generateScheduledMessage());

      store.unlink('sm-1', holder);

      expect(store.has('sm-1')).toBe(false);
    });
  });
});
