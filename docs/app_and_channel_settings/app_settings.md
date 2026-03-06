Application level settings control

- The primary storage location
- Production & Development modes
- Authentication behaviour
- Push providers
- Action handlers webhooks
- CDN settings

See also the [User Average Response Time](/chat/docs/node/user_average_response_time/) feature for tracking user responsiveness.

The easiest way to edit this is the dashboard. The docs below show how to change it with the API.

### Edge network & Storage Location

Stream runs an edge network of servers around the world. This ensures that when users connect the chat loads quickly.
We also support offline storage & optimistic UI updates in all SDKs, ensuring a fast user experience.

At the app level you can control the primary region. This is where your data is stored.
Connections always happen at the edge, but data is stored in this primary region.

### Production & Development Mode

Stream apps can be configured to be either in `development mode` or in `production mode`. You can select which mode your app should be in when you create it in the Stream dashboard, and you can easily switch between modes later on.

When your app is in production mode, certain destructive features in the dashboard are disabled. This prevents you from accidentally deleting user data or disabling mission-critical features.

### Authentication Behaviour

Application level settings allow you to configure settings that impact all the channel types in your app. Our backend SDKs make it easy to change the app settings. You can also change most of these using the CLI or the dashboard. Here's an example on changing the disable_auth_checks setting:

```js
// disable auth checks, allows dev token usage
await client.updateAppSettings({
  disable_auth_checks: true,
});

// re-enable auth checks
await client.updateAppSettings({
  disable_auth_checks: false,
});
```

These 2 settings are important. Never run with disable_auth_checks or disable_permission_checks in production.

| NAME                       | DESCRIPTION                                                                                                                                     | DEFAULT |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| disable_auth_checks        | Disabled authentication. Convenient during testing and allows you to use devTokens on the client side. Should not be used in production.        | false   |
| disable_permissions_checks | Gives all users full permissions to edit messages, delete them etc. Again not recommended in a production setting, only useful for development. | false   |

## Other app settings

### Push

| NAME            | DESCRIPTION                                                                               | DEFAULT |
| --------------- | ----------------------------------------------------------------------------------------- | ------- |
| apn_config      | APN config object. See [details](/chat/docs/node#settings-updateapp-request).      |         |
| firebase_config | Firebase config object. See [details](/chat/docs/node#settings-updateapp-request). |         |
| huawei_config   | Huawei config object. See [details](/chat/docs/node#settings-updateapp-request).   |         |
| xiaomi_config   | Xiaomi config object. See [details](/chat/docs/node#settings-updateapp-request).   |         |
| push_config     | Global config object. See [details](/chat/docs/node#settings-updateapp-request).   |         |

### CDN

| NAME                   | DESCRIPTION                                                                                | DEFAULT           |
| ---------------------- | ------------------------------------------------------------------------------------------ | ----------------- |
| cdn_expiration_seconds | CDN URL expiration time. See [details](/chat/docs/node#settings-updateapp-request). | 1209600 (14 days) |

### Hooks

#### Custom Action Handler and Before Message Send Webhooks

| NAME                         | DESCRIPTION                                                                                                     | DEFAULT |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------- | ------- |
| custom_action_handler_url    | This webhook reacts to custom /slash commands and actions on those commands/                                    | -       |
| before_message_send_hook_url | This webhook allows you to modify or moderate message content before sending it to the chat for everyone to see | -       |

### Webhooks, SQS, SNS, and pending messages

Webhooks, SQS, SNS, and pending messages async moderation now use the `event_hooks` array configuration. See the [Webhooks](/chat/docs/node/webhooks_overview/) documentation for complete details.

### Moderation & Translation

The following settings allow you to control moderation for your chat:

| NAME                     | DESCRIPTION                                                                                                                            | DEFAULT |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| image_moderation_labels  | Moderation scores returned from the external image moderation API                                                                      | -       |
| image_moderation_enabled | If image moderation AI should be turned on                                                                                             | -       |
| enforce_unique_usernames | If Stream should enforce username uniqueness. This prevents people from joining the chat as "elonmusk" while "elonmusk" is presenting. | -       |
| auto_translation_enabled | If Stream should automatically translate messages                                                                                      | -       |
| async_url_enrich_enabled | If url enrichment should be done async. It will trigger message.updated event                                                          | -       |

### File Uploads

You can set restrictions on file uploads by including a `file_upload_config` object. You can set either an inclusive list using `allowed_file_extensions` and `allowed_mime_types` or an exclusive list using `blocked_file_extensions` and `blocked_mime_types` .

The `file_upload_config` object accepts the following fields:

| NAME                    | DESCRIPTION                                                                                                                                                                         | Example                                 | Default |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- | ------- |
| allowed_file_extensions | An array of file types that the user can submit. Files with an extension that does not match the values in this array will be rejected.                                             | [".tar", ".png", ".jpg"]                | -       |
| blocked_file_extensions | An array of file types that the user can submit. Files with an extension that does not match the values in this array will be rejected.                                             | [".tar", ".png", ".jpg"]                | -       |
| allowed_mime_types      | An array of file MIME types that the user can submit. Files with an MIME type that does not match the values in this array will be rejected. Must follow the type/ subtype pattern. | ["text/css", "text/plain", "image/png"] | -       |
| blocked_mime_types      | An array of file types that the user can submit. Files with an MIME type that does not match the values in this array will be rejected. Must follow the type/ subtype pattern.      | ["text/css", "text/plain", "image/png"] | -       |
| size_limit              | A number that represents the maximum accepted file size in bytes. In case its 0 the default maximum is used.                                                                        | 10485760                                | 0       |

For example, the following code shows how to block all attempts to upload any files that are not .csv:

```js
// Only accept .CSV files
await client.updateAppSettings({
  file_upload_config: {
   allowed_file_extensions: [".csv"],
   allowed_mime_types: ["text/csv"]
});
```

### Image Uploads

You can set restrictions on file uploads by including an `image_upload_config` object. You can set either an inclusive list using `allowed_file_extensions` and `allowed_mime_types` or an exclusive list using `blocked_file_extensions` and `blocked_mime_types` .

The `image_upload_config` object accepts the following fields:

| NAME                    | DESCRIPTION                                                                                                                                                                         | Example                                      | Default |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- | ------- |
| allowed_file_extensions | An array of file types that the user can submit. Files with an extension that does not match the values in this array will be rejected.                                             | [".gif", ".png", ".jpg"]                     | -       |
| blocked_file_extensions | An array of file types that the user can submit. Files with an extension that does not match the values in this array will be rejected.                                             | [".tar", ".tiff", ".jpg"]                    | -       |
| allowed_mime_types      | An array of file MIME types that the user can submit. Files with an MIME type that does not match the values in this array will be rejected. Must follow the type/ subtype pattern. | ["image/jpeg", "image/svg+xml", "image/png"] | -       |
| blocked_mime_types      | An array of file types that the user can submit. Files with an MIME type that does not match the values in this array will be rejected. Must follow the type/ subtype pattern.      | ["text/css", "text/plain", "image/tiff"]     | -       |
| size_limit              | A number that represents the maximum accepted file size in bytes. In case its 0 the default maximum is used.                                                                        | 10485760                                     | 0       |

For example, the following code shows how to block all attempts to upload any files that are not gif, jpeg, or png files:

```js
// Only accept gif, jpeg, or png files.
await client.updateAppSettings({
  image_upload_config: {
   allowed_file_extensions: [".gif", ".jpeg", ".png"],
   allowed_mime_types: ["image/gif", "image/jpeg", "image/png"]
});
```

> [!NOTE]
> Stream allowed types for images are: `image/bmp` , `image/gif` , `image/jpeg` , `image/png` , `image/webp` , `image/heic` , `image/heic-sequence` , `image/heif` , `image/heif-sequence` , `image/svg+xml` . Applications can set a more restrictive list, but would not be allowed to set a less restrictive list.
