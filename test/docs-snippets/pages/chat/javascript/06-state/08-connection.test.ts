import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { StreamChat } from '../../../../../../src';
import {
  disconnectClients,
  getClientSideClient,
  getServerClient,
} from '../../../../helpers/clients';
import { Cleanup } from '../../../../helpers/cleanup';
import { uniqueId } from '../../../../helpers/ids';
import { retry } from '../../../../helpers/wait';

const DOCS = 'chat/javascript/06-state/08-connection.md';

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

  it('reads the network and socket status', () => {
    // #region snippet docs="chat/javascript/06-state/08-connection.md" heading="Reading" tab="JavaScript" index=1
    // "You're offline": `undefined` means unknown, so check `=== false`
    const { isOnline } = client.networkConnection.state.getLatestValue();
    const isOffline = isOnline === false;

    // "Reconnecting…"
    const { isHealthy } = client.wsConnection.state.getLatestValue();
    // #endregion snippet

    expect(isOffline).toBe(false);
    expect(isHealthy).toBe(true);
  });

  it('subscribes to the network and socket status', async () => {
    const renderOfflineBanner = vi.fn();
    const renderReconnecting = vi.fn();

    // #region snippet docs="chat/javascript/06-state/08-connection.md" heading="Reading" tab="JavaScript" index=2
    const unsubscribeNetwork = client.networkConnection.state.subscribeWithSelector(
      (state) => ({ isOnline: state.isOnline }),
      ({ isOnline }) => renderOfflineBanner(isOnline === false),
    );

    const unsubscribeSocket = client.wsConnection.state.subscribeWithSelector(
      (state) => ({ isHealthy: state.isHealthy }),
      ({ isHealthy }) => renderReconnecting(!isHealthy),
    );
    // #endregion snippet

    try {
      expect(renderOfflineBanner).toHaveBeenLastCalledWith(false);
      expect(renderReconnecting).toHaveBeenLastCalledWith(false);

      // A dropped socket shows "Reconnecting…", a new one hides it again
      await client.closeConnection();
      expect(renderReconnecting).toHaveBeenLastCalledWith(true);
      await client.openConnection();
      await retry(() => {
        expect(renderReconnecting).toHaveBeenLastCalledWith(false);
        return Promise.resolve();
      });
    } finally {
      unsubscribeNetwork();
      unsubscribeSocket();
    }
  });

  it('runs app refreshes after recovery', async () => {
    const refreshAppData = vi.fn();
    const onSpy = vi.spyOn(client, 'on');

    // #region snippet docs="chat/javascript/06-state/08-connection.md" heading="After a reconnect" tab="JavaScript" index=1
    client.on('connection.recovered', () => {
      refreshAppData();
    });
    // #endregion snippet

    try {
      expect(refreshAppData).not.toHaveBeenCalled();
      await client.closeConnection();
      await client.openConnection();
      await retry(() => {
        expect(refreshAppData).toHaveBeenCalledTimes(1);
        return Promise.resolve();
      });
    } finally {
      onSpy.mock.results.forEach(({ value }) => value.unsubscribe());
      onSpy.mockRestore();
    }
  });

  it('registers a network status reporter', async () => {
    // A dummy platform network API
    let online = true;
    const listeners = new Set<(isOnline: boolean) => void>();
    const removeListener = vi.fn();
    const myCustomNetworkMonitor = {
      isOnline: () => online,
      addListener: (listener: (isOnline: boolean) => void) => {
        listeners.add(listener);
        return () => {
          removeListener();
          listeners.delete(listener);
        };
      },
    };
    const setOnline = (value: boolean) => {
      online = value;
      listeners.forEach((listener) => listener(value));
    };

    // #region snippet docs="chat/javascript/06-state/08-connection.md" heading="Network status reporter" tab="JavaScript" index=1
    client.networkConnection.setStatusReporter((onStatusChange) => {
      // Report the current status right away, then on every change
      onStatusChange(myCustomNetworkMonitor.isOnline());

      // Return the function that removes the listener
      return myCustomNetworkMonitor.addListener((isOnline) => onStatusChange(isOnline));
    });
    // #endregion snippet

    try {
      expect(client.networkConnection.state.getLatestValue().isOnline).toBe(true);

      // The device goes offline: the socket closes right away
      setOnline(false);
      expect(client.networkConnection.state.getLatestValue().isOnline).toBe(false);
      expect(client.wsConnection.state.getLatestValue().isHealthy).toBe(false);

      // Back online: the socket reconnects
      setOnline(true);
      expect(client.networkConnection.state.getLatestValue().isOnline).toBe(true);
      await retry(() => {
        expect(client.wsConnection.state.getLatestValue().isHealthy).toBe(true);
        return Promise.resolve();
      });
    } finally {
      // Replacing the reporter removes the listener
      client.networkConnection.setStatusReporter(null);
      expect(removeListener).toHaveBeenCalledTimes(1);
    }
  });
});
