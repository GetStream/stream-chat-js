import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { StreamChat } from '../../../../../../src';
import {
  disconnectClients,
  getClientSideClient,
  getServerClient,
} from '../../../../helpers/clients';
import { Cleanup } from '../../../../helpers/cleanup';
import { uniqueId } from '../../../../helpers/ids';

const DOCS = 'chat/javascript/06-state/12-notifications.md';

describe(DOCS, () => {
  const serverClient = getServerClient();
  const cleanup = new Cleanup(serverClient);
  const userId = uniqueId('user');
  let client: StreamChat;

  beforeAll(async () => {
    cleanup.users.push(userId);
    client = await getClientSideClient({ id: userId });
  });

  afterAll(async () => {
    await disconnectClients(client);
    await cleanup.run();
  });

  it('reads notifications', () => {
    client.notifications.addError({
      message: 'Upload failed',
      origin: { emitter: 'test' },
    });

    // #region snippet docs="chat/javascript/06-state/12-notifications.md" heading="Reading" tab="JavaScript" index=1
    const { notifications } = client.notifications.store.getLatestValue();

    // Filtered by severity
    const errors = client.notifications.error;
    // #endregion snippet

    expect(notifications.map((n) => n.message)).toEqual(['Upload failed']);
    expect(errors.map((n) => n.message)).toEqual(['Upload failed']);
    client.notifications.clear();
  });

  it('subscribes, adds and removes notifications', () => {
    const renderToasts = vi.fn();

    // #region snippet docs="chat/javascript/06-state/12-notifications.md" heading="Reading" tab="JavaScript" index=2
    const unsubscribe = client.notifications.store.subscribeWithSelector(
      (state) => ({ notifications: state.notifications }),
      ({ notifications }) => renderToasts(notifications),
    );
    // #endregion snippet

    try {
      expect(renderToasts).toHaveBeenLastCalledWith([]);

      // #region snippet docs="chat/javascript/06-state/12-notifications.md" heading="Add and dismiss notifications" tab="JavaScript" index=1
      const notificationId = client.notifications.addSuccess({
        message: 'Settings saved',
        origin: { emitter: 'SettingsPage' },
      });

      client.notifications.remove(notificationId);
      // #endregion snippet

      expect(renderToasts).toHaveBeenCalledWith([
        expect.objectContaining({
          id: notificationId,
          message: 'Settings saved',
          severity: 'success',
        }),
      ]);
      expect(renderToasts).toHaveBeenLastCalledWith([]);
    } finally {
      unsubscribe();
    }
  });
});
