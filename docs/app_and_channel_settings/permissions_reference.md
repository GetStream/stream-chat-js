This reference contains some useful information about permission system, applicable to both versions.

## Actions

In the table below you will find all available actions of Stream Chat permission system

| Action                            | Resource Type | Description                                                                                                |
| --------------------------------- | ------------- | ---------------------------------------------------------------------------------------------------------- |
| AddLinks                          | Channel       | Allows user to add URLs into messages                                                                      |
| AddOwnChannelMembership           | Channel       | Allows user to add own channel membership (join channel)                                                   |
| BanChannelMember                  | Channel       | Allows user to ban channel members                                                                         |
| CreateChannel                     | Channel       | Allows user to create a new channel                                                                        |
| CreateDistinctChannelForOthers    | Channel       | Allows user to create new distinct channel for other users (e.g. user A creates channel for users B and C) |
| CreateMessage                     | Channel       | Allows user to send a new message                                                                          |
| CreateAttachment                  | Channel       | Allows user to send a new message with attachments                                                         |
| CreateMention                     | Channel       | Allows user to send a new message with mentions                                                            |
| CreateReaction                    | Channel       | Allows user to add a reaction to a message                                                                 |
| CreateSystemMessage               | Channel       | Allows user to send a new system message                                                                   |
| DeleteChannel                     | Channel       | Allows user to delete a channel                                                                            |
| DeleteReaction                    | Channel       | Allows user to delete a reaction                                                                           |
| FlagMessage                       | Channel       | Allows user to flag messages                                                                               |
| MuteChannel                       | Channel       | Allows user to mute and unmute channel                                                                     |
| PinMessage                        | Channel       | Allows user to pin a message                                                                               |
| ReadChannel                       | Channel       | Allows user to read messages from the channel                                                              |
| ReadChannelMembers                | Channel       | Allows user to read channel members                                                                        |
| ReadDisabledChannel               | User          | Allows user to read disabled channels (regardless of channel membership)                                   |
| ReadMessageFlags                  | Channel       | Allows user to access messages that have been flagged                                                      |
| RecreateChannel                   | Channel       | Allows user to recreate a channel when it got deleted                                                      |
| RemoveOwnChannelMembership        | Channel       | Allows user to leave the channel (remove own channel membership)                                           |
| SendCustomEvent                   | Channel       | Allows user to send custom events to a channel                                                             |
| SkipChannelCooldown               | Channel       | Allows user to bypass existing cooldown in a channel                                                       |
| SkipMessageModeration             | Channel       | Allows user to bypass automatic message moderation                                                         |
| TruncateChannel                   | Channel       | Allows user to truncate a channel                                                                          |
| UpdateChannel                     | Channel       | Allows user to update channel data                                                                         |
| UpdateChannelCooldown             | Channel       | Allows user to set and unset cooldown time for a channel (slow mode)                                       |
| UpdateChannelFrozen               | Channel       | Allows user to freeze and unfreeze a channel                                                               |
| UpdateChannelMembers              | Channel       | Allows user to add, modify and remove channel members                                                      |
| UploadAttachment                  | Channel       | Allows user to upload files and images                                                                     |
| UseFrozenChannel                  | Channel       | Allows user to send messages and reactions to a frozen channels                                            |
| DeleteMessage                     | Message       | Allows user to delete a message                                                                            |
| RunMessageAction                  | Message       | Allows user to run an action against a message                                                             |
| UnblockMessage                    | Message       | Allows user to unblock message blocked by automatic moderation                                             |
| UpdateMessage                     | Message       | Allows user to update a message                                                                            |
| DeleteAttachment                  | Attachment    | Allows user to delete uploaded files and images                                                            |
| BanUser                           | User          | Allows user to ban users                                                                                   |
| FlagUser                          | User          | Allows user to flag users                                                                                  |
| MuteUser                          | User          | Allows user to mute and unmute users                                                                       |
| SearchUser                        | User          | Allows user to search for other users                                                                      |
| UpdateUser                        | User          | Allows user to update users                                                                                |
| UpdateUserRole                    | User          | Allows user to update user roles                                                                           |
| UpdateUserTeams                   | User          | Allows user to update user teams                                                                           |
| CreateRestrictedVisibilityMessage | User          | Allows user to create restricted visibility messages                                                       |
| ReadRestrictedVisibilityMessage   | User          | Allows user to read restricted visibility messages                                                         |
| BlockUser                         | Call          | Allows user to Block and unblock users on calls                                                            |
| CreateCall                        | Call          | Allows user to creates a call                                                                              |
| CreateCallReaction                | Call          | Allows user to Add a reaction to a call                                                                    |
| DeleteRecording                   | Call          | Allows user to Delete recording                                                                            |
| EndCall                           | Call          | Allows user to terminates a call                                                                           |
| JoinBackstage                     | Call          | Allows user to joins a call backstage                                                                      |
| JoinCall                          | Call          | Allows user to joins a call                                                                                |
| JoinEndedCall                     | Call          | Allows user to joins a call that was marked as ended                                                       |
| ListRecordings                    | Call          | Allows user to List recordings                                                                             |
| MuteUsers                         | Call          | Allows user to MuteUsers                                                                                   |
| PinCallTrack                      | Call          | Allows user to Pin/Unpin a track for everyone in the call                                                  |
| ReadCall                          | Call          | Allows user to read a call                                                                                 |
| ReadFlagReports                   | FlagReport    | Allows user to read flag reports                                                                           |
| RemoveCallMember                  | Call          | Allows user to Remove a participant                                                                        |
| Screenshare                       | Call          | Allows user to Screenshare                                                                                 |
| SendAudio                         | Call          | Allows user to Send audio                                                                                  |
| SendEvent                         | Call          | Allows user to SendEvent                                                                                   |
| SendVideo                         | Call          | Allows user to Send video                                                                                  |
| StartBroadcasting                 | Call          | Allows user to Start broadcasting                                                                          |
| StartRecording                    | Call          | Allows user to Start recording                                                                             |
| StartTranscription                | Call          | Allows user to Start transcription                                                                         |
| StopBroadcasting                  | Call          | Allows user to Stop broadcasting                                                                           |
| StopRecording                     | Call          | Allows user to Stop recording                                                                              |
| StopTranscription                 | Call          | Allows user to Stop transcription                                                                          |
| UpdateCall                        | Call          | Allows user to update the data for a call                                                                  |
| UpdateCallMember                  | Call          | Allows user to Update a participant                                                                        |
| UpdateCallMemberRole              | Call          | Allows user to Update role for participants                                                                |
| UpdateCallPermissions             | Call          | Allows user to UpdateCallPermissions                                                                       |
| UpdateCallSettings                | Call          | Allows user to updates settings of a call                                                                  |
| UpdateFlagReport                  | FlagReport    | Allows user to update flag report                                                                          |

## Default Grants

In tables below you will find default permission grants for each builtin channel type as well as `.app` permission scope.

For each of of the above actions, there are different built in permissions depending on whether the object was created by the user or not. For example, users can be given permissions to `delete-attachment` which allows for deleting any message attachments, or they can be given permissions to `delete-attachment-owned` to restrict this to only attachments added by the current user.

Every custom channel type that you create using CreateChannelType API endpoint, will have `messaging` scope grants by default.

### Scope `video:development`

| Permission ID           | admin | user | guest | anonymous |
| ----------------------- | ----- | ---- | ----- | --------- |
| block-user              | ✅    | ✅   | ✖️    | ✖️        |
| create-call             | ✅    | ✅   | ✖️    | ✖️        |
| create-call-reaction    | ✅    | ✅   | ✖️    | ✖️        |
| end-call                | ✅    | ✅   | ✖️    | ✖️        |
| join-backstage          | ✅    | ✅   | ✖️    | ✖️        |
| join-call               | ✅    | ✅   | ✅    | ✅        |
| join-ended-call         | ✅    | ✅   | ✖️    | ✖️        |
| list-recordings         | ✅    | ✅   | ✖️    | ✖️        |
| mute-users              | ✅    | ✅   | ✖️    | ✖️        |
| pin-call-track          | ✅    | ✅   | ✖️    | ✖️        |
| read-call               | ✅    | ✅   | ✅    | ✅        |
| remove-call-member      | ✅    | ✅   | ✖️    | ✖️        |
| screenshare             | ✅    | ✅   | ✖️    | ✖️        |
| send-audio              | ✅    | ✅   | ✅    | ✖️        |
| send-event              | ✅    | ✅   | ✅    | ✖️        |
| send-video              | ✅    | ✅   | ✅    | ✖️        |
| start-broadcasting      | ✅    | ✅   | ✖️    | ✖️        |
| start-recording         | ✅    | ✅   | ✖️    | ✖️        |
| start-transcription     | ✅    | ✅   | ✖️    | ✖️        |
| stop-broadcasting       | ✅    | ✅   | ✖️    | ✖️        |
| stop-recording          | ✅    | ✅   | ✖️    | ✖️        |
| stop-transcription      | ✅    | ✅   | ✖️    | ✖️        |
| update-call             | ✅    | ✅   | ✖️    | ✖️        |
| update-call-member      | ✅    | ✅   | ✖️    | ✖️        |
| update-call-member-role | ✅    | ✅   | ✖️    | ✖️        |
| update-call-permissions | ✅    | ✅   | ✖️    | ✖️        |
| update-call-settings    | ✅    | ✅   | ✖️    | ✖️        |

### Scope `video:livestream`

| Permission ID                 | admin | user | anonymous |
| ----------------------------- | ----- | ---- | --------- |
| block-user                    | ✅    | ✖️   | ✖️        |
| block-user-owner              | ✖️    | ✅   | ✖️        |
| create-call                   | ✅    | ✅   | ✖️        |
| create-call-reaction          | ✅    | ✅   | ✖️        |
| end-call                      | ✅    | ✖️   | ✖️        |
| end-call-owner                | ✖️    | ✅   | ✖️        |
| join-backstage                | ✅    | ✖️   | ✖️        |
| join-backstage-owner          | ✖️    | ✅   | ✖️        |
| join-call                     | ✅    | ✅   | ✅        |
| join-ended-call               | ✅    | ✖️   | ✖️        |
| join-ended-call-owner         | ✖️    | ✅   | ✖️        |
| mute-users                    | ✅    | ✖️   | ✖️        |
| mute-users-owner              | ✖️    | ✅   | ✖️        |
| pin-call-track                | ✅    | ✖️   | ✖️        |
| pin-call-track-owner          | ✖️    | ✅   | ✖️        |
| read-call                     | ✅    | ✅   | ✅        |
| remove-call-member            | ✅    | ✖️   | ✖️        |
| remove-call-member-owner      | ✖️    | ✅   | ✖️        |
| screenshare                   | ✅    | ✖️   | ✖️        |
| screenshare-owner             | ✖️    | ✅   | ✖️        |
| send-audio                    | ✅    | ✖️   | ✖️        |
| send-audio-owner              | ✖️    | ✅   | ✖️        |
| send-event                    | ✅    | ✅   | ✖️        |
| send-video                    | ✅    | ✖️   | ✖️        |
| send-video-owner              | ✖️    | ✅   | ✖️        |
| start-broadcasting            | ✅    | ✖️   | ✖️        |
| start-broadcasting-owner      | ✖️    | ✅   | ✖️        |
| start-recording               | ✅    | ✖️   | ✖️        |
| start-recording-owner         | ✖️    | ✅   | ✖️        |
| stop-broadcasting             | ✅    | ✖️   | ✖️        |
| stop-broadcasting-owner       | ✖️    | ✅   | ✖️        |
| stop-recording                | ✅    | ✖️   | ✖️        |
| stop-recording-owner          | ✖️    | ✅   | ✖️        |
| update-call                   | ✅    | ✖️   | ✖️        |
| update-call-member            | ✅    | ✖️   | ✖️        |
| update-call-member-owner      | ✖️    | ✅   | ✖️        |
| update-call-member-role       | ✅    | ✖️   | ✖️        |
| update-call-member-role-owner | ✖️    | ✅   | ✖️        |
| update-call-owner             | ✖️    | ✅   | ✖️        |
| update-call-permissions       | ✅    | ✖️   | ✖️        |
| update-call-permissions-owner | ✖️    | ✅   | ✖️        |
| update-call-settings          | ✅    | ✖️   | ✖️        |

### Scope `video:audio_room`

| Permission ID                 | admin | user | anonymous |
| ----------------------------- | ----- | ---- | --------- |
| block-user                    | ✅    | ✖️   | ✖️        |
| block-user-owner              | ✖️    | ✅   | ✖️        |
| create-call                   | ✅    | ✅   | ✖️        |
| create-call-reaction          | ✅    | ✅   | ✖️        |
| end-call                      | ✅    | ✖️   | ✖️        |
| end-call-owner                | ✖️    | ✅   | ✖️        |
| join-backstage                | ✅    | ✖️   | ✖️        |
| join-backstage-owner          | ✖️    | ✅   | ✖️        |
| join-call                     | ✅    | ✅   | ✅        |
| join-ended-call               | ✅    | ✖️   | ✖️        |
| join-ended-call-owner         | ✖️    | ✅   | ✖️        |
| mute-users                    | ✅    | ✖️   | ✖️        |
| mute-users-owner              | ✖️    | ✅   | ✖️        |
| read-call                     | ✅    | ✅   | ✅        |
| remove-call-member            | ✅    | ✖️   | ✖️        |
| remove-call-member-owner      | ✖️    | ✅   | ✖️        |
| screenshare                   | ✅    | ✖️   | ✖️        |
| send-audio                    | ✅    | ✖️   | ✖️        |
| send-audio-owner              | ✖️    | ✅   | ✖️        |
| send-event                    | ✅    | ✅   | ✖️        |
| start-broadcasting            | ✅    | ✖️   | ✖️        |
| start-broadcasting-owner      | ✖️    | ✅   | ✖️        |
| start-recording               | ✅    | ✖️   | ✖️        |
| start-recording-owner         | ✖️    | ✅   | ✖️        |
| start-transcription           | ✅    | ✖️   | ✖️        |
| start-transcription-owner     | ✖️    | ✅   | ✖️        |
| stop-broadcasting             | ✅    | ✖️   | ✖️        |
| stop-broadcasting-owner       | ✖️    | ✅   | ✖️        |
| stop-recording                | ✅    | ✖️   | ✖️        |
| stop-recording-owner          | ✖️    | ✅   | ✖️        |
| stop-transcription            | ✅    | ✖️   | ✖️        |
| stop-transcription-owner      | ✖️    | ✅   | ✖️        |
| update-call                   | ✅    | ✖️   | ✖️        |
| update-call-member            | ✅    | ✖️   | ✖️        |
| update-call-member-owner      | ✖️    | ✅   | ✖️        |
| update-call-member-role       | ✅    | ✖️   | ✖️        |
| update-call-member-role-owner | ✖️    | ✅   | ✖️        |
| update-call-owner             | ✖️    | ✅   | ✖️        |
| update-call-permissions       | ✅    | ✖️   | ✖️        |
| update-call-permissions-owner | ✖️    | ✅   | ✖️        |
| update-call-settings          | ✅    | ✖️   | ✖️        |
| update-call-settings-owner    | ✖️    | ✅   | ✖️        |

### Scope `.app`

| Permission ID      | admin | moderator | user | guest |
| ------------------ | ----- | --------- | ---- | ----- |
| flag-user          | ✅    | ✅        | ✅   | ✅    |
| mute-user          | ✅    | ✅        | ✅   | ✅    |
| read-flag-reports  | ✅    | ✅        | ✖️   | ✖️    |
| search-user        | ✅    | ✅        | ✅   | ✅    |
| update-flag-report | ✅    | ✅        | ✖️   | ✖️    |
| update-user-owner  | ✅    | ✅        | ✅   | ✅    |

### Scope `video:default`

| Permission ID                 | admin | user | guest |
| ----------------------------- | ----- | ---- | ----- |
| block-user                    | ✅    | ✖️   | ✖️    |
| block-user-owner              | ✖️    | ✅   | ✖️    |
| create-call                   | ✅    | ✅   | ✖️    |
| create-call-reaction          | ✅    | ✅   | ✖️    |
| delete-recording              | ✅    | ✖️   | ✖️    |
| end-call                      | ✅    | ✅   | ✖️    |
| join-backstage                | ✅    | ✖️   | ✖️    |
| join-call                     | ✅    | ✅   | ✅    |
| join-ended-call               | ✅    | ✅   | ✖️    |
| list-recordings               | ✅    | ✅   | ✖️    |
| mute-users                    | ✅    | ✖️   | ✖️    |
| mute-users-owner              | ✖️    | ✅   | ✖️    |
| pin-call-track                | ✅    | ✖️   | ✖️    |
| pin-call-track-owner          | ✖️    | ✅   | ✖️    |
| read-call                     | ✅    | ✅   | ✅    |
| remove-call-member            | ✅    | ✅   | ✖️    |
| screenshare                   | ✅    | ✅   | ✖️    |
| send-audio                    | ✅    | ✅   | ✅    |
| send-event                    | ✅    | ✅   | ✅    |
| send-video                    | ✅    | ✅   | ✅    |
| start-broadcasting            | ✅    | ✅   | ✖️    |
| start-recording               | ✅    | ✅   | ✖️    |
| start-transcription           | ✅    | ✅   | ✖️    |
| stop-broadcasting             | ✅    | ✅   | ✖️    |
| stop-recording                | ✅    | ✅   | ✖️    |
| stop-transcription            | ✅    | ✅   | ✖️    |
| update-call                   | ✅    | ✖️   | ✖️    |
| update-call-member            | ✅    | ✅   | ✖️    |
| update-call-member-role       | ✅    | ✖️   | ✖️    |
| update-call-owner             | ✖️    | ✅   | ✖️    |
| update-call-permissions       | ✅    | ✖️   | ✖️    |
| update-call-permissions-owner | ✖️    | ✅   | ✖️    |
| update-call-settings          | ✅    | ✖️   | ✖️    |
| update-call-settings-owner    | ✖️    | ✅   | ✖️    |

### Scope `messaging`

| Permission ID                       | admin | moderator | user | channel_member | channel_moderator |
| ----------------------------------- | ----- | --------- | ---- | -------------- | ----------------- |
| add-links                           | ✅    | ✅        | ✖️   | ✅             | ✅                |
| add-links-owner                     | ✖️    | ✖️        | ✅   | ✖️             | ✖️                |
| ban-channel-member                  | ✅    | ✅        | ✖️   | ✖️             | ✅                |
| ban-user                            | ✅    | ✅        | ✖️   | ✖️             | ✖️                |
| create-call                         | ✅    | ✅        | ✖️   | ✅             | ✅                |
| create-channel                      | ✅    | ✅        | ✅   | ✖️             | ✖️                |
| create-message                      | ✅    | ✅        | ✖️   | ✅             | ✅                |
| create-message-owner                | ✖️    | ✖️        | ✅   | ✖️             | ✖️                |
| create-attachment                   | ✅    | ✅        | ✖️   | ✅             | ✅                |
| create-attachment-owner             | ✖️    | ✖️        | ✅   | ✖️             | ✖️                |
| create-mention                      | ✅    | ✅        | ✖️   | ✅             | ✅                |
| create-mention-owner                | ✖️    | ✖️        | ✅   | ✖️             | ✖️                |
| create-reaction                     | ✅    | ✅        | ✖️   | ✅             | ✅                |
| create-reaction-owner               | ✖️    | ✖️        | ✅   | ✖️             | ✖️                |
| create-system-message               | ✅    | ✅        | ✖️   | ✖️             | ✅                |
| delete-attachment                   | ✅    | ✅        | ✖️   | ✖️             | ✅                |
| delete-attachment-owner             | ✖️    | ✖️        | ✅   | ✖️             | ✖️                |
| delete-channel                      | ✅    | ✖️        | ✖️   | ✖️             | ✖️                |
| delete-channel-owner                | ✖️    | ✅        | ✅   | ✖️             | ✖️                |
| delete-message                      | ✅    | ✅        | ✖️   | ✖️             | ✅                |
| delete-message-owner                | ✖️    | ✖️        | ✅   | ✖️             | ✖️                |
| delete-reaction                     | ✅    | ✅        | ✖️   | ✖️             | ✅                |
| delete-reaction-owner               | ✖️    | ✖️        | ✅   | ✖️             | ✖️                |
| flag-message                        | ✅    | ✅        | ✖️   | ✅             | ✅                |
| flag-message-owner                  | ✖️    | ✖️        | ✅   | ✖️             | ✖️                |
| join-call                           | ✅    | ✅        | ✖️   | ✅             | ✅                |
| mute-channel                        | ✅    | ✅        | ✖️   | ✅             | ✅                |
| mute-channel-owner                  | ✖️    | ✖️        | ✅   | ✖️             | ✖️                |
| pin-message                         | ✅    | ✅        | ✖️   | ✅             | ✅                |
| pin-message-owner                   | ✖️    | ✖️        | ✅   | ✖️             | ✖️                |
| read-channel                        | ✅    | ✅        | ✖️   | ✅             | ✅                |
| read-channel-members                | ✅    | ✅        | ✖️   | ✅             | ✅                |
| read-channel-members-owner          | ✖️    | ✖️        | ✅   | ✖️             | ✖️                |
| read-channel-owner                  | ✖️    | ✖️        | ✅   | ✖️             | ✖️                |
| read-message-flags                  | ✅    | ✅        | ✖️   | ✖️             | ✅                |
| recreate-channel                    | ✅    | ✖️        | ✖️   | ✖️             | ✖️                |
| recreate-channel-owner              | ✖️    | ✅        | ✅   | ✖️             | ✖️                |
| remove-own-channel-membership       | ✅    | ✅        | ✖️   | ✅             | ✅                |
| remove-own-channel-membership-owner | ✖️    | ✖️        | ✅   | ✖️             | ✖️                |
| run-message-action                  | ✅    | ✅        | ✖️   | ✅             | ✅                |
| run-message-action-owner            | ✖️    | ✖️        | ✅   | ✖️             | ✖️                |
| send-custom-event                   | ✅    | ✅        | ✖️   | ✅             | ✅                |
| send-custom-event-owner             | ✖️    | ✖️        | ✅   | ✖️             | ✖️                |
| skip-channel-cooldown               | ✅    | ✅        | ✖️   | ✖️             | ✅                |
| skip-message-moderation             | ✅    | ✅        | ✖️   | ✖️             | ✅                |
| truncate-channel                    | ✅    | ✖️        | ✖️   | ✖️             | ✖️                |
| truncate-channel-owner              | ✖️    | ✅        | ✅   | ✖️             | ✖️                |
| unblock-message                     | ✅    | ✅        | ✖️   | ✖️             | ✅                |
| update-channel                      | ✅    | ✅        | ✖️   | ✖️             | ✅                |
| update-channel-cooldown             | ✅    | ✅        | ✖️   | ✖️             | ✅                |
| update-channel-frozen               | ✅    | ✅        | ✖️   | ✖️             | ✅                |
| update-channel-members              | ✅    | ✅        | ✖️   | ✖️             | ✅                |
| update-channel-members-owner        | ✖️    | ✖️        | ✅   | ✖️             | ✖️                |
| update-channel-owner                | ✖️    | ✖️        | ✅   | ✖️             | ✖️                |
| update-message                      | ✅    | ✅        | ✖️   | ✖️             | ✅                |
| update-message-owner                | ✖️    | ✖️        | ✅   | ✖️             | ✖️                |
| upload-attachment                   | ✅    | ✅        | ✖️   | ✅             | ✅                |
| upload-attachment-owner             | ✖️    | ✖️        | ✅   | ✖️             | ✖️                |

### Scope `livestream`

| Permission ID                 | admin | moderator | user | channel_moderator | guest | anonymous |
| ----------------------------- | ----- | --------- | ---- | ----------------- | ----- | --------- |
| add-links                     | ✅    | ✅        | ✅   | ✖️                | ✖️    | ✖️        |
| ban-channel-member            | ✅    | ✅        | ✖️   | ✅                | ✖️    | ✖️        |
| ban-user                      | ✅    | ✅        | ✖️   | ✖️                | ✖️    | ✖️        |
| create-call                   | ✅    | ✅        | ✖️   | ✅                | ✖️    | ✖️        |
| create-channel                | ✅    | ✅        | ✅   | ✖️                | ✖️    | ✖️        |
| create-message                | ✅    | ✅        | ✅   | ✖️                | ✖️    | ✖️        |
| create-attachment             | ✅    | ✅        | ✅   | ✖️                | ✖️    | ✖️        |
| create-mention                | ✅    | ✅        | ✅   | ✖️                | ✖️    | ✖️        |
| create-reaction               | ✅    | ✅        | ✅   | ✖️                | ✖️    | ✖️        |
| create-system-message         | ✅    | ✅        | ✖️   | ✅                | ✖️    | ✖️        |
| delete-attachment             | ✅    | ✅        | ✖️   | ✅                | ✖️    | ✖️        |
| delete-attachment-owner       | ✖️    | ✖️        | ✅   | ✖️                | ✖️    | ✖️        |
| delete-channel                | ✅    | ✖️        | ✖️   | ✖️                | ✖️    | ✖️        |
| delete-message                | ✅    | ✅        | ✖️   | ✅                | ✖️    | ✖️        |
| delete-message-owner          | ✖️    | ✖️        | ✅   | ✖️                | ✖️    | ✖️        |
| delete-reaction               | ✅    | ✅        | ✖️   | ✅                | ✖️    | ✖️        |
| delete-reaction-owner         | ✖️    | ✖️        | ✅   | ✖️                | ✖️    | ✖️        |
| flag-message                  | ✅    | ✅        | ✅   | ✖️                | ✅    | ✖️        |
| join-call                     | ✅    | ✅        | ✅   | ✖️                | ✅    | ✅        |
| mute-channel                  | ✅    | ✅        | ✅   | ✖️                | ✅    | ✖️        |
| pin-message                   | ✅    | ✅        | ✖️   | ✅                | ✖️    | ✖️        |
| pin-message-owner             | ✖️    | ✖️        | ✅   | ✖️                | ✖️    | ✖️        |
| read-channel                  | ✅    | ✅        | ✅   | ✖️                | ✅    | ✅        |
| read-channel-members          | ✅    | ✅        | ✅   | ✖️                | ✅    | ✅        |
| read-message-flags            | ✅    | ✅        | ✖️   | ✅                | ✖️    | ✖️        |
| recreate-channel              | ✅    | ✖️        | ✖️   | ✖️                | ✖️    | ✖️        |
| remove-own-channel-membership | ✅    | ✖️        | ✖️   | ✖️                | ✖️    | ✖️        |
| run-message-action            | ✅    | ✅        | ✅   | ✖️                | ✖️    | ✖️        |
| send-custom-event             | ✅    | ✅        | ✅   | ✖️                | ✖️    | ✖️        |
| skip-channel-cooldown         | ✅    | ✅        | ✖️   | ✅                | ✖️    | ✖️        |
| skip-message-moderation       | ✅    | ✅        | ✖️   | ✅                | ✖️    | ✖️        |
| truncate-channel              | ✅    | ✖️        | ✖️   | ✖️                | ✖️    | ✖️        |
| unblock-message               | ✅    | ✅        | ✖️   | ✅                | ✖️    | ✖️        |
| update-channel                | ✅    | ✖️        | ✖️   | ✖️                | ✖️    | ✖️        |
| update-channel-cooldown       | ✅    | ✅        | ✖️   | ✅                | ✖️    | ✖️        |
| update-channel-frozen         | ✅    | ✅        | ✖️   | ✅                | ✖️    | ✖️        |
| update-channel-members        | ✅    | ✖️        | ✖️   | ✖️                | ✖️    | ✖️        |
| update-message                | ✅    | ✅        | ✖️   | ✅                | ✖️    | ✖️        |
| update-message-owner          | ✖️    | ✖️        | ✅   | ✖️                | ✖️    | ✖️        |
| upload-attachment             | ✅    | ✅        | ✅   | ✖️                | ✖️    | ✖️        |

### Scope `team`

| Permission ID                       | admin | moderator | user | channel_member | channel_moderator |
| ----------------------------------- | ----- | --------- | ---- | -------------- | ----------------- |
| add-links                           | ✅    | ✅        | ✖️   | ✅             | ✅                |
| add-links-owner                     | ✖️    | ✖️        | ✅   | ✖️             | ✖️                |
| ban-channel-member                  | ✅    | ✅        | ✖️   | ✖️             | ✅                |
| ban-user                            | ✅    | ✅        | ✖️   | ✖️             | ✖️                |
| create-call                         | ✅    | ✅        | ✖️   | ✅             | ✅                |
| create-channel                      | ✅    | ✅        | ✅   | ✖️             | ✖️                |
| create-message                      | ✅    | ✅        | ✖️   | ✅             | ✅                |
| create-message-owner                | ✖️    | ✖️        | ✅   | ✖️             | ✖️                |
| create-attachment                   | ✅    | ✅        | ✖️   | ✅             | ✅                |
| create-attachment-owner             | ✖️    | ✖️        | ✅   | ✖️             | ✖️                |
| create-mention                      | ✅    | ✅        | ✖️   | ✅             | ✅                |
| create-mention-owner                | ✖️    | ✖️        | ✅   | ✖️             | ✖️                |
| create-reaction                     | ✅    | ✅        | ✖️   | ✅             | ✅                |
| create-reaction-owner               | ✖️    | ✖️        | ✅   | ✖️             | ✖️                |
| create-system-message               | ✅    | ✅        | ✖️   | ✖️             | ✅                |
| delete-attachment                   | ✅    | ✅        | ✖️   | ✖️             | ✅                |
| delete-attachment-owner             | ✖️    | ✖️        | ✅   | ✖️             | ✖️                |
| delete-channel                      | ✅    | ✖️        | ✖️   | ✖️             | ✖️                |
| delete-channel-owner                | ✖️    | ✅        | ✅   | ✖️             | ✖️                |
| delete-message                      | ✅    | ✅        | ✖️   | ✖️             | ✅                |
| delete-message-owner                | ✖️    | ✖️        | ✅   | ✖️             | ✖️                |
| delete-reaction                     | ✅    | ✅        | ✖️   | ✖️             | ✅                |
| delete-reaction-owner               | ✖️    | ✖️        | ✅   | ✖️             | ✖️                |
| flag-message                        | ✅    | ✅        | ✖️   | ✅             | ✅                |
| flag-message-owner                  | ✖️    | ✖️        | ✅   | ✖️             | ✖️                |
| join-call                           | ✅    | ✅        | ✖️   | ✅             | ✅                |
| mute-channel                        | ✅    | ✅        | ✖️   | ✅             | ✅                |
| mute-channel-owner                  | ✖️    | ✖️        | ✅   | ✖️             | ✖️                |
| pin-message                         | ✅    | ✅        | ✖️   | ✅             | ✅                |
| pin-message-owner                   | ✖️    | ✖️        | ✅   | ✖️             | ✖️                |
| read-channel                        | ✅    | ✅        | ✖️   | ✅             | ✅                |
| read-channel-members                | ✅    | ✅        | ✖️   | ✅             | ✅                |
| read-channel-members-owner          | ✖️    | ✖️        | ✅   | ✖️             | ✖️                |
| read-channel-owner                  | ✖️    | ✖️        | ✅   | ✖️             | ✖️                |
| read-message-flags                  | ✅    | ✅        | ✖️   | ✖️             | ✅                |
| recreate-channel                    | ✅    | ✖️        | ✖️   | ✖️             | ✖️                |
| recreate-channel-owner              | ✖️    | ✅        | ✅   | ✖️             | ✖️                |
| remove-own-channel-membership       | ✅    | ✅        | ✖️   | ✅             | ✅                |
| remove-own-channel-membership-owner | ✖️    | ✖️        | ✅   | ✖️             | ✖️                |
| run-message-action                  | ✅    | ✅        | ✖️   | ✅             | ✅                |
| run-message-action-owner            | ✖️    | ✖️        | ✅   | ✖️             | ✖️                |
| send-custom-event                   | ✅    | ✅        | ✖️   | ✅             | ✅                |
| send-custom-event-owner             | ✖️    | ✖️        | ✅   | ✖️             | ✖️                |
| skip-channel-cooldown               | ✅    | ✅        | ✖️   | ✖️             | ✅                |
| skip-message-moderation             | ✅    | ✅        | ✖️   | ✖️             | ✅                |
| truncate-channel                    | ✅    | ✖️        | ✖️   | ✖️             | ✖️                |
| truncate-channel-owner              | ✖️    | ✅        | ✅   | ✖️             | ✖️                |
| unblock-message                     | ✅    | ✅        | ✖️   | ✖️             | ✅                |
| update-channel                      | ✅    | ✅        | ✖️   | ✖️             | ✅                |
| update-channel-cooldown             | ✅    | ✅        | ✖️   | ✖️             | ✅                |
| update-channel-frozen               | ✅    | ✅        | ✖️   | ✖️             | ✅                |
| update-channel-members              | ✅    | ✅        | ✖️   | ✖️             | ✅                |
| update-channel-members-owner        | ✖️    | ✖️        | ✅   | ✖️             | ✖️                |
| update-channel-owner                | ✖️    | ✖️        | ✅   | ✖️             | ✖️                |
| update-message                      | ✅    | ✅        | ✖️   | ✖️             | ✅                |
| update-message-owner                | ✖️    | ✖️        | ✅   | ✖️             | ✖️                |
| upload-attachment                   | ✅    | ✅        | ✖️   | ✅             | ✅                |
| upload-attachment-owner             | ✖️    | ✖️        | ✅   | ✖️             | ✖️                |

### Scope `commerce`

| Permission ID                       | admin | moderator | user | channel_member | channel_moderator | guest |
| ----------------------------------- | ----- | --------- | ---- | -------------- | ----------------- | ----- |
| add-links                           | ✅    | ✅        | ✖️   | ✅             | ✅                | ✅    |
| add-links-owner                     | ✖️    | ✖️        | ✅   | ✖️             | ✖️                | ✖️    |
| ban-channel-member                  | ✅    | ✅        | ✖️   | ✖️             | ✅                | ✖️    |
| ban-user                            | ✅    | ✅        | ✖️   | ✖️             | ✖️                | ✖️    |
| create-call                         | ✅    | ✅        | ✖️   | ✖️             | ✅                | ✖️    |
| create-channel                      | ✅    | ✅        | ✖️   | ✖️             | ✖️                | ✅    |
| create-message                      | ✅    | ✅        | ✖️   | ✅             | ✅                | ✖️    |
| create-message-owner                | ✖️    | ✖️        | ✅   | ✖️             | ✖️                | ✖️    |
| create-attachment                   | ✅    | ✅        | ✖️   | ✅             | ✅                | ✖️    |
| create-attachment-owner             | ✖️    | ✖️        | ✅   | ✖️             | ✖️                | ✖️    |
| create-mention                      | ✅    | ✅        | ✖️   | ✅             | ✅                | ✖️    |
| create-mention-owner                | ✖️    | ✖️        | ✅   | ✖️             | ✖️                | ✖️    |
| create-reaction                     | ✅    | ✅        | ✖️   | ✅             | ✅                | ✖️    |
| create-reaction-owner               | ✖️    | ✖️        | ✅   | ✖️             | ✖️                | ✖️    |
| create-system-message               | ✅    | ✅        | ✖️   | ✖️             | ✅                | ✖️    |
| delete-attachment                   | ✅    | ✅        | ✖️   | ✖️             | ✅                | ✖️    |
| delete-attachment-owner             | ✖️    | ✖️        | ✅   | ✖️             | ✖️                | ✅    |
| delete-channel                      | ✅    | ✖️        | ✖️   | ✖️             | ✖️                | ✖️    |
| delete-message                      | ✅    | ✅        | ✖️   | ✖️             | ✅                | ✖️    |
| delete-message-owner                | ✖️    | ✖️        | ✅   | ✖️             | ✖️                | ✅    |
| delete-reaction                     | ✅    | ✅        | ✖️   | ✖️             | ✅                | ✖️    |
| delete-reaction-owner               | ✖️    | ✖️        | ✅   | ✖️             | ✖️                | ✅    |
| flag-message                        | ✅    | ✅        | ✖️   | ✅             | ✅                | ✖️    |
| flag-message-owner                  | ✖️    | ✖️        | ✅   | ✖️             | ✖️                | ✅    |
| join-call                           | ✅    | ✅        | ✖️   | ✅             | ✅                | ✖️    |
| mute-channel                        | ✅    | ✅        | ✖️   | ✅             | ✅                | ✖️    |
| mute-channel-owner                  | ✖️    | ✖️        | ✅   | ✖️             | ✖️                | ✅    |
| pin-message                         | ✅    | ✅        | ✖️   | ✖️             | ✅                | ✖️    |
| pin-message-owner                   | ✖️    | ✖️        | ✅   | ✖️             | ✖️                | ✅    |
| read-channel                        | ✅    | ✅        | ✖️   | ✅             | ✅                | ✖️    |
| read-channel-members                | ✅    | ✅        | ✖️   | ✅             | ✅                | ✖️    |
| read-channel-members-owner          | ✖️    | ✖️        | ✅   | ✖️             | ✖️                | ✅    |
| read-channel-owner                  | ✖️    | ✖️        | ✅   | ✖️             | ✖️                | ✅    |
| read-message-flags                  | ✅    | ✅        | ✖️   | ✖️             | ✅                | ✖️    |
| recreate-channel                    | ✅    | ✖️        | ✖️   | ✖️             | ✖️                | ✖️    |
| remove-own-channel-membership       | ✅    | ✅        | ✖️   | ✅             | ✅                | ✖️    |
| remove-own-channel-membership-owner | ✖️    | ✖️        | ✅   | ✖️             | ✖️                | ✖️    |
| run-message-action                  | ✅    | ✅        | ✖️   | ✅             | ✅                | ✖️    |
| run-message-action-owner            | ✖️    | ✖️        | ✅   | ✖️             | ✖️                | ✖️    |
| send-custom-event                   | ✅    | ✅        | ✖️   | ✅             | ✅                | ✖️    |
| send-custom-event-owner             | ✖️    | ✖️        | ✅   | ✖️             | ✖️                | ✖️    |
| skip-channel-cooldown               | ✅    | ✅        | ✖️   | ✖️             | ✅                | ✖️    |
| skip-message-moderation             | ✅    | ✅        | ✖️   | ✖️             | ✅                | ✖️    |
| truncate-channel                    | ✅    | ✖️        | ✖️   | ✖️             | ✖️                | ✖️    |
| unblock-message                     | ✅    | ✅        | ✖️   | ✖️             | ✅                | ✖️    |
| update-channel                      | ✅    | ✅        | ✖️   | ✖️             | ✅                | ✖️    |
| update-channel-cooldown             | ✅    | ✅        | ✖️   | ✖️             | ✅                | ✖️    |
| update-channel-frozen               | ✅    | ✅        | ✖️   | ✖️             | ✅                | ✖️    |
| update-channel-members              | ✅    | ✅        | ✖️   | ✖️             | ✅                | ✖️    |
| update-channel-members-owner        | ✖️    | ✖️        | ✅   | ✖️             | ✖️                | ✅    |
| update-message                      | ✅    | ✅        | ✖️   | ✖️             | ✅                | ✖️    |
| update-message-owner                | ✖️    | ✖️        | ✅   | ✖️             | ✖️                | ✅    |
| upload-attachment                   | ✅    | ✅        | ✖️   | ✅             | ✅                | ✅    |
| upload-attachment-owner             | ✖️    | ✖️        | ✅   | ✖️             | ✖️                | ✖️    |

### Scope `gaming`

| Permission ID                       | admin | moderator | user | channel_member | channel_moderator |
| ----------------------------------- | ----- | --------- | ---- | -------------- | ----------------- |
| add-links                           | ✅    | ✅        | ✖️   | ✅             | ✅                |
| add-links-owner                     | ✖️    | ✖️        | ✅   | ✖️             | ✖️                |
| ban-channel-member                  | ✅    | ✅        | ✖️   | ✖️             | ✅                |
| ban-user                            | ✅    | ✅        | ✖️   | ✖️             | ✖️                |
| create-call                         | ✅    | ✅        | ✖️   | ✅             | ✅                |
| create-channel                      | ✅    | ✖️        | ✖️   | ✖️             | ✖️                |
| create-message                      | ✅    | ✅        | ✖️   | ✅             | ✅                |
| create-message-owner                | ✖️    | ✖️        | ✅   | ✖️             | ✖️                |
| create-attachment                   | ✅    | ✅        | ✖️   | ✅             | ✅                |
| create-attachment-owner             | ✖️    | ✖️        | ✅   | ✖️             | ✖️                |
| create-mention                      | ✅    | ✅        | ✖️   | ✅             | ✅                |
| create-mention-owner                | ✖️    | ✖️        | ✅   | ✖️             | ✖️                |
| create-reaction                     | ✅    | ✅        | ✖️   | ✅             | ✅                |
| create-reaction-owner               | ✖️    | ✖️        | ✅   | ✖️             | ✖️                |
| create-system-message               | ✅    | ✅        | ✖️   | ✖️             | ✅                |
| delete-attachment                   | ✅    | ✅        | ✖️   | ✖️             | ✅                |
| delete-attachment-owner             | ✖️    | ✖️        | ✅   | ✖️             | ✖️                |
| delete-channel                      | ✅    | ✖️        | ✖️   | ✖️             | ✖️                |
| delete-message                      | ✅    | ✅        | ✖️   | ✖️             | ✅                |
| delete-message-owner                | ✖️    | ✖️        | ✅   | ✖️             | ✖️                |
| delete-reaction                     | ✅    | ✅        | ✖️   | ✖️             | ✅                |
| delete-reaction-owner               | ✖️    | ✖️        | ✅   | ✖️             | ✖️                |
| flag-message                        | ✅    | ✅        | ✖️   | ✅             | ✅                |
| flag-message-owner                  | ✖️    | ✖️        | ✅   | ✖️             | ✖️                |
| join-call                           | ✅    | ✅        | ✖️   | ✅             | ✅                |
| mute-channel                        | ✅    | ✅        | ✖️   | ✅             | ✅                |
| mute-channel-owner                  | ✖️    | ✖️        | ✅   | ✖️             | ✖️                |
| pin-message                         | ✅    | ✅        | ✖️   | ✖️             | ✅                |
| read-channel                        | ✅    | ✅        | ✖️   | ✅             | ✅                |
| read-channel-members                | ✅    | ✅        | ✖️   | ✅             | ✅                |
| read-channel-members-owner          | ✖️    | ✖️        | ✅   | ✖️             | ✖️                |
| read-channel-owner                  | ✖️    | ✖️        | ✅   | ✖️             | ✖️                |
| read-message-flags                  | ✅    | ✅        | ✖️   | ✖️             | ✅                |
| recreate-channel                    | ✅    | ✖️        | ✖️   | ✖️             | ✖️                |
| remove-own-channel-membership       | ✅    | ✅        | ✖️   | ✅             | ✅                |
| remove-own-channel-membership-owner | ✖️    | ✖️        | ✅   | ✖️             | ✖️                |
| run-message-action                  | ✅    | ✅        | ✖️   | ✅             | ✅                |
| run-message-action-owner            | ✖️    | ✖️        | ✅   | ✖️             | ✖️                |
| send-custom-event                   | ✅    | ✅        | ✖️   | ✅             | ✅                |
| send-custom-event-owner             | ✖️    | ✖️        | ✅   | ✖️             | ✖️                |
| skip-channel-cooldown               | ✅    | ✅        | ✖️   | ✖️             | ✅                |
| skip-message-moderation             | ✅    | ✅        | ✖️   | ✖️             | ✅                |
| truncate-channel                    | ✅    | ✖️        | ✖️   | ✖️             | ✖️                |
| unblock-message                     | ✅    | ✅        | ✖️   | ✖️             | ✅                |
| update-channel                      | ✅    | ✖️        | ✖️   | ✖️             | ✖️                |
| update-channel-cooldown             | ✅    | ✅        | ✖️   | ✖️             | ✅                |
| update-channel-frozen               | ✅    | ✅        | ✖️   | ✖️             | ✅                |
| update-channel-members              | ✅    | ✖️        | ✖️   | ✖️             | ✖️                |
| update-message                      | ✅    | ✅        | ✖️   | ✖️             | ✅                |
| update-message-owner                | ✖️    | ✖️        | ✅   | ✖️             | ✖️                |
| upload-attachment                   | ✅    | ✅        | ✖️   | ✅             | ✅                |
| upload-attachment-owner             | ✖️    | ✖️        | ✅   | ✖️             | ✖️                |

## Multi-Tenant Default Grants

In tables below you will find default permission grants for builtin roles that designed for multi-tenant applications. They are useful for [multi-tenant applications](/chat/docs/node/multi_tenant_chat/) only.

By default, for multi-tenant applications, all objects (users, channels, and messages) must belong to the same team to be able to interact. These multi-tenant permissions enable overriding that behavior, so that certain users can have permissions to interact with objects on any team

### Scope `video:livestream`

| Permission ID |
| ------------- |

### Scope `video:development`

| Permission ID |
| ------------- |

### Scope `.app`

| Permission ID               | global_moderator | global_admin |
| --------------------------- | ---------------- | ------------ |
| flag-user-any-team          | ✅               | ✅           |
| mute-user-any-team          | ✅               | ✅           |
| read-flag-reports-any-team  | ✅               | ✅           |
| search-user-any-team        | ✅               | ✅           |
| update-flag-report-any-team | ✅               | ✅           |
| update-user-owner           | ✅               | ✅           |

### Scope `video:audio_room`

| Permission ID |
| ------------- |

### Scope `video:default`

| Permission ID |
| ------------- |

### Scope `messaging`

| Permission ID                          | global_moderator | global_admin |
| -------------------------------------- | ---------------- | ------------ |
| add-links-any-team                     | ✅               | ✅           |
| ban-channel-member-any-team            | ✅               | ✅           |
| ban-user-any-team                      | ✅               | ✅           |
| create-call-any-team                   | ✅               | ✅           |
| create-channel-any-team                | ✅               | ✅           |
| create-message-any-team                | ✅               | ✅           |
| create-attachment-any-team             | ✅               | ✅           |
| create-mention-any-team                | ✅               | ✅           |
| create-reaction-any-team               | ✅               | ✅           |
| create-system-message-any-team         | ✅               | ✅           |
| delete-attachment-any-team             | ✅               | ✅           |
| delete-channel-any-team                | ✖️               | ✅           |
| delete-channel-owner-any-team          | ✅               | ✖️           |
| delete-message-any-team                | ✅               | ✅           |
| delete-reaction-any-team               | ✅               | ✅           |
| flag-message-any-team                  | ✅               | ✅           |
| join-call-any-team                     | ✅               | ✅           |
| mute-channel-any-team                  | ✅               | ✅           |
| pin-message-any-team                   | ✅               | ✅           |
| read-channel-any-team                  | ✅               | ✅           |
| read-channel-members-any-team          | ✅               | ✅           |
| read-message-flags-any-team            | ✅               | ✅           |
| recreate-channel-any-team              | ✖️               | ✅           |
| recreate-channel-owner-any-team        | ✅               | ✖️           |
| remove-own-channel-membership-any-team | ✅               | ✅           |
| run-message-action-any-team            | ✅               | ✅           |
| send-custom-event-any-team             | ✅               | ✅           |
| skip-channel-cooldown-any-team         | ✅               | ✅           |
| skip-message-moderation-any-team       | ✅               | ✅           |
| truncate-channel-any-team              | ✖️               | ✅           |
| truncate-channel-owner-any-team        | ✅               | ✖️           |
| unblock-message-any-team               | ✅               | ✅           |
| update-channel-any-team                | ✅               | ✅           |
| update-channel-cooldown-any-team       | ✅               | ✅           |
| update-channel-frozen-any-team         | ✅               | ✅           |
| update-channel-members-any-team        | ✅               | ✅           |
| update-message-any-team                | ✅               | ✅           |
| upload-attachment-any-team             | ✅               | ✅           |

### Scope `livestream`

| Permission ID                          | global_moderator | global_admin |
| -------------------------------------- | ---------------- | ------------ |
| add-links-any-team                     | ✅               | ✅           |
| ban-channel-member-any-team            | ✅               | ✅           |
| ban-user-any-team                      | ✅               | ✅           |
| create-call-any-team                   | ✅               | ✅           |
| create-channel-any-team                | ✅               | ✅           |
| create-message-any-team                | ✅               | ✅           |
| create-attachment-any-team             | ✅               | ✅           |
| create-mention-any-team                | ✅               | ✅           |
| create-reaction-any-team               | ✅               | ✅           |
| create-system-message-any-team         | ✅               | ✅           |
| delete-attachment-any-team             | ✅               | ✅           |
| delete-channel-any-team                | ✖️               | ✅           |
| delete-message-any-team                | ✅               | ✅           |
| delete-reaction-any-team               | ✅               | ✅           |
| flag-message-any-team                  | ✅               | ✅           |
| join-call-any-team                     | ✅               | ✅           |
| mute-channel-any-team                  | ✅               | ✅           |
| pin-message-any-team                   | ✅               | ✅           |
| read-channel-any-team                  | ✅               | ✅           |
| read-channel-members-any-team          | ✅               | ✅           |
| read-message-flags-any-team            | ✅               | ✅           |
| recreate-channel-any-team              | ✖️               | ✅           |
| remove-own-channel-membership-any-team | ✖️               | ✅           |
| run-message-action-any-team            | ✅               | ✅           |
| send-custom-event-any-team             | ✅               | ✅           |
| skip-channel-cooldown-any-team         | ✅               | ✅           |
| skip-message-moderation-any-team       | ✅               | ✅           |
| truncate-channel-any-team              | ✖️               | ✅           |
| unblock-message-any-team               | ✅               | ✅           |
| update-channel-any-team                | ✖️               | ✅           |
| update-channel-cooldown-any-team       | ✅               | ✅           |
| update-channel-frozen-any-team         | ✅               | ✅           |
| update-channel-members-any-team        | ✖️               | ✅           |
| update-message-any-team                | ✅               | ✅           |
| upload-attachment-any-team             | ✅               | ✅           |

### Scope `team`

| Permission ID                          | global_moderator | global_admin |
| -------------------------------------- | ---------------- | ------------ |
| add-links-any-team                     | ✅               | ✅           |
| ban-channel-member-any-team            | ✅               | ✅           |
| ban-user-any-team                      | ✅               | ✅           |
| create-call-any-team                   | ✅               | ✅           |
| create-channel-any-team                | ✅               | ✅           |
| create-message-any-team                | ✅               | ✅           |
| create-attachment-any-team             | ✅               | ✅           |
| create-mention-any-team                | ✅               | ✅           |
| create-reaction-any-team               | ✅               | ✅           |
| create-system-message-any-team         | ✅               | ✅           |
| delete-attachment-any-team             | ✅               | ✅           |
| delete-channel-any-team                | ✖️               | ✅           |
| delete-channel-owner-any-team          | ✅               | ✖️           |
| delete-message-any-team                | ✅               | ✅           |
| delete-reaction-any-team               | ✅               | ✅           |
| flag-message-any-team                  | ✅               | ✅           |
| join-call-any-team                     | ✅               | ✅           |
| mute-channel-any-team                  | ✅               | ✅           |
| pin-message-any-team                   | ✅               | ✅           |
| read-channel-any-team                  | ✅               | ✅           |
| read-channel-members-any-team          | ✅               | ✅           |
| read-message-flags-any-team            | ✅               | ✅           |
| recreate-channel-any-team              | ✖️               | ✅           |
| recreate-channel-owner-any-team        | ✅               | ✖️           |
| remove-own-channel-membership-any-team | ✅               | ✅           |
| run-message-action-any-team            | ✅               | ✅           |
| send-custom-event-any-team             | ✅               | ✅           |
| skip-channel-cooldown-any-team         | ✅               | ✅           |
| skip-message-moderation-any-team       | ✅               | ✅           |
| truncate-channel-any-team              | ✖️               | ✅           |
| truncate-channel-owner-any-team        | ✅               | ✖️           |
| unblock-message-any-team               | ✅               | ✅           |
| update-channel-any-team                | ✅               | ✅           |
| update-channel-cooldown-any-team       | ✅               | ✅           |
| update-channel-frozen-any-team         | ✅               | ✅           |
| update-channel-members-any-team        | ✅               | ✅           |
| update-message-any-team                | ✅               | ✅           |
| upload-attachment-any-team             | ✅               | ✅           |

### Scope `commerce`

| Permission ID                          | global_moderator | global_admin |
| -------------------------------------- | ---------------- | ------------ |
| add-links-any-team                     | ✅               | ✅           |
| ban-channel-member-any-team            | ✅               | ✅           |
| ban-user-any-team                      | ✅               | ✅           |
| create-call-any-team                   | ✅               | ✅           |
| create-channel-any-team                | ✅               | ✅           |
| create-message-any-team                | ✅               | ✅           |
| create-attachment-any-team             | ✅               | ✅           |
| create-mention-any-team                | ✅               | ✅           |
| create-reaction-any-team               | ✅               | ✅           |
| create-system-message-any-team         | ✅               | ✅           |
| delete-attachment-any-team             | ✅               | ✅           |
| delete-channel-any-team                | ✖️               | ✅           |
| delete-message-any-team                | ✅               | ✅           |
| delete-reaction-any-team               | ✅               | ✅           |
| flag-message-any-team                  | ✅               | ✅           |
| join-call-any-team                     | ✅               | ✅           |
| mute-channel-any-team                  | ✅               | ✅           |
| pin-message-any-team                   | ✅               | ✅           |
| read-channel-any-team                  | ✅               | ✅           |
| read-channel-members-any-team          | ✅               | ✅           |
| read-message-flags-any-team            | ✅               | ✅           |
| recreate-channel-any-team              | ✖️               | ✅           |
| remove-own-channel-membership-any-team | ✅               | ✅           |
| run-message-action-any-team            | ✅               | ✅           |
| send-custom-event-any-team             | ✅               | ✅           |
| skip-channel-cooldown-any-team         | ✅               | ✅           |
| skip-message-moderation-any-team       | ✅               | ✅           |
| truncate-channel-any-team              | ✖️               | ✅           |
| unblock-message-any-team               | ✅               | ✅           |
| update-channel-any-team                | ✅               | ✅           |
| update-channel-cooldown-any-team       | ✅               | ✅           |
| update-channel-frozen-any-team         | ✅               | ✅           |
| update-channel-members-any-team        | ✅               | ✅           |
| update-message-any-team                | ✅               | ✅           |
| upload-attachment-any-team             | ✅               | ✅           |

### Scope `gaming`

| Permission ID                          | global_moderator | global_admin |
| -------------------------------------- | ---------------- | ------------ |
| add-links-any-team                     | ✅               | ✅           |
| ban-channel-member-any-team            | ✅               | ✅           |
| ban-user-any-team                      | ✅               | ✅           |
| create-call-any-team                   | ✅               | ✅           |
| create-channel-any-team                | ✖️               | ✅           |
| create-message-any-team                | ✅               | ✅           |
| create-attachment-any-team             | ✅               | ✅           |
| create-mention-any-team                | ✅               | ✅           |
| create-reaction-any-team               | ✅               | ✅           |
| create-system-message-any-team         | ✅               | ✅           |
| delete-attachment-any-team             | ✅               | ✅           |
| delete-channel-any-team                | ✖️               | ✅           |
| delete-message-any-team                | ✅               | ✅           |
| delete-reaction-any-team               | ✅               | ✅           |
| flag-message-any-team                  | ✅               | ✅           |
| join-call-any-team                     | ✅               | ✅           |
| mute-channel-any-team                  | ✅               | ✅           |
| pin-message-any-team                   | ✅               | ✅           |
| read-channel-any-team                  | ✅               | ✅           |
| read-channel-members-any-team          | ✅               | ✅           |
| read-message-flags-any-team            | ✅               | ✅           |
| recreate-channel-any-team              | ✖️               | ✅           |
| remove-own-channel-membership-any-team | ✅               | ✅           |
| run-message-action-any-team            | ✅               | ✅           |
| send-custom-event-any-team             | ✅               | ✅           |
| skip-channel-cooldown-any-team         | ✅               | ✅           |
| skip-message-moderation-any-team       | ✅               | ✅           |
| truncate-channel-any-team              | ✖️               | ✅           |
| unblock-message-any-team               | ✅               | ✅           |
| update-channel-any-team                | ✖️               | ✅           |
| update-channel-cooldown-any-team       | ✅               | ✅           |
| update-channel-frozen-any-team         | ✅               | ✅           |
| update-channel-members-any-team        | ✖️               | ✅           |
| update-message-any-team                | ✅               | ✅           |
| upload-attachment-any-team             | ✅               | ✅           |
