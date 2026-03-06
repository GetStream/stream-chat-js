Stream Chat allows you to upload images, videos, and other files to the Stream CDN or your own CDN. Uploaded files can be used as message attachments, user avatars, or channel images.

> [!NOTE]
> Stream's UI SDKs (React, React Native, Flutter, SwiftUI, Jetpack Compose, etc.) handle file uploads automatically through their message composer components. The upload process, progress tracking, and attachment handling are built into these components. Use the methods described on this page only if you need custom upload behavior or are building a custom UI.


## Uploading Files to a Channel

Files uploaded to a channel can be attached to messages. You can either upload a file first and then attach it to a message, or let the SDK handle the upload when sending a message with attachments.

```js
// Upload an image to the channel
const response = await channel.sendImage(file);
const imageUrl = response.file;

// Send a message with the uploaded image
await channel.sendMessage({
  text: "Check out this image",
  attachments: [
    {
      type: "image",
      asset_url: imageUrl,
      thumb_url: imageUrl,
    },
  ],
});
```

## Uploading Standalone Files

Files not tied to a specific channel can be used for user avatars, channel images, or other application needs.


## Deleting Files

Delete uploaded files to free storage space. Deleting a file from the CDN does not remove it from message attachments that reference it.

```js
// Delete from channel
await channel.deleteFile(fileURL);
await channel.deleteImage(imageURL);
```

## File Requirements

### Images

| Requirement       | Value                                                                        |
| ----------------- | ---------------------------------------------------------------------------- |
| Supported formats | BMP, GIF, JPEG, PNG, WebP, HEIC, HEIC-sequence, HEIF, HEIF-sequence, SVG+XML |
| Maximum file size | 100 MB                                                                       |

### Other Files

| Requirement       | Value                                                                                          |
| ----------------- | ---------------------------------------------------------------------------------------------- |
| Supported formats | All file types are allowed by default. Different clients may handle certain types differently. |
| Maximum file size | 100 MB                                                                                         |

You can configure a more restrictive list of allowed file types for your application.

## Configuring Allowed File Types

Stream allows all file extensions by default. To restrict allowed file types:

- **Dashboard**: Go to Chat Overview > Upload Configuration
- **API**: Use the [App Settings](/chat/docs/node/app_setting_overview/#file-uploads/) endpoint

## Access Control and Link Expiration

Stream CDN URLs include a signature that validates access to the file. Only channel members can access files uploaded to that channel.

| Behavior          | Description                                                                                   |
| ----------------- | --------------------------------------------------------------------------------------------- |
| Access control    | URLs are signed and only accessible by channel members                                        |
| Link expiration   | URLs expire after 14 days                                                                     |
| Automatic refresh | Links are refreshed automatically when messages are retrieved (e.g., when querying a channel) |
| Manual refresh    | Call `getMessage` to retrieve fresh URLs for expired attachments                              |

To check when a link expires, examine the `Expires` query parameter in the URL (Unix timestamp).

## Image Resizing

Append query parameters to Stream CDN image URLs to resize images on the fly.

| Parameter | Type   | Values                           | Description          |
| --------- | ------ | -------------------------------- | -------------------- |
| w         | number |                                  | Width in pixels      |
| h         | number |                                  | Height in pixels     |
| resize    | string | clip, crop, scale, fill          | Resizing mode        |
| crop      | string | center, top, bottom, left, right | Crop anchor position |

> [!WARNING]
> Images can only be resized if the source image has 16,800,000 pixels or fewer. An image of 4000x4000 pixels (16,000,000) would be accepted, but 4100x4100 (16,810,000) would fail.


> [!NOTE]
> Resized images count against your storage quota.


## Using Your Own CDN

All SDKs support custom CDN implementations. Implement a custom file uploader to use your own storage solution.

```js
messageComposer.attachmentManager.setCustomUploadFn(async (file) => {
  const result = await customCDN.upload(file);
  return { file: result.url };
});
```
