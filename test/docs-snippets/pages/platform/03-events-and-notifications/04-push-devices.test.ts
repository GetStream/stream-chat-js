import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { StreamChat } from '../../../../../src';
import {
  disconnectClients,
  getClientSideClient,
  getServerClient,
} from '../../../helpers/clients';
import { Cleanup } from '../../../helpers/cleanup';
import { uniqueId } from '../../../helpers/ids';

// Devices are registered on a Firebase push provider of the test app, named by
// STREAM_PUSH_PROVIDER_NAME (.env). Named providers make the app a multi-bundle config, so
// `addDevice` needs the name: without it, code 4 'push provider "" with type "firebase" not found'.
const PROVIDER = 'firebase';
const PROVIDER_NAME = process.env.STREAM_PUSH_PROVIDER_NAME;
/** Appended to the names of the tests that need a provider, so a skip says why. */
const needsProvider = PROVIDER_NAME
  ? ''
  : ' (skipped: STREAM_PUSH_PROVIDER_NAME is not set, see .env.example)';

describe('platform/03-events-and-notifications/04-push-devices.md', () => {
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

  it.skip('BLOCKED: registers a device (the first call is for single-provider apps; the test app is multi-bundle, so it needs push_provider_name)', async () => {
    const push_provider_name = PROVIDER_NAME;
    // #region snippet docs="platform/03-events-and-notifications/04-push-devices.md" heading="Registering from the chat client SDKs" tab="JavaScript" index=1
    const id = '2ffca4ad6599adc9b5202d15a5286d33c19547d472cd09de44219cda5ac30207';
    const push_provider = 'apn';

    // registers the device for the connected user
    await client.addDevice(id, push_provider);

    // if multi providers
    await client.addDevice(id, push_provider, undefined, push_provider_name);
    // #endregion snippet

    const { devices } = await client.getDevices();
    expect(devices?.map((device) => device.id)).toContain(id);
  });

  it.skipIf(!PROVIDER_NAME)(
    `lists the devices of the connected user${needsProvider}`,
    async () => {
      const deviceId = uniqueId('device');
      await client.addDevice(deviceId, PROVIDER, undefined, PROVIDER_NAME);

      // #region snippet docs="platform/03-events-and-notifications/04-push-devices.md" heading="Listing from the chat client SDKs" tab="JavaScript" index=1
      // lists the devices of the connected user
      const { devices } = await client.getDevices();
      // #endregion snippet

      expect(devices).toEqual([
        expect.objectContaining({
          id: deviceId,
          push_provider: PROVIDER,
          push_provider_name: PROVIDER_NAME,
          user_id: userId,
        }),
      ]);
      await client.removeDevice(deviceId);
    },
  );

  it.skipIf(!PROVIDER_NAME)(`removes a device${needsProvider}`, async () => {
    await client.addDevice(
      '2ffca4ad6599adc9b5202d15a5286d33c19547d472cd09de44219cda5ac30207',
      PROVIDER,
      undefined,
      PROVIDER_NAME,
    );
    expect((await client.getDevices()).devices).toHaveLength(1);

    // #region snippet docs="platform/03-events-and-notifications/04-push-devices.md" heading="Removing from the chat client SDKs" tab="JavaScript" index=1
    const id = '2ffca4ad6599adc9b5202d15a5286d33c19547d472cd09de44219cda5ac30207';

    // removes the device from the connected user
    await client.removeDevice(id);
    // #endregion snippet

    const { devices } = await client.getDevices();
    expect(devices).toEqual([]);
  });
});
