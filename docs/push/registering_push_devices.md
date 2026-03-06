Once your app has enabled the push notifications, you can use the APIs to register user devices such as iPhones and Android phones.

> [!NOTE]
> Each chat user has a limit of  **25**  unique devices. Once this limit is reached, the oldest device will be removed and replaced by the new device.


### Device Parameters

| name               | type    | description                                                                      | default | optional |
| ------------------ | ------- | -------------------------------------------------------------------------------- | ------- | -------- |
| user_id            | string  | The user ID for this device                                                      | -       |          |
| id                 | string  | The device ID.                                                                   | -       |          |
| push_provider      | string  | The push provider for this device. Either APN, Firebase, Huawei, or Xiaomi.      | -       |          |
| disabled           | boolean | Set if the device is disabled                                                    | -       | ✓        |
| disabled_reason    | string  | Explanation if the device is disabled                                            | -       | ✓        |
| push_provider_name | string  | The push provider name for this device if a multi-bundle configuration is added. | -       | ✓        |

### Register a Device

Registering a device associates it with a user and tells the push provider to send new message notifications to the device.

> [!NOTE]
> Register the user's device for remote push notifications once your user is successfully connected to Chat.


> [!NOTE]
> Multi-bundle configurations require that you specify a push_provider_name when registering a device that corresponds to the name of the push configuration that you've set up in the dashboard or via the API.


```js
const id = "2ffca4ad6599adc9b5202d15a5286d33c19547d472cd09de44219cda5ac30207";
const push_provider = "apn";
const user_id = "Taquito";

await client.addDevice(id, push_provider, user_id);

// if multi providers
await client.addDevice(id, push_provider, user_id, push_provider_name);
```

### Unregister a Device

Unregistering a device removes the device from the user and stops further new message notifications.

```js
const id = "2ffca4ad6599adc9b5202d15a5286d33c19547d472cd09de44219cda5ac30207";
const user_id = "Taquito";

await chatClient.removeDevice(id, user_id);
```

### List Devices

Provides a list of all devices associated with a user.

```js
const user_id = "Taquito";

await chatClient.getDevices(user_id);
```
