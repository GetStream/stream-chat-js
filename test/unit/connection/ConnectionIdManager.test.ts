import { beforeEach, describe, expect, it } from 'vitest';
import { ConnectionIdManager } from '../../../src/connection';

describe('ConnectionIdManager', () => {
  let manager: ConnectionIdManager;

  beforeEach(() => {
    manager = new ConnectionIdManager();
  });

  it('throws when no socket is open and none is being opened', () => {
    // No amount of waiting would produce an id, so the error says what to do about it instead of
    // hanging the caller.
    expect(() => manager.getConnectionId()).toThrow(/No connection id is available/);
  });

  it('hands back an id it already holds without waiting', () => {
    manager.resolveConnectionId('id-1');

    expect(manager.getConnectionId()).toBe('id-1');
  });

  it('resolves waiters once the handshake answers', async () => {
    manager.arm();
    const waiting = manager.getConnectionId();
    manager.resolveConnectionId('id-2');

    await expect(waiting).resolves.toBe('id-2');
  });

  it('keeps waiters waiting across a drop, rather than failing them', async () => {
    // A socket that dropped will be retried, so the request should ride the reconnect out.
    manager.resolveConnectionId('dead');
    manager.invalidate();

    const waiting = manager.getConnectionId();
    expect(manager.connectionId).toBeUndefined();

    manager.resolveConnectionId('fresh');
    await expect(waiting).resolves.toBe('fresh');
  });

  it('fails waiters when the connection is closed deliberately', async () => {
    manager.arm();
    const waiting = manager.getConnectionId();

    manager.reset();

    await expect(waiting).rejects.toThrow(
      /closed before a connection id could be resolved/,
    );
  });

  it('abandons a wait when the caller aborts, with their own reason', async () => {
    manager.arm();
    const controller = new AbortController();
    const reason = new Error('the search moved on');
    const waiting = manager.getConnectionId(controller.signal);

    controller.abort(reason);

    await expect(waiting).rejects.toBe(reason);
  });

  it('rejects at once for a signal that was already aborted', async () => {
    manager.arm();

    await expect(
      manager.getConnectionId(AbortSignal.abort(new Error('gone'))),
    ).rejects.toThrow('gone');
  });

  it('leaves other waiters alone when one aborts', async () => {
    manager.arm();
    const controller = new AbortController();
    const abandoned = manager.getConnectionId(controller.signal);
    const patient = manager.getConnectionId();

    controller.abort();
    manager.resolveConnectionId('id-3');

    await expect(abandoned).rejects.toThrow();
    await expect(patient).resolves.toBe('id-3');
  });
});
