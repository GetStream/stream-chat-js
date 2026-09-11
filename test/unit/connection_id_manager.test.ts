import { beforeEach, describe, expect, it } from 'vitest';

import { ConnectionIdManager } from '../../src/connection_id_manager';

describe('ConnectionIdManager', () => {
  let manager: ConnectionIdManager;

  beforeEach(() => {
    manager = new ConnectionIdManager();
  });

  describe('getConnectionId', () => {
    it('throws when there is no id and no attempt in flight', () => {
      expect(() => manager.getConnectionId()).to.throw('No connection id is available');
    });

    it('returns a known id synchronously, without a promise to await', () => {
      manager.resolveConnectionId('id-1');

      expect(manager.getConnectionId()).to.equal('id-1');
    });

    it('returns the pending deferred while an attempt is in flight', async () => {
      manager.arm();

      const pending = manager.getConnectionId();
      expect(pending).to.be.instanceOf(Promise);

      manager.resolveConnectionId('id-1');

      await expect(pending).resolves.to.equal('id-1');
    });

    it('releases every waiter that queued up during the handshake', async () => {
      manager.arm();

      const waiters = [
        manager.getConnectionId(),
        manager.getConnectionId(),
        manager.getConnectionId(),
      ];
      manager.resolveConnectionId('id-1');

      expect(await Promise.all(waiters)).to.eql(['id-1', 'id-1', 'id-1']);
    });

    it('throws again once a failed attempt has settled', async () => {
      manager.arm();
      const pending = manager.getConnectionId();
      const failure = new Error('connect failed');

      manager.rejectConnectionId(failure);

      await expect(pending).rejects.toThrow('connect failed');
      // the deferred is spent - a later caller gets the actionable error, not a dead promise
      expect(() => manager.getConnectionId()).to.throw('No connection id is available');
    });
  });

  describe('arm', () => {
    it('creates a deferred when there is neither an id nor one pending', () => {
      manager.arm();

      expect(manager.loadConnectionIdPromise).to.be.instanceOf(Promise);
    });

    it('is a no-op while a deferred is already pending, so waiters are not orphaned', async () => {
      manager.arm();
      const first = manager.loadConnectionIdPromise;
      const waiter = manager.getConnectionId();

      manager.arm();

      expect(manager.loadConnectionIdPromise).to.equal(first);

      manager.resolveConnectionId('id-1');
      await expect(waiter).resolves.to.equal('id-1');
    });

    it('is a no-op while an id is known, so a reconnect keeps serving it', () => {
      manager.resolveConnectionId('id-1');

      manager.arm();

      expect(manager.loadConnectionIdPromise).to.be.undefined;
      // requests issued during the outage go out against the old id rather than blocking
      expect(manager.getConnectionId()).to.equal('id-1');
    });
  });

  describe('resolveConnectionId', () => {
    it('replaces a previously known id', () => {
      manager.resolveConnectionId('id-1');

      manager.resolveConnectionId('id-2');

      expect(manager.connectionId).to.equal('id-2');
    });

    it('clears the deferred so the next attempt can arm a fresh one', () => {
      manager.arm();

      manager.resolveConnectionId('id-1');

      expect(manager.loadConnectionIdPromise).to.be.undefined;
    });
  });

  describe('reset', () => {
    it('drops a known id', () => {
      manager.resolveConnectionId('id-1');

      manager.reset();

      expect(manager.connectionId).to.be.undefined;
      expect(() => manager.getConnectionId()).to.throw('No connection id is available');
    });

    it('fails anything still waiting rather than letting it hang', async () => {
      manager.arm();
      const waiter = manager.getConnectionId();

      manager.reset();

      await expect(waiter).rejects.toThrow(
        'The connection was closed before a connection id could be resolved.',
      );
    });

    it('re-arms cleanly afterwards', async () => {
      manager.resolveConnectionId('id-1');
      manager.reset();

      manager.arm();
      const waiter = manager.getConnectionId();
      manager.resolveConnectionId('id-2');

      await expect(waiter).resolves.to.equal('id-2');
    });
  });

  it('does not raise an unhandled rejection for a deferred nobody awaited', async () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (event: PromiseRejectionEvent) => unhandled.push(event.reason);
    process.on('unhandledRejection', onUnhandled);

    try {
      manager.arm();
      manager.rejectConnectionId(new Error('connect failed'));
      // let the microtask queue drain, which is when an unhandled rejection would surface
      await new Promise((resolve) => setTimeout(resolve, 0));
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }

    expect(unhandled).to.eql([]);
  });
});
