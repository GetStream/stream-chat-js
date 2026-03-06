This page covers the legacy versions of push notifications v1 and v2.

> [!NOTE]
> Version 1 of push notifications is using Firebase's legacy FCM APIs. These APIs are no longer supported by Firebase. In order for your app to be able to send push notifications, it is mandatory to upgrade to version 3.


- v1 has a template-based customization system that requires users to learn the details of this template system.

- v2 has a common message payload where SDKs automatically enrich messages and channels at runtime. They then call the callback with this data, providing a familiar programming environment where any customization is possible.

## Templates in v2

In **v2**, template functionality is partially dropped to simplify configurations:

1. Standard template, there is nothing to configure

2. By default, data payload size is limited to 4KB. Data is enriched automatically

3. Offline storage is synced under the hood for more performant experience

4. Templates have a steep learning curve and are hard to use and they have their own quirks such as a lack of advanced programming constructs

SDKs receive a standard payload and enrich it by calling API and syncing their storage then they pass data to the user to be used in their familiar environment.

It works well for native platforms but has some deficiencies for non-native SDKs such as React Native and Flutter. In this case, a limited version of templating is supported because the app isn't woken up to process notifications if it has been killed by OS or user.

### Default Firebase APN template

Following is the default template if you leave **apn_template** or **firebase_apn_template** empty. To see definition of available fields that can be included in `aps` object please see [Apple documentation](https://developer.apple.com/documentation/usernotifications/setting_up_a_remote_notification_server/generating_a_remote_notification#2943360).

```js
{
	"aps": {
		"alert": {
			"title": "New message from {{ sender.name }}",
			"body": "{{ truncate message.text 150 }}"
		},
		"mutable-content": 1,
		"category": "stream.chat"
	},
	"stream": {
        "sender": "stream.chat",
        "type": "message.new",
        "version": "v2",
        "id": "{{ message.id }}",
        "cid": "{{ channel.cid }}"
	}
}
```

### Updating Firebase APN template

```js
// for multi-bundle support
const pushProviderConfig = {
  name: "my-name",
  type: "firebase",
  firebase_credentials: "your service worker config",
  firebase_apn_template: "your-template",
};

client.upsertPushProvider(pushProviderConfig);

// for non-multi-bundle support
const firebase_config = {
  credentials_json: "your service worker config",
  apn_template: "your template",
};

client.updateAppSettings({ firebase_config });
```

### Default Firebase Notification template

By default, there is only a data message and no notification in the payload.

If a template is set, then the template will be processed and put into the notification key in the payload. To see available fields and their description please follow [FCM documentation](https://firebase.google.com/docs/reference/fcm/rest/v1/projects.messages#AndroidNotification).

Following is a sample template for an example:

```js
{
  "title": "{{ sender.name }} @ {{ channel.name }}",
  "body": "{{ truncate message.text 150 }}",
  "click_action": "OPEN_ACTIVITY_1",
  "sound": "default"
}
```

### Updating Firebase Notification template

```js
// for multi-bundle support
const pushProviderConfig = {
  name: "my-name",
  type: "firebase",
  firebase_credentials: "your service worker config",
  firebase_notification_template: "your-template",
};

client.upsertPushProvider(pushProviderConfig);

// for non-multi-bundle support
const firebase_config = {
  credentials_json: "your service worker config",
  notification_template: "your template",
};

client.updateAppSettings({ firebase_config });
```
