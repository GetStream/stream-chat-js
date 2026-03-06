Stream Chat provides a variety of channel management APIs that allow you to control how channels behave within your application. This page provides an overview of the different channel management operations available.

## Overview

Channel management operations can be broadly categorized into:

| Operation                                               | Description                                          | User Impact        | Data Impact            |
| ------------------------------------------------------- | ---------------------------------------------------- | ------------------ | ---------------------- |
| [Archiving](/chat/docs/node/archiving_channels/) | Mark a channel as archived for a specific user       | Per-user state     | No data loss           |
| [Pinning](/chat/docs/node/pinning_channels/)     | Mark a channel as pinned for a specific user         | Per-user state     | No data loss           |
| [Muting](/chat/docs/node/muting_channels/)       | Suppress notifications for a channel                 | Per-user state     | No data loss           |
| [Hiding](/chat/docs/node/hiding_channels/)       | Hide a channel from query results until new messages | Per-user state     | Optional history clear |
| [Disabling](/chat/docs/node/disabling_channels/) | Prevent all client-side access to a channel          | All users affected | No data loss           |
| [Freezing](/chat/docs/node/freezing_channels/)   | Prevent new messages and reactions                   | All users affected | No data loss           |
| [Truncating](/chat/docs/node/truncate_channel/)  | Remove messages from a channel                       | All users affected | Message data deleted   |
| [Deleting](/chat/docs/node/channel_delete/)      | Permanently remove a channel                         | All users affected | All data deleted       |

## Choosing the Right Operation

### Per-User Operations

These operations only affect the individual user and are ideal for personal organization:

- **Archiving**: Use when a user wants to declutter their channel list but keep the channel accessible
- **Pinning**: Use when a user wants to prioritize certain channels at the top of their list
- **Muting**: Use when a user wants to stay in a channel but not receive notifications
- **Hiding**: Use when a user wants to temporarily remove a channel from view

### Channel-Wide Operations

These operations affect all users in the channel and typically require admin or moderator permissions:

- **Disabling**: Use when you need to completely block access to a channel (e.g., for moderation)
- **Freezing**: Use when you want to preserve a channel's content but prevent new activity (e.g., archived discussions)
- **Truncating**: Use when you need to clear message history but keep the channel active
- **Deleting**: Use when a channel is no longer needed and should be permanently removed

## Server-Side vs Client-Side

Most channel management operations can be performed from both client-side and server-side SDKs, but some operations are restricted to server-side only for security reasons:

| Operation  | Client-Side            | Server-Side |
| ---------- | ---------------------- | ----------- |
| Archiving  | ✅                     | ✅          |
| Pinning    | ✅                     | ✅          |
| Muting     | ✅                     | ✅          |
| Hiding     | ✅                     | ✅          |
| Disabling  | ❌                     | ✅          |
| Freezing   | ✅                     | ✅          |
| Truncating | ❌                     | ✅          |
| Deleting   | Depends on permissions | ✅          |
