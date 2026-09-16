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

  describe('invalidate', () => {
    it('drops a known id so nothing is sent against the dead socket', () => {
      manager.resolveConnectionId('id-1');

      manager.invalidate();

      expect(manager.connectionId).to.be.undefined;
    });

    // Dropping without arming would leave nothing to await, and `getConnectionId` would report
    // "nothing is being opened" for a socket that is in fact about to be retried.
    it('arms in the same step, so a request waits for the reconnect instead of rejecting', async () => {
      manager.resolveConnectionId('id-1');

      manager.invalidate();

      expect(manager.loadConnectionIdPromise).to.be.instanceOf(Promise);
      const waiter = manager.getConnectionId();
      manager.resolveConnectionId('id-2');
      await expect(waiter).resolves.to.equal('id-2');
    });

    it('is a no-op when there was no id to drop', () => {
      manager.invalidate();

      expect(manager.loadConnectionIdPromise).to.be.undefined;
      expect(() => manager.getConnectionId()).to.throw('No connection id is available');
    });

    it('leaves a pending waiter alone - the retry it is waiting for is still coming', async () => {
      manager.arm();
      const waiter = manager.getConnectionId();

      manager.invalidate();

      expect(manager.loadConnectionIdPromise).to.be.instanceOf(Promise);
      manager.resolveConnectionId('id-2');
      await expect(waiter).resolves.to.equal('id-2');
    });

    it('leaves the connection attempt free to arm again, which an id would have blocked', async () => {
      manager.resolveConnectionId('id-1');

      manager.invalidate();
      // `_connect()` arms too; it must find the deferred invalidate left and not replace it
      const armed = manager.loadConnectionIdPromise;
      manager.arm();

      expect(manager.loadConnectionIdPromise).to.equal(armed);
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
        'The WebSocket connection was closed before a connection id could be resolved.',
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
