Stream Chat supports push notifications through Firebase Cloud Messaging, Apple Push Notification (APN), Huawei Push and Xiaomi Push.

- Push notifications can be sent for new messages, message edits and reactions. You can use [Webhooks](/chat/docs/node/webhooks_overview/) to send push notifications on other types of events.

- Supports customization of push payloads, including the ability to add custom data. But you don't have to configure it as it comes with well-designed default templates.

- Supports enabling/disabling push notifications for each notification type, such as new messages, message edits, reactions. By default, all notification types are disabled.

- A common message payload where SDKs automatically enrich messages and channels in the runtime and call the callback with these data where it's a familiar way of building by programming and any customization is possible.

- Multi bundle support for push providers.

- Multi-tenancy and continuous delivery are covered in a single Stream app.

- Customization in multiple levels; _app, provider, channel type, user._

- **No channel member count limitation**

## Setting up Push

Push is available to Stream Chat integrations running in a mobile environment.

Depending on which Stream Chat SDK you are using, the process for setting up push notifications will be slightly different. Follow the guide for your chosen SDK:

- [React Native](/chat/docs/sdk/react-native/guides/push-notifications/)

- [Flutter](/chat/docs/sdk/flutter/guides/push-notifications/adding_push_notifications_v2/)

- [Android](/chat/docs/sdk/android/client/guides/push-notifications/)

- [iOS](/chat/docs/sdk/ios/client/push-notifications/)

## Push Delivery Rules

Push message delivery behaves according to these rules:

- Push notifications can be configured for new messages, message edits, message reactions and more.
- Only channel members receive a push notification.
- Members receive push notifications regardless of their online status.
- Replies inside a [thread](/chat/docs/node/threads/) are only sent to users that are part of that thread:
  - They posted at least one message.
  - They were mentioned.
- Push from muted users are not sent.
- Push [preferences](/chat/docs/node/push_preferences/) for a user are respected:
  - Preferences at user level are "all", "none" or "mentions".
  - Preferences at channel level are "all", "none" or "mentions".
- Push for a [private message](/chat/docs/node/private_messaging/) are sent only to the restricted users of the message.
- Push notification are sent to all registered devices for a user (up to 25) .
- `skip_push` is marked as `false` , as described [here](/chat/docs/node/send_message/).
- `push_notifications` is enabled (default) on the channel type for message is sent.

> [!WARNING]
> Push notifications require membership. Watching a channel isn't enough.


## Handling Push Notifications on the Foreground

Both iOS and Android discard push notifications when your application is on the foreground.

You can configure this on your application and decide what to do when a push notification is received while the app is on the foreground.


## Push Notification Payload

Push notifications are delivered as data payloads that the SDK can use to convert into the same data types that are received when working with the APIs.

When a message received by the Chat API, according to the delivery rules, it kicks a job that sends a regular data message (as below) to configured push providers on your app. According to the battery and the online status of the device, push providers deliver this payload to the actual devices. When a device receives the payload, it's passed to the SDK which connects to Chat API to receive regular message and channel records and unmarshals them into in-memory objects and gives control to you by passing these objects. At this point, your application can use these objects to generate any push notification to be shown to the user.

This is the main payload which will be sent to each configured provider:

> [!NOTE]
> The version field in the data payload is set to **v2**. It is to ensure backward compatibility with the existing SDKs.


```json
{
  "sender": "stream.chat",
  "type": "message.new",
  "version": "v2",
  "message_id": "d152f6c1-8c8c-476d-bfd6-59c15c20548a",
  "id": "d152f6c1-8c8c-476d-bfd6-59c15c20548a",
  "channel_type": "messaging",
  "channel_id": "company-chat",
  "cid": "messaging:company-chat"
}
```

On both Android and iOS the SDK will convert the payload in channel and message types and allow you to customize the notification message.

You can find more details, examples and guides on specific use-cases on the specific SDK docs.

## Push Notification Configuration

### Firebase

- Requires a service worker account from your FCM project.

  **Firebase console → project settings (top left)  → service accounts (4th sub header) → generate a new private key**

Export your key and upload in the firebase credentials field in dashboard. A sample content:

```json
{
  "type": "service_account",
  "project_id": "chat",
  "private_key_id": "<your-private-key-id>",
  "private_key": "<your-private-key>",
  "client_email": "<your-service-account>@<project>.iam.gserviceaccount.com",
  "client_id": "<your-client-id>",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/<your-service-account>%40<project>.iam.gserviceaccount.com"
}
```

> [!NOTE]
> For other providers, follow SDK specific docs.


## Troubleshooting

Push notifications are not always intuitive to implement because they involve systems outside of Stream Chat with a number of moving parts. We've put together some resources on [common errors](/chat/docs/node/push_-_common_issues_and_faq/) and how to resolve them.

## Other Push Providers

While Stream Chat doesn't have first class integration for Push providers besides Firebase, APN, Huawei and Xiaomi, it is entirely possible to integrate with additional providers using [Webhooks](/chat/docs/node/webhooks_overview/).
