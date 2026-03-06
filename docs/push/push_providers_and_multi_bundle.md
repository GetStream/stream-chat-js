## Push Provider

A push provider is a configuration of a push API with one of four different types: APN, Firebase, Huawei and Xiaomi at the moment.

Multiple providers can be added to the same Stream application to support, for example:

- Multi-tenancy: there can be different builds of the same application such as prod vs staging, regular vs admin, etc.

- Multi-platform: there can be specific customizations for different target platforms such as starting React Native and adapting native Android/iOS SDKs along the way.

> [!NOTE]
> Following endpoints, management of push providers only works if your app is upgraded to v2 or v3. Otherwise, the update app settings endpoint must be used for a single provider config per type (APN, Firebase, Huawei, Xiaomi).


### Upsert a Push Provider

In the same endpoint, a new config can be created or updated.

> [!WARNING]
> Up to 25 push providers can be added to a single application.


> [!NOTE]
> If the authentication information is updated, linked devices might be invalidated in the next push message sent retry.


```js
const pushProviderConfig = {
  name: "my-custom-name",
  type: "firebase",
  firebase_credentials: "my-service-account-information",
};

client.upsertPushProvider(pushProviderConfig);
```

### List Push Providers

```js
client.listPushProviders();
```

### Delete a Push Provider

```js
const pushProviderID = {
  type: "apn or firebase or huawei or xiaomi",
  name: "your given custom name while creating",
};

client.deletePushProvider(pushProviderID);
```

### Push Providers & Devices

By default, adding a device doesn't require a push provider linking due to backward compatibility where old configurations don't have a `name` , so their names are empty.

- If the configuration name is not provided when adding a device, devices will be matched with configurations according to only their types.

- If the configuration name is provided, but invalid, the request will fail with a bad request error.

When devices are added, they can be linked to a provider to inherit their configuration.

```js
const pushToken = "your client side generated device token to receive pushes";
const pushProviderType = "apn or firebase or huawei or xiaomi";
const userId = "your user id for server side calls";
const pushProviderName =
  "the name of the provider you created while configuring your app";

client.addDevice(pushToken, pushProviderType, userId, pushProviderName);
```

## Updating non-multi bundle configs (nameless)

If you're not interested in multi-bundle support, you can leverage `updateAppSettings` endpoint to add push configuration for a single APN, Firebase, Huawei or Xiaomi provider.

```js
// this configuration is same with upsert push provider
// except type is inherent and naming is missing so it's set to empty string
const firebase_config = {
  credentials_json: "my-service-account-information",
};

client.updateAppSettings({ firebase_config });
```
