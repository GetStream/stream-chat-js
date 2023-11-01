# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

## [8.14.0](https://github.com/GetStream/stream-chat-js/compare/v8.13.1...v8.14.0) (2023-11-01)


### Features

* axios upgrade to v1 ([#1192](https://github.com/GetStream/stream-chat-js/issues/1192)) ([77b8bc8](https://github.com/GetStream/stream-chat-js/commit/77b8bc8964b5a454dafbc4fe81415570b5def45e))

### [8.13.1](https://github.com/GetStream/stream-chat-js/compare/v8.13.0...v8.13.1) (2023-10-19)


### Bug Fixes

* undefined values in query params ([#1187](https://github.com/GetStream/stream-chat-js/issues/1187)) ([a325737](https://github.com/GetStream/stream-chat-js/commit/a325737d8318e58d891d7106b543b1a36ed401a0))

## [8.13.0](https://github.com/GetStream/stream-chat-js/compare/v8.12.4...v8.13.0) (2023-10-16)


### Features

* support for SNS ([#1185](https://github.com/GetStream/stream-chat-js/issues/1185)) ([9a4bdfb](https://github.com/GetStream/stream-chat-js/commit/9a4bdfb68424cc02083c1e05f8512900696c0efc))

### [8.12.4](https://github.com/GetStream/stream-chat-js/compare/v8.12.3...v8.12.4) (2023-10-06)


### Bug Fixes

* evaluate channel.lastRead when channel is not initialized ([#1183](https://github.com/GetStream/stream-chat-js/issues/1183)) ([13fa28a](https://github.com/GetStream/stream-chat-js/commit/13fa28a75ca623fc5b7b328aaa9edb3e87f99f1c))

### [8.12.3](https://github.com/GetStream/stream-chat-js/compare/v8.12.2...v8.12.3) (2023-10-03)


### Bug Fixes

* queue channel WS events until the channel is initialized ([#1179](https://github.com/GetStream/stream-chat-js/issues/1179)) ([2073579](https://github.com/GetStream/stream-chat-js/commit/2073579ecfe4e8a1d5d37aa7f0a43b53bb57cd02))

### [8.12.2](https://github.com/GetStream/stream-chat-js/compare/v8.12.1...v8.12.2) (2023-10-03)


### Bug Fixes

* axios param serializer to comply with RFC 3986 ([#1180](https://github.com/GetStream/stream-chat-js/issues/1180)) ([d2ff8ec](https://github.com/GetStream/stream-chat-js/commit/d2ff8ecc68bd6a48fe76bc22ab8404b6cfa42a85)), closes https://github.com/GetStream/stream-chat-react-native/issues/2235

### [8.12.1](https://github.com/GetStream/stream-chat-js/compare/v8.12.0...v8.12.1) (2023-09-20)


### Bug Fixes

* allow search with offset and sort ([d0c3f35](https://github.com/GetStream/stream-chat-js/commit/d0c3f357e8f559d2e60922098223525f9b06da8e))
* allow search with offset and sort ([#1174](https://github.com/GetStream/stream-chat-js/issues/1174)) ([fd24276](https://github.com/GetStream/stream-chat-js/commit/fd242769717ef44068cacd61503aa0d958febabc))
* remove unused unread count api endpoint ([33823be](https://github.com/GetStream/stream-chat-js/commit/33823be128ad917bec51447038e34f56256f8986))

## [8.12.0](https://github.com/GetStream/stream-chat-js/compare/v8.11.0...v8.12.0) (2023-09-18)


### Features

* add field deleted_reply_count to MessageResponseBase ([#1172](https://github.com/GetStream/stream-chat-js/issues/1172)) ([f350692](https://github.com/GetStream/stream-chat-js/commit/f35069251740c9831816ce36c1e2ff73d03a4b09))
* declare and export types SendMessageOptions and UpdateMessageOptions ([#1170](https://github.com/GetStream/stream-chat-js/issues/1170)) ([8a2ad69](https://github.com/GetStream/stream-chat-js/commit/8a2ad699e058016b61ecef91c8c782c4cb0c9be7))


### Bug Fixes

* handle getting channel by members with channel id explicitly undefined ([#1169](https://github.com/GetStream/stream-chat-js/issues/1169)) ([a721b59](https://github.com/GetStream/stream-chat-js/commit/a721b591bf3fbde3a59116eeb63f4a15f3f3d389))

## [8.11.0](https://github.com/GetStream/stream-chat-js/compare/v8.10.1...v8.11.0) (2023-08-21)


### Features

* add the option to exclude expired bans ([#1147](https://github.com/GetStream/stream-chat-js/issues/1147)) ([9a488a6](https://github.com/GetStream/stream-chat-js/commit/9a488a6d66c00daf6b932f954be4ca470338b004))
* update last_read_message_id on message.read ([#1155](https://github.com/GetStream/stream-chat-js/issues/1155)) ([83f1c56](https://github.com/GetStream/stream-chat-js/commit/83f1c5640d6df1cb928c0a774bce6b43726366a4))


### Bug Fixes

* add geofences type ([#1148](https://github.com/GetStream/stream-chat-js/issues/1148)) ([31da90b](https://github.com/GetStream/stream-chat-js/commit/31da90b4a2ef881284f07268e06a2600cebea97c))
* add missing property 'silent' to MessageBase type ([#1154](https://github.com/GetStream/stream-chat-js/issues/1154)) ([ba30397](https://github.com/GetStream/stream-chat-js/commit/ba30397fed441bc797836806129117f9707b83e0))

### [8.10.1](https://github.com/GetStream/stream-chat-js/compare/v8.10.0...v8.10.1) (2023-07-06)


### Bug Fixes

* remove unused unread count api endpoint ([#1143](https://github.com/GetStream/stream-chat-js/issues/1143)) ([5700abd](https://github.com/GetStream/stream-chat-js/commit/5700abdb072e41c23e4439b8fb01eafd1993d5e8))

## [8.10.0](https://github.com/GetStream/stream-chat-js/compare/v8.9.0...v8.10.0) (2023-07-03)


### Features

* added 'pending' property to message ([#1137](https://github.com/GetStream/stream-chat-js/issues/1137)) ([6209380](https://github.com/GetStream/stream-chat-js/commit/6209380e145e9f6ffcde3abd282effed24540172))

### Bug Fixes

* prevent truncating message timestamps when updating references to deleted quoted message ([#1141](https://github.com/GetStream/stream-chat-js/issues/1141)) ([ab54f94](https://github.com/GetStream/stream-chat-js/commit/ab54f94a384a772902027f50f84038ac01cbf728))

## [8.9.0](https://github.com/GetStream/stream-chat-js/compare/v8.8.0...v8.9.0) (2023-06-09)


### Features

* reflect user ban events in channel members state ([#1128](https://github.com/GetStream/stream-chat-js/issues/1128)) ([ff0e134](https://github.com/GetStream/stream-chat-js/commit/ff0e134cb01253c9901ac9bff1f60b7d0ec4c263))


### Bug Fixes

* change the value of channel.data.hidden to false when message.new event triggers ([#1115](https://github.com/GetStream/stream-chat-js/issues/1115)) ([9ecd345](https://github.com/GetStream/stream-chat-js/commit/9ecd3453933aff34f015a288d125e6146a8b1caa))

## [8.8.0](https://github.com/GetStream/stream-chat-js/compare/v8.7.0...v8.8.0) (2023-05-25)


### Bug Fixes

* disallow pending message feature on client side ([#1127](https://github.com/GetStream/stream-chat-js/issues/1127)) ([7b60e47](https://github.com/GetStream/stream-chat-js/commit/7b60e47c5e51d5b692eb9552a827d5450a066987))

## [8.7.0](https://github.com/GetStream/stream-chat-js/compare/v8.6.0...v8.7.0) (2023-05-17)

## [8.6.0](https://github.com/GetStream/stream-chat-js/compare/v8.5.0...v8.6.0) (2023-04-24)


### Features

* do not delete the active channel if offlineMode is true ([#1116](https://github.com/GetStream/stream-chat-js/issues/1116)) ([2004e28](https://github.com/GetStream/stream-chat-js/commit/2004e28b9fb49ee50e7c46c93c855076bb9172f3))
* receive last_read_message_id from server ([#1113](https://github.com/GetStream/stream-chat-js/issues/1113)) ([64e9165](https://github.com/GetStream/stream-chat-js/commit/64e916578bc61802822a8ff51430fd8dd2baa5ec))


### Bug Fixes

* change typing of verifyWebhook and patch security issue ([#1090](https://github.com/GetStream/stream-chat-js/issues/1090)) ([716db00](https://github.com/GetStream/stream-chat-js/commit/716db00117f77bf9d251374fdae091863a96ca46))

## [8.5.0](https://github.com/GetStream/stream-chat-js/compare/v8.4.1...v8.5.0) (2023-03-29)


### Features

* hide channel for creator ([#1109](https://github.com/GetStream/stream-chat-js/issues/1109)) ([b1d36cd](https://github.com/GetStream/stream-chat-js/commit/b1d36cd7cbc14a086fc0169890d20b071a286d52))

### [8.4.1](https://github.com/GetStream/stream-chat-js/compare/v8.4.0...v8.4.1) (2023-02-20)

## [8.4.0](https://github.com/GetStream/stream-chat-js/compare/v8.3.0...v8.4.0) (2023-02-15)


### Features

* extend SendMessage to server-side moderation API ([#1094](https://github.com/GetStream/stream-chat-js/issues/1094)) ([f93d8bf](https://github.com/GetStream/stream-chat-js/commit/f93d8bf12d5ddd55268b20ef7190946785c531f7))

## [8.3.0](https://github.com/GetStream/stream-chat-js/compare/v8.2.1...v8.3.0) (2023-01-19)


### Features

* add markUnread method ([#1087](https://github.com/GetStream/stream-chat-js/issues/1087)) ([bc64ccf](https://github.com/GetStream/stream-chat-js/commit/bc64ccf109a858360d03d76fd1b78032f1a2b696))

### [8.2.1](https://github.com/GetStream/stream-chat-js/compare/v8.2.0...v8.2.1) (2023-01-02)


### Bug Fixes

* bump jwt v9 ([#1082](https://github.com/GetStream/stream-chat-js/issues/1082)) ([6c17844](https://github.com/GetStream/stream-chat-js/commit/6c17844a903f4fae99bd843fe79f32fe7e2f3b06))

## [8.2.0](https://github.com/GetStream/stream-chat-js/compare/v8.1.3...v8.2.0) (2022-12-24)


### Features

* add batch method for deactivate and reactivate users ([#1074](https://github.com/GetStream/stream-chat-js/issues/1074)) ([b6d14ab](https://github.com/GetStream/stream-chat-js/commit/b6d14aba0b64686ed719946c9c212bebf7157b01))

### [8.1.3](https://github.com/GetStream/stream-chat-js/compare/v8.1.2...v8.1.3) (2022-12-05)

### [8.1.2](https://github.com/GetStream/stream-chat-js/compare/v8.1.1...v8.1.2) (2022-11-18)

### [8.1.1](https://github.com/GetStream/stream-chat-js/compare/v8.1.0...v8.1.1) (2022-11-15)


### Features

* allow optimistically added messages in local state ([#1064](https://github.com/GetStream/stream-chat-js/issues/1064)) ([16d9363](https://github.com/GetStream/stream-chat-js/commit/16d9363e59e2ac6ce25fd87174afb14e85505dbb))


### Bug Fixes

* add missing property "joined" to ChannelResponse type ([#1066](https://github.com/GetStream/stream-chat-js/issues/1066)) ([5602322](https://github.com/GetStream/stream-chat-js/commit/5602322ded1e9914ee40f0112f5c48cbf83e0fb1))
* set local device's check for alive websocket connection ([#1067](https://github.com/GetStream/stream-chat-js/issues/1067)) ([a47b55b](https://github.com/GetStream/stream-chat-js/commit/a47b55b1158b99a82892bad6ef9336ff45d9b932))

## [8.1.0](https://github.com/GetStream/stream-chat-js/compare/v8.0.0...v8.1.0) (2022-11-01)


### Features

* commit message endpoint ([#1060](https://github.com/GetStream/stream-chat-js/issues/1060)) ([8927c64](https://github.com/GetStream/stream-chat-js/commit/8927c6447f82ef3ba97898c449ed00ba029ca3a1))
* restore users endpoint ([#1057](https://github.com/GetStream/stream-chat-js/issues/1057)) ([a86411f](https://github.com/GetStream/stream-chat-js/commit/a86411fb4b35e24e839ac180aae30af00355fc61))

## [8.0.0](https://github.com/GetStream/stream-chat-js/compare/v7.2.0...v8.0.0) (2022-10-12)


### Bug Fixes

* crypto.getRandomValues check for older node versions and min nod… ([#1053](https://github.com/GetStream/stream-chat-js/issues/1053)) ([3a5f6f6](https://github.com/GetStream/stream-chat-js/commit/3a5f6f65876fa6f53d404e8af23266d712b0d270))

### ⚠ BREAKING CHANGES
* compatible node version changed to >=v16

## [7.2.0](https://github.com/GetStream/stream-chat-js/compare/v7.1.0...v7.2.0) (2022-10-11)


### Features

* support cancelling http requests ([#1048](https://github.com/GetStream/stream-chat-js/issues/1048)) ([db719d1](https://github.com/GetStream/stream-chat-js/commit/db719d135e2e950478c5fb5f2ab2d73dfbc1cf5d))


### Bug Fixes

* don't keep removed users when reinitializing channel ([#1044](https://github.com/GetStream/stream-chat-js/issues/1044)) ([c61f55a](https://github.com/GetStream/stream-chat-js/commit/c61f55a666a1965189a0bcf2469c92a842bc0fe1))
* update client to use channel.cid as config keys ([#1047](https://github.com/GetStream/stream-chat-js/issues/1047)) ([aaf5c4c](https://github.com/GetStream/stream-chat-js/commit/aaf5c4c90e562bd26b0fe4fb7460109b7fc86837))

## [7.1.0](https://github.com/GetStream/stream-chat-js/compare/v7.0.0...v7.1.0) (2022-09-02)


### Features

* async moderation config in app settings ([#1039](https://github.com/GetStream/stream-chat-js/issues/1039)) ([54863d0](https://github.com/GetStream/stream-chat-js/commit/54863d0d66b56db221908bd77bc20ef9d7606be5))
* campaign missing pieces ([#1028](https://github.com/GetStream/stream-chat-js/issues/1028)) ([edbcbe2](https://github.com/GetStream/stream-chat-js/commit/edbcbe212e78b1f764e7f05f77813e0f33a1fd55))
* campaign type updates ([#1041](https://github.com/GetStream/stream-chat-js/issues/1041)) ([0f674e7](https://github.com/GetStream/stream-chat-js/commit/0f674e7cf2eaa89fcd0379def2d9c2091fcb1e3a))

## [7.0.0](https://github.com/GetStream/stream-chat-js/compare/v6.9.0...v7.0.0) (2022-08-23)


### Features

* changes to support offline feature ([#1011](https://github.com/GetStream/stream-chat-js/issues/1011)) ([f8300e7](https://github.com/GetStream/stream-chat-js/commit/f8300e73d7a57e9e37a584a7d1a10f6226ed3223))
* replaces console.warn instead throwing error when event is not valid ([#1037](https://github.com/GetStream/stream-chat-js/issues/1037)) ([90e3097](https://github.com/GetStream/stream-chat-js/commit/90e3097d67f19e18004ae8dbbd40a9bf79a9ead1))

## [6.9.0](https://github.com/GetStream/stream-chat-js/compare/v6.8.0...v6.9.0) (2022-08-18)


### Features

* support limit for load message into state ([#1031](https://github.com/GetStream/stream-chat-js/issues/1031)) ([2968785](https://github.com/GetStream/stream-chat-js/commit/2968785b821d355257f363b42ffcb7c45d6509e9))


### Bug Fixes

* do not mutate settings param ([#1032](https://github.com/GetStream/stream-chat-js/issues/1032)) ([a516cc1](https://github.com/GetStream/stream-chat-js/commit/a516cc1c0baa6d5fea3ece13bdf584c9d2641e65))
* update partial and query do not update channel.data ([#1033](https://github.com/GetStream/stream-chat-js/issues/1033)) ([c9ab4a4](https://github.com/GetStream/stream-chat-js/commit/c9ab4a4f727cf54765c594bff4034514fd0b0b44))

## [6.8.0](https://github.com/GetStream/stream-chat-js/compare/v6.7.3...v6.8.0) (2022-08-11)


### Features

* add more sync function types ([#1024](https://github.com/GetStream/stream-chat-js/issues/1024)) ([b34fe11](https://github.com/GetStream/stream-chat-js/commit/b34fe115867c9af8c172804271b38ba4bc422c31))
* add pending message in send message request and response ([#1016](https://github.com/GetStream/stream-chat-js/issues/1016)) ([db32e24](https://github.com/GetStream/stream-chat-js/commit/db32e24a1b1e7aef793fe9de7a6819185f770f5e))
* get pending message with metadata ([#1026](https://github.com/GetStream/stream-chat-js/issues/1026)) ([62e81f8](https://github.com/GetStream/stream-chat-js/commit/62e81f8252fe65b66a9c2219a7a72d06213fd798))
* pending messages in channel response ([#1019](https://github.com/GetStream/stream-chat-js/issues/1019)) ([1db90fe](https://github.com/GetStream/stream-chat-js/commit/1db90fe99f76f16c6fc7c1d8ddb8d15f13ddacf6))
* pending messages in channel state ([#1023](https://github.com/GetStream/stream-chat-js/issues/1023)) ([252c6e3](https://github.com/GetStream/stream-chat-js/commit/252c6e3c713c177249195f5ea6f96abec4c4706c))


### Bug Fixes

* message update and delete events override own reactions ([#1009](https://github.com/GetStream/stream-chat-js/issues/1009)) ([fe1ad64](https://github.com/GetStream/stream-chat-js/commit/fe1ad64ab2c3870f1153e5b9ea83e215e4cc6f5b))
* race condition of query channels and ws connection ([#1029](https://github.com/GetStream/stream-chat-js/issues/1029)) ([f3a9ab4](https://github.com/GetStream/stream-chat-js/commit/f3a9ab4cbe2d04b9567d5b8545dda0540f74b2f4))

### [6.7.3](https://github.com/GetStream/stream-chat-js/compare/v6.7.2...v6.7.3) (2022-07-06)


### Bug Fixes

* some app setting types ([#1003](https://github.com/GetStream/stream-chat-js/issues/1003)) ([35c13a1](https://github.com/GetStream/stream-chat-js/commit/35c13a179301a0f16b03c54d7e7b88bd3beba6aa))

### [6.7.2](https://github.com/GetStream/stream-chat-js/compare/v6.7.1...v6.7.2) (2022-06-27)


### Bug Fixes

* pinnedMesages truncated_at aware ([#996](https://github.com/GetStream/stream-chat-js/issues/996)) ([fa0bfdc](https://github.com/GetStream/stream-chat-js/commit/fa0bfdc69399a98e56674e31f00cca55066c8ef8))

### [6.7.1](https://github.com/GetStream/stream-chat-js/compare/v6.7.0...v6.7.1) (2022-06-24)


### Bug Fixes

* **Channel:** add "truncated_at" to "channel.truncated" event handler  ([#991](https://github.com/GetStream/stream-chat-js/issues/991)) ([edffd5f](https://github.com/GetStream/stream-chat-js/commit/edffd5f38f3c56abe03048d3afc5cd70a12c7f4e))

## [6.7.0](https://github.com/GetStream/stream-chat-js/compare/v6.6.0...v6.7.0) (2022-06-22)


### Bug Fixes

* **feat:** add `first_reporter` field to the `FlagReport` type ([#987](https://github.com/GetStream/stream-chat-js/pull/987)) ([0667f2e](https://github.com/GetStream/stream-chat-js/pull/987/commits/0667f2ee2693bf2e7e74132e3715f49a421c6bfa))

* **types:** added support for thumb_url for video attachments in send file response ([#982](https://github.com/GetStream/stream-chat-js/issues/982)) ([79ed099](https://github.com/GetStream/stream-chat-js/commit/79ed099678c69ac5841f89cd521adab5f3eef8ff))

## [6.6.0](https://github.com/GetStream/stream-chat-js/compare/v6.5.1...v6.6.0) (2022-06-02)


### Features

* **eventmap:** add user.unread_message_reminder ([#972](https://github.com/GetStream/stream-chat-js/issues/972)) ([f70de60](https://github.com/GetStream/stream-chat-js/commit/f70de60662a372607bd1fabe0651d1c86b90a6a9))


### Bug Fixes

* add TestCampaignResponse type ([#967](https://github.com/GetStream/stream-chat-js/issues/967)) ([2c2e0c8](https://github.com/GetStream/stream-chat-js/commit/2c2e0c8c9d53c3fac7b229a01463417b89f3aae7))
* **delete_user:** add task_id to deleteuser response ([#963](https://github.com/GetStream/stream-chat-js/issues/963)) ([0090f93](https://github.com/GetStream/stream-chat-js/commit/0090f9340675d9813600fbcc090e8ba239952ed3))
* rename field ([#966](https://github.com/GetStream/stream-chat-js/issues/966)) ([6c34e92](https://github.com/GetStream/stream-chat-js/commit/6c34e9265a524117de99d4c29712dfe27b3e0d72))
* **types:** add types to support permission migration parameters ([#976](https://github.com/GetStream/stream-chat-js/issues/976)) ([6f82e1a](https://github.com/GetStream/stream-chat-js/commit/6f82e1a4d96d86db77b7c4b365500bb769866e2c))

### [6.5.1](https://github.com/GetStream/stream-chat-js/compare/v6.5.0...v6.5.1) (2022-04-22)


### Bug Fixes

* multiple ws connections due to redundant openConnection calls ([#960](https://github.com/GetStream/stream-chat-js/issues/960)) ([8150199](https://github.com/GetStream/stream-chat-js/commit/815019977fb4587c849a575373a53af40d4eab03))

## [6.5.0](https://github.com/GetStream/stream-chat-js/compare/v6.4.0...v6.5.0) (2022-04-15)


### Features

* add apn template types ([#947](https://github.com/GetStream/stream-chat-js/issues/947)) ([f8b1faa](https://github.com/GetStream/stream-chat-js/commit/f8b1faa4f4927172b9d62c7b4870295793ccbe15))
* add types for offline flag of push ([#946](https://github.com/GetStream/stream-chat-js/issues/946)) ([5eced26](https://github.com/GetStream/stream-chat-js/commit/5eced26a2c90707f514c5fef4b0a6fddbc8870dc))


### Bug Fixes

* mark all active channels as read only if notification.mark_read event's unread_channels is 0 ([#955](https://github.com/GetStream/stream-chat-js/issues/955)) ([8d2e3ca](https://github.com/GetStream/stream-chat-js/commit/8d2e3ca10929ef7389b157bb4a6ada71c7074e6b))

## [6.4.0](https://github.com/GetStream/stream-chat-js/compare/v6.3.0...v6.4.0) (2022-04-05)


### Features

* add multi bundle into devices ([#932](https://github.com/GetStream/stream-chat-js/issues/932)) ([014e470](https://github.com/GetStream/stream-chat-js/commit/014e470da6223b6d4920336e3094b887ec6eb74f))
* add provider filtering into check push ([#933](https://github.com/GetStream/stream-chat-js/issues/933)) ([2a4c7ec](https://github.com/GetStream/stream-chat-js/commit/2a4c7ece23656e1c19aa81913483e056b3d5ce2e))
* add reminders feature ([#935](https://github.com/GetStream/stream-chat-js/issues/935)) ([9ae3438](https://github.com/GetStream/stream-chat-js/commit/9ae3438cfbe0abe1affc6f9dbdd52d7a06add60a))
* added import mode ([#927](https://github.com/GetStream/stream-chat-js/issues/927)) ([c7679f2](https://github.com/GetStream/stream-chat-js/commit/c7679f243f25e387445327b18045fb5194001e46))
* **truncate:** add truncated by options ([#938](https://github.com/GetStream/stream-chat-js/issues/938)) ([a7637da](https://github.com/GetStream/stream-chat-js/commit/a7637da3382743f71479d9a32c0201e35bfb757c))


### Bug Fixes

* added missing push and reminders related types  ([#942](https://github.com/GetStream/stream-chat-js/issues/942)) ([b7543eb](https://github.com/GetStream/stream-chat-js/commit/b7543eba66eb5ac3a04e353ef3dd3c2053b2fedc))
* catch tokenProvider rejection ([#934](https://github.com/GetStream/stream-chat-js/issues/934)) ([250aea6](https://github.com/GetStream/stream-chat-js/commit/250aea61d028a66999a4870d6617dfaed847b10b))
* Thread reply preview not added to channel state ([#940](https://github.com/GetStream/stream-chat-js/issues/940)) ([38d78af](https://github.com/GetStream/stream-chat-js/commit/38d78aff2bafa8068261ee3ca4c0b2240affca07))
* types of fields in ChannelSort ([#941](https://github.com/GetStream/stream-chat-js/issues/941)) ([d8a2d38](https://github.com/GetStream/stream-chat-js/commit/d8a2d38d98f51d34c1d56c9964f8501b3c00b29f))

## [6.3.0](https://github.com/GetStream/stream-chat-js/compare/v6.2.0...v6.3.0) (2022-03-23)


### Features

* add provider management ([#930](https://github.com/GetStream/stream-chat-js/issues/930)) ([2d35b81](https://github.com/GetStream/stream-chat-js/commit/2d35b81e18dba5d8f66c8b4ecac3753ed425ced9))
* add types for get app providers ([#929](https://github.com/GetStream/stream-chat-js/issues/929)) ([610e98d](https://github.com/GetStream/stream-chat-js/commit/610e98d0648096f7a806188027d7fb54cf136ba1))
* Jump to message ([#851](https://github.com/GetStream/stream-chat-js/issues/851)) ([6eca258](https://github.com/GetStream/stream-chat-js/commit/6eca2583a6392f9aa9fab13f12fbf026ce887c36))

## [6.2.0](https://github.com/GetStream/stream-chat-js/compare/v6.1.0...v6.2.0) (2022-03-10)


### Features

* add giphy size customisation data support ([#921](https://github.com/GetStream/stream-chat-js/issues/921)) ([140cb6a](https://github.com/GetStream/stream-chat-js/commit/140cb6acb4cdb10089f5a419747178a6f1a2142d))


### Bug Fixes

* add types for returned push creds ([#922](https://github.com/GetStream/stream-chat-js/issues/922)) ([1523889](https://github.com/GetStream/stream-chat-js/commit/1523889f28b6ceb09d18e44f4c1060deedbc27a5))

## [6.1.0](https://github.com/GetStream/stream-chat-js/compare/v6.0.0...v6.1.0) (2022-03-07)


### Features

* **moderation:** add _queryFlags function ([#913](https://github.com/GetStream/stream-chat-js/issues/913)) ([b86f0d5](https://github.com/GetStream/stream-chat-js/commit/b86f0d5bff7ebbf4ba2c063216a7c83d11e4a597))


### Bug Fixes

* channel unreadCount to be set as 0 when notification.mark_read event is dispatched [CRNS - 433] ([#914](https://github.com/GetStream/stream-chat-js/issues/914)) ([667969e](https://github.com/GetStream/stream-chat-js/commit/667969ebba954f8c3d94832e7276c18b6ac12bf8))
* unread count to not increment if channel has read_events off ([#904](https://github.com/GetStream/stream-chat-js/issues/904)) ([75ebc95](https://github.com/GetStream/stream-chat-js/commit/75ebc95bf8809e6f0a934624d95ed3e2d71b45b5))

## [6.0.0](https://github.com/GetStream/stream-chat-js/compare/v5.6.0...v6.0.0) (2022-02-11)


### ⚠ BREAKING CHANGES

* convert Generics into a single Generic (#837)

* convert Generics into a single Generic ([#837](https://github.com/GetStream/stream-chat-js/issues/837)) ([6406db4](https://github.com/GetStream/stream-chat-js/commit/6406db4309f3e8202ef23606d3245d8405367d70))

## [5.6.0](https://github.com/GetStream/stream-chat-js/compare/v5.5.0...v5.6.0) (2022-02-09)


### Features

* **moderation:** update flag_report field name and add more filterin… ([#894](https://github.com/GetStream/stream-chat-js/issues/894)) ([280b179](https://github.com/GetStream/stream-chat-js/commit/280b179286d0e8686edd107593a2d5c10f00c1bb))


### Bug Fixes

* fire health.check event after successful connection when using long poll transport ([#900](https://github.com/GetStream/stream-chat-js/issues/900)) ([0b3cd97](https://github.com/GetStream/stream-chat-js/commit/0b3cd979830c10994f7601762d57892756fc0ead))
* ignore unread count for thread replies ([#890](https://github.com/GetStream/stream-chat-js/issues/890)) ([7a014be](https://github.com/GetStream/stream-chat-js/commit/7a014be3fb21ca6f7e19881cfe2acb770124ee4c))

## [5.5.0](https://github.com/GetStream/stream-chat-js/compare/v5.4.0...v5.5.0) (2022-02-02)


### Features

* imports API endpoints ([#884](https://github.com/GetStream/stream-chat-js/issues/884)) ([27fccbe](https://github.com/GetStream/stream-chat-js/commit/27fccbeb3aec1b905858a31a5308ed1de49e70f7))


### Bug Fixes

* added transport.changed event to event map ([#892](https://github.com/GetStream/stream-chat-js/issues/892)) ([48013cd](https://github.com/GetStream/stream-chat-js/commit/48013cdf19fe9e3e6e25790a951ac730733493cb))

## [5.4.0](https://github.com/GetStream/stream-chat-js/compare/v5.3.0...v5.4.0) (2022-01-25)


### Features

* **channel:** add hard_delete flag to channel.delete ([#885](https://github.com/GetStream/stream-chat-js/issues/885)) ([d0c0e5d](https://github.com/GetStream/stream-chat-js/commit/d0c0e5dec31b97ce2d512e59a667dc6ab760a823))


### Bug Fixes

* added missing logs for wsconnection ([#887](https://github.com/GetStream/stream-chat-js/issues/887)) ([94bd909](https://github.com/GetStream/stream-chat-js/commit/94bd909f08e6ca833c897925f6216aff14c47170))

## [5.3.0](https://github.com/GetStream/stream-chat-js/compare/v5.2.0...v5.3.0) (2022-01-24)


### Features

* add unblockmessage ([#868](https://github.com/GetStream/stream-chat-js/issues/868)) ([52e9f42](https://github.com/GetStream/stream-chat-js/commit/52e9f42efc1d5d1e378a9f7388081ae05cbf61ca))
* add xiaomi push provider ([#883](https://github.com/GetStream/stream-chat-js/issues/883)) ([381b0f7](https://github.com/GetStream/stream-chat-js/commit/381b0f79c2867d5a2793fd72db86722fe23bed74))


### Bug Fixes

* include unread_messages for all message events ([#871](https://github.com/GetStream/stream-chat-js/issues/871)) ([f26ceed](https://github.com/GetStream/stream-chat-js/commit/f26ceed6ca5897b47a8309cbbd983cb3e5002078))

## [5.2.0](https://github.com/GetStream/stream-chat-js/compare/v5.1.2...v5.2.0) (2022-01-20)

### Features

- Add async user export endpoint support ([#860](https://github.com/GetStream/stream-chat-js/pull/860))
- Add permission tags support ([#867](https://github.com/GetStream/stream-chat-js/pull/867))
- add automated release flow ([#866](https://github.com/GetStream/stream-chat-js/issues/866)) ([9b81974](https://github.com/GetStream/stream-chat-js/commit/9b819744807b1208b13789d2571f0e0f56fd4e9c))
- remove imgur from commands ([#865](https://github.com/GetStream/stream-chat-js/issues/865)) ([9efeea4](https://github.com/GetStream/stream-chat-js/commit/9efeea4d04ed5da3cb9730158da20de0fa021c48))

### Bug Fixes

- add channel.kicked event ([#878](https://github.com/GetStream/stream-chat-js/issues/878)) ([d9334f5](https://github.com/GetStream/stream-chat-js/commit/d9334f5cc8aa70e4be4ef197548c38988441604f))
- Fix flickering and out-of-order events on truncate.channel with system message ([#870](https://github.com/GetStream/stream-chat-js/pull/870))

## [5.1.2](https://github.com/GetStream/stream-chat-js/compare/v5.1.1...v5.1.2) (2022-01-13)

- Types: Fix some missing attributes by @mahboubii in #857
- Chore: Break CI into multiple workflow by @mahboubii in #858
- Fix: FormData accepts browser Blob by @mahboubii in #856
- Fix: Don't add messages from shadow banned users to state by @madsroskar in #859
- Types: Image attachment's dimensions by @vishalnarkhede in #861

## [5.1.1](https://github.com/GetStream/stream-chat-js/compare/v5.1.0...v5.1.1) (2022-01-03)

### Fixes

* Fix: prevent `own_capabilities` and `hidden` set to undefined in state by `channel.update` event by @yetieaterxb1 in https://github.com/GetStream/stream-chat-js/pull/849

## [5.1.0](https://github.com/GetStream/stream-chat-js/compare/v5.0.1...v5.1.0) (2021-12-30)

### Features

* Add support for new pinned messages endpoint @AnatolyRugalev in https://github.com/GetStream/stream-chat-js/pull/853
* Add support for version 2 of export endpoint @SiddhantAgarwal  in https://github.com/GetStream/stream-chat-js/pull/813

## [5.0.1](https://github.com/GetStream/stream-chat-js/compare/v5.0.0...v5.0.1) (2021-12-02)

### Fixes

* Fix Longpoll disconnect by @mahboubii in https://github.com/GetStream/stream-chat-js/pull/831

### Features

* New `transport.changed` event by @mahboubii in https://github.com/GetStream/stream-chat-js/pull/832

## [5.0.0](https://github.com/GetStream/stream-chat-js/compare/v4.4.3...v5.0.0) (2021-12-02)

### Breaking Changes ⚠️

- Remove `BanUserOptions` deprecated `user` & `user_id` fields, `banned_by` and `banned_by_id` can be use instead, by @mahboubii in https://github.com/GetStream/stream-chat-js/pull/828
- Refactor and simplify StableWSConnection constructor params by @mahboubii in https://github.com/GetStream/stream-chat-js/pull/822

### Features

- Extend channel truncation options by @driver-devel in https://github.com/GetStream/stream-chat-js/pull/815 & https://github.com/GetStream/stream-chat-js/pull/805
- Add `hide_history` parameter to `addMembers` by @yaziine in https://github.com/GetStream/stream-chat-js/pull/817
- LongPoll by @mahboubii in https://github.com/GetStream/stream-chat-js/pull/814

### Fix

- Add channel update options to member endpoints by @ferhatelmas in https://github.com/GetStream/stream-chat-js/pull/821
- ChannelOptions type definition by @szuperaz in https://github.com/GetStream/stream-chat-js/pull/824
- Add `quoted_message` to `ReservedMessageFields` by @vicnicius in https://github.com/GetStream/stream-chat-js/pull/825
- Remove unused fields in WS JSON payload by @mahboubii in https://github.com/GetStream/stream-chat-js/pull/829

### Chore

- Prettier increase line width to 120char by @mahboubii in https://github.com/GetStream/stream-chat-js/pull/818
- Drop husky hooks by @mahboubii in https://github.com/GetStream/stream-chat-js/pull/816
- Types: UR alias UnknownType by @mahboubii in https://github.com/GetStream/stream-chat-js/pull/819
- Refactor connection logger by @mahboubii in https://github.com/GetStream/stream-chat-js/pull/820
- CI run on node v17 by @mahboubii in https://github.com/GetStream/stream-chat-js/pull/826
- Upgrade axios to v0.22 by @mahboubii in https://github.com/GetStream/stream-chat-js/pull/827

## [4.4.3](https://github.com/GetStream/stream-chat-js/compare/v4.4.2...v4.4.3) (2021-11-17)

### Fixes

- Provide `client_request_id` as part of ws failure insights #811 @thesyncim @vishalnarkhede @mahboubii

## [4.4.2](https://github.com/GetStream/stream-chat-js/compare/v4.4.1...v4.4.2) (2021-11-11)

### Fixes

- Inject `instance_client_id` as part of insights so insights from different client instances can be distinguished [5bd6394](https://github.com/GetStream/stream-chat-js/commit/5bd639484ca290d0eb0063f66d5eebb7701b60cf) @thesyncim

## [4.4.1](https://github.com/GetStream/stream-chat-js/compare/v4.4.0...v4.4.1) (2021-11-10)

### Features

- Exported all the functions and classes from [insights](https://github.com/GetStream/stream-chat-js/blob/v4.4.0/src/insights.ts) file @vishalnarkhede [bd2dcbd](https://github.com/GetStream/stream-chat-js/commit/bd2dcbdad12bb8e5cbce0df45ded78548a3da850)

## [4.4.0](https://github.com/GetStream/stream-chat-js/compare/v4.3.0...v4.4.0) (2021-11-10)

### Fixes

- Removed `flag` from CommandsVariant type @yaziine [f1de4b6](https://github.com/GetStream/stream-chat-js/commit/f1de4b6d81949584cd562d643c38ce4d7745f435)

### Features

- Added ability to send insights about websocket failures from client @thesyncim @vishalnarkhede [5fdd032](https://github.com/GetStream/stream-chat-js/commit/5fdd032cae8e2e36c5e41cfda750108e1c661bb3)

  ```tsx
  const client = StreamChat.getInstance('apikey', { enableInsights: true })
  ```

- Added `quotes` flag on channel config types @nmerkulov [a130cf4](https://github.com/GetStream/stream-chat-js/commit/a130cf4c992b7d8cd30e6bded7f3fbad5495e020)

## [4.3.0](https://github.com/GetStream/stream-chat-js/compare/v4.2.0...v4.3.0) (2021-11-01)

### Fixes

* Fixed conditions on `window.removeEventLister` to avoid breaking react-native by @vishalnarkhede in https://github.com/GetStream/stream-chat-js/pull/781
* Fix `queryMembers` sort type by @DanC5 in https://github.com/GetStream/stream-chat-js/pull/787
* Deprecate `client.markAllRead` and add `client.markChannelsRead` by @yaziine in https://github.com/GetStream/stream-chat-js/pull/800

### Features
* `GetTask` endpoint to retrieve async task results by @gumuz in https://github.com/GetStream/stream-chat-js/pull/770
* Add Huawei push provider by @ferhatelmas in https://github.com/GetStream/stream-chat-js/pull/772
* Change `Permission.Condition` type by @AnatolyRugalev in https://github.com/GetStream/stream-chat-js/pull/775
* Fix unread count by excluding system messages by @khushal87 in https://github.com/GetStream/stream-chat-js/pull/777
* Add search backend type by @ferhatelmas in https://github.com/GetStream/stream-chat-js/pull/780
* New `enrichURL` OG endpoint by @mahboubii in https://github.com/GetStream/stream-chat-js/pull/771
* Add async `deleteChannels` endpoint by @yaziine in https://github.com/GetStream/stream-chat-js/pull/769 & https://github.com/GetStream/stream-chat-js/pull/788
* New `async_url_enrich_enabled` flag by @mahboubii in https://github.com/GetStream/stream-chat-js/pull/793
* Add ExportChannel Options missing `include_truncated_messages` by @mahboubii in https://github.com/GetStream/stream-chat-js/pull/794
* Expose `webhook_events` field by @nmerkulov in https://github.com/GetStream/stream-chat-js/pull/792
* Added i`d_around` & `created_at_around` to query messages by @gumuz in https://github.com/GetStream/stream-chat-js/pull/798
* New `skip_enrich_url` flag by @mahboubii in https://github.com/GetStream/stream-chat-js/pull/799
* New endpoint for async batch delete users by @gumuz in https://github.com/GetStream/stream-chat-js/pull/762

## September 15, 2021 - 4.2.0

### Fixes

- Fixed the behavior of `isConnecting` flag in `StableWSConnection` class. Also `client.connecting` flag has been removed, so this could potentially be a breaking change for you, although this flag was never properly set so ideally you shouldn't be using
  this flag. [bb165f8](https://github.com/GetStream/stream-chat-js/commit/bb165f8c48a140c06c6811a337955cd5258877f9)

### Features

- Added option `clear_deleted_message_text` in `exportChannels` endpoint [33f627f](https://github.com/GetStream/stream-chat-js/commit/33f627f0f8b8b669d463b5393ec93a37f53d6415)

## Augest 24, 2021 - 4.1.0

### Feature

- Add `own_capabilities` attribute to channel response data #741
- Add `team` filter for query flagged messages #754
- `queryChannel` support `user_id` for server-side queries #753

### Fix

- Campaign namespace update #760

## Augest 12, 2021 - 4.0.0

### Breaking ⚠️

From now on `client.connectUser()` should be awaited #747. All instances of `connectUser()` should be changed to:

```js
await connectUser();
// or
connectUser().then();
// ....
// queryChannels and other methods should be called after promosie is resolved
```

The behavior is now improved for poor connections and `connectUser` retries to establish the connection before throwing an error. Make sure to handle the failure gracefully and do not proceed to query channels or other methods until `connectUser` resolves.

### Feature

- Campaign feature flag, name and description added #745 #736
- Campaign and Segment pagination option #737
- `queryChannels` options to skip initialization of certain channels #743 #740

## July 29, 2021 - 3.13.1

- Allowing listeners for `channel.deleted` and `notification.channel_deleted` before disconnecting the channel from client [cc8796e](https://github.com/GetStream/stream-chat-js/commit/cc8796e6bf3cfc1966080bc5ef9581dc83c6ed77)
- Fixing issue with presence indicator not updating [feff028](https://github.com/GetStream/stream-chat-js/commit/feff0289c1bca121b71663a9b860faf15c57c50f)

## July 28, 2021 - 3.13.0

### Issue fixes

- Clear channel from `client.activeChannels` when its deleted on backend [#728](https://github.com/GetStream/stream-chat-js/pull/728)
- Remove deleted properties from user objects on client when user-update related events are received [#727](https://github.com/GetStream/stream-chat-js/pull/727)
- Remove reference to quoted message, when message gets deleted [#726](https://github.com/GetStream/stream-chat-js/pull/726)
  Please note that channel can't be used once its deleted. You will need to re-create the channel using `client.channel(channelType, channelId)` call

### Features/updates

- Added following enpoints to client:

  - `createSegment`
  - `getSegment`
  - `listSegments`
  - `updateSegment`
  - `deleteSegment`
  - `createCampaign`
  - `getCampaign`
  - `listCampaigns`
  - `updateCampaign`
  - `deleteCampaign`
  - `scheduleCampaign`
  - `stopCampaign`
  - `resumeCampaign`
  - `testCampaign`

- Removed target user id from payload on `client.sendUserCustomEvent` function [8bfcca3](https://github.com/GetStream/stream-chat-js/commit/8bfcca3196c8e01c0794ee7f6daea75da4ebfd8a)
- Added `grant` field types to AppSettings [991b8118](https://github.com/GetStream/stream-chat-js/commit/991b8118567ee4d92f38a4a1d7cbaec41c4d6229)

## July 15, 2021 - 3.12.1

### Issue fixes

- Fixed an issue with event (`message.updated`, `message.deleted` etc) based updates to message list, which can cause messages to go out of sync than desired state. Please read the PR description for more details - [#713](https://github.com/GetStream/stream-chat-js/pull/713)

## July 13, 2021 - 3.12.0

### Features/updates

- Updates to `client.search()` and `channel.search()` endpoint [#677](https://github.com/GetStream/stream-chat-js/pull/677)

  - supports sorting results
  - returns `next` and `previous` parameters to get the next/previous page of results
  - supports pagination using the `next` parameter

- Added new `channel.assignRoles` method for assigning custom roles to the channel members ([#692](https://github.com/GetStream/stream-chat-js/pull/692))
- Updated Permissions API methods ([#707](https://github.com/GetStream/stream-chat-js/pull/707), [#715](https://github.com/GetStream/stream-chat-js/pull/715))
- Switched `pinMessage` and `unpinMessage` to partial update ([#712](https://github.com/GetStream/stream-chat-js/pull/712))

### Issue fixes

- [704](https://github.com/GetStream/stream-chat-js/issues/704) Added missing `team` property to `Event` typescript type. [#716](https://github.com/GetStream/stream-chat-js/pull/716/files)

## June 8, 2021 - 3.11.0

- Fixed timer throttling issue, which was introduced with recent release of Chrome browser [#698](https://github.com/GetStream/stream-chat-js/pull/698)
- Fixed issues with unread count on muted channels [#678](https://github.com/GetStream/stream-chat-js/pull/678)

## May 21, 2021 - 3.10.0

### Feature

- `client.partialUpdateMessage()` to partially update messages [#576](https://github.com/GetStream/stream-chat-js/pull/576)
- `client.queryMessageFlags()` to query flagged messages [#676](https://github.com/GetStream/stream-chat-js/pull/676)
- `client.createToken` add support to have `iat` claim while generating tokens [#674](https://github.com/GetStream/stream-chat-js/pull/674)
- `client.revokeTokens()` method to revoke/unrevoke tokens on an application level [#674](https://github.com/GetStream/stream-chat-js/pull/674)
- `client.revokeUserToken()` method to revoke/unrevoke tokens on user level [#674](https://github.com/GetStream/stream-chat-js/pull/674)
- `client.revokenUsersToken()` method to revoke/unrevoke tokens for multiple users at once [#674](https://github.com/GetStream/stream-chat-js/pull/674)

## May 3, 2021 - 3.9.0

### Feature

- New endpoint to send custom user events [#664](https://github.com/GetStream/stream-chat-js/pull/664)
- Support Node v16 [#671](https://github.com/GetStream/stream-chat-js/pull/671)

## March 29, 2021 - 3.8.0

- Better handling of user.deleted and user.updated events [6eddf39](https://github.com/GetStream/stream-chat-js/commit/6eddf39487d6073a9b7654712f51772c893d8dc6)
  - When `user.deleted` event is received, mark messages from corresponding user as deleted.
  - When `user.updated` event is received, update references of corresponding user in messages.
- Bug with with ChannelState.clean function [28581fd](https://github.com/GetStream/stream-chat-js/commit/28581fd9fae0f3cf761ac0cf785910cea476c61c)
- Allow overriding of https agent on StreamChat [f18e397](https://github.com/GetStream/stream-chat-js/commit/f18e3974caa2b384d52beca10f25d34c726969e8)
  ```js
    const client = StreamChat.getInstance(apiKey, {
      httpsAgent: new https.Agent({
        keepAlive: true,
        keepAliveMsecs: 6000,
      });
    })
  ```
- Updated following types
  - `AppSettingsAPIResponse.enforce_unique_usernames` [497220c](https://github.com/GetStream/stream-chat-js/commit/497220c9b32acbb9e8a4efc7a24e9eafbce06e71)
  - `MessageLabel` [7897e23](https://github.com/GetStream/stream-chat-js/commit/7897e239037bdc97a1066ca446d6a1bf4b7c4967)

## March 19, 2021 - 3.7.0

- Receive unsubscribe handler from `channel.on` [1ae1fca](https://github.com/GetStream/stream-chat-js/commit/1ae1fca10e5db251c549ce5b50ec19ff5ea617e2)

```js
const eventHandler = (e) => {
  /** handle event here */
};
const { unsubscribe } = channel.on(eventHandler);

// When you want to remove listener:
unsubscribe();
```

## March 17, 2021 - 3.6.2

- Added extra check in `client.updateMessage` to make sure we don't send `mentions_users` as array of user objects. If yes, then convert it
  to array of userIds (which is what API expects) [#647](https://github.com/GetStream/stream-chat-js/pull/647)

## March 16, 2021 - 3.6.1

- `message.__html` type is deprecated in favor of `message.html` [#646](https://github.com/GetStream/stream-chat-js/pull/646)
- `message.__html` is ignored `updateMessage` function [#645](https://github.com/GetStream/stream-chat-js/pull/645)

## March 15, 2021 - 3.6.0

- Add support to set `baseURL` from `options` [#644](https://github.com/GetStream/stream-chat-js/pull/644)
  - `StreamChat.getInstance('key', { baseURL })`

## March 11, 2021 - 3.5.1

Remove call to `channel._disconnect` from client.closeConnection. For end user this will fix the issue - `You can't use a channel after client.disconnect() was called` [#639](https://github.com/GetStream/stream-chat-js/pull/639)

## March 10, 2021 - 3.5.0

- Deprecated `client.disconnect`. A new method has been introduced as alias - `client.disconnectUser`
- Introduced following two methods on client:

  - client.openConnection - establish a ws connection on current client.
  - client.closeConnection - close the ws connection on current client, doesn't remove user

- Moved call to `setHealth(true)`, (which marks the connection as healthy) to only after you receive first event on websocket.
  Please check the description of PR [#626](https://github.com/GetStream/stream-chat-js/pull/626) for details.

## March 9, 2021 - 3.4.0

QueryMembers - Added support for pagination by user_id [0c41232](https://github.com/GetStream/stream-chat-js/commit/0c412321bc4de81b123574041e0abadf89f235df)

## March 9, 2021 - 3.3.0

### Feature

- Added the `Client.getRateLimits` function to retrieve rate limit quotas and usage, with the option to filter per platform and endpoint [#631](https://github.com/GetStream/stream-chat-js/pull/631)
- Support reactions sync for pinned messages in channel state [#629](https://github.com/GetStream/stream-chat-js/pull/629)

## March 8, 2021 - 3.2.0

### Feature

- Added the `Client.queryBannedUsers` function to query banned users with optional filters [#625](https://github.com/GetStream/stream-chat-js/pull/625)

## March 5, 2021 - 3.1.4

### Fix

- Clear (set to false) `isUpToDate` flag, when channel watcher is disconnected [#624](https://github.com/GetStream/stream-chat-js/pull/624)

## March 2, 2021 - 3.1.3

### Chore

- Change stream client header from `x-stream-client` to `X-Stream-Client` [#622](https://github.com/GetStream/stream-chat-js/pull/622)

## February 26, 2021 - 3.1.2

### Fix

- Fixed regression introduced in 3.1.0 causing `ChannelState.messages` not to update on incoming reaction events [#621](https://github.com/GetStream/stream-chat-js/pull/621)

## February 23, 2021 - 3.1.1

### Fix

- Channel state message list mutation [#619](https://github.com/GetStream/stream-chat-js/pull/619)

## February 17, 2021 - 3.1.0

### Feature

- `sendMessage` accepts a `skip_push` flag to skip sending push notifications [#608](https://github.com/GetStream/stream-chat-js/pull/608)

### Fix

- Sync `own_reactions` in the events [#606](https://github.com/GetStream/stream-chat-js/pull/606)
- Missing user_id in channel instantion by members [#610](https://github.com/GetStream/stream-chat-js/pull/610)

## February 11, 2021 - 3.0.1

- Add back some deprecated functions for convenience [#615](https://github.com/GetStream/stream-chat-js/pull/615)

## February 10, 2021 - 3.0.0

### BREAKING CHANGES

- Removed `seamless-immutable` library completely for client/channel state management in favor of pure JS objects [#602](https://github.com/GetStream/stream-chat-js/pull/602). This will likely require some changes to frontend usage of these states with spread operators for deeply nested data updates
- Changed channel state `messageToImmutable` function to `formatMessage` [#602](https://github.com/GetStream/stream-chat-js/pull/602)

- `channel.sendReaction(messageID: string, reaction: Reaction, user_id?: string, enforce_unique?: boolean)` is changed to `channel.sendReaction(messageID: string, reaction: Reaction, options?: { enforce_unique?: boolean })`. the removed `user_id` parameter should be added to `reaction`.
- `client.setUser()` function is removed in favor of `client.connectUser()` [#612](https://github.com/GetStream/stream-chat-js/pull/612)
- `client.setAnonymousUser()` function is removed in favor of `client.connectAnonymousUser()` [#612](https://github.com/GetStream/stream-chat-js/pull/612)
- `client.updateUser()` function is removed in favor of `client.upsertUser()` [#612](https://github.com/GetStream/stream-chat-js/pull/612)
- `client.updateUsers()` function is removed in favor of `client.upsertUsers()` [#612](https://github.com/GetStream/stream-chat-js/pull/612)
- `client._userAgent()` function is removed in favor of `client.getUserAgent()` [#612](https://github.com/GetStream/stream-chat-js/pull/612)

### Fix

- Added types for auto translations [#602](https://github.com/GetStream/stream-chat-js/pull/602)
- Added missing options for gdpr endpoints [#609](https://github.com/GetStream/stream-chat-js/pull/609)

### Chore

- Upgrade Dependencies [#613](https://github.com/GetStream/stream-chat-js/pull/613)

## January 28, 2021 - 2.12.0

### Feature

- New `StreamClient.getInstance` function to be use instead of `new StreamClient()` [#599](https://github.com/GetStream/stream-chat-js/pull/599)
- Types for file and image upload app configuration [#582](https://github.com/GetStream/stream-chat-js/pull/582)

### Fix

- Allow consecutive calls with warning to `client.connectUser` for the same user [#600](https://github.com/GetStream/stream-chat-js/pull/600)

## January 21, 2021 - 2.11.5

### Fix

- Skip sorting channel members while instantiating a channel without id [#591](https://github.com/GetStream/stream-chat-js/pull/591)

## January 20, 2021 - 2.11.4

- Ensure uniqe channel per cid on client's activeChannel state [#586](https://github.com/GetStream/stream-chat-js/pull/586)

## January 18, 2021 - 2.11.3

- Added types for query by date parameters - [b249e0b](https://github.com/GetStream/stream-chat-js/commit/b249e0b02da9b6e1c3984586b7ab823de072dd4b)
- Added missing type definitions around channel config - [9c3067f](https://github.com/GetStream/stream-chat-js/commit/9c3067f70efa9cad12233d10818b623efc00e1f6)

## January 11, 2021 - 2.11.2

- Add thread_participants to MessageResponse and correct pinned types [8e357a8](https://github.com/GetStream/stream-chat-js/commit/9d10998cc56c807e34e3131eccd8bf561c1ce822)

## January 4, 2021 - 2.11.1

- Updated/fixed types on event object regarding unread counts. [36e2297](https://github.com/GetStream/stream-chat-js/commit/36e2297526682276c4e597fd171c27d115ba0bb6)

## December 31, 2020 - 2.11.0

- Added support for quoted messages [#561](https://github.com/GetStream/stream-chat-js/pull/561/files)
- Added support for `enforce_unique` param on send reaction api. When true, previous reaction (if any) from user will be replaced with new reaction. [27ddd4f](https://github.com/GetStream/stream-chat-js/commit/27ddd4f63a71daab2ca1c55f193719c9780047b4)
- Added event handler for event `reaction.updated` [27ddd4f](https://github.com/GetStream/stream-chat-js/commit/27ddd4f63a71daab2ca1c55f193719c9780047b4)
- Added new flag on channel state `isUpToDate` (please check description for details) [588c0e9](https://github.com/GetStream/stream-chat-js/commit/588c0e91c92ca1f031cd11a030de0364ac04c59e)
- Fixed types for `client.user` [d855779](https://github.com/GetStream/stream-chat-js/commit/d855779c700104ebaaa7b907d45d2fa722ae0718)

## December 21, 2020 - 2.10.0

### Feature

- New `channel.updatePartial()` function can be used to set and unset specific fields when it is necessary to retain additional custom data fields on Channel #550
- `client.testPushSettings()` accepts `skipDevices` boolean attribute which skip config/device checks and sending to real devices #548
- `channel.sendReaction()` accepts `enforce_unique` attribute to overwrite existing reactions if any #527

### Fix

- deprecate `setUser` and `setAnonymousUser` in favor of `connectUser` and `connectAnonymousUser` #529
- Update channel read state when a new message is sent #536
- Removed unused `user_details` field from `query_channels` #545

- `MessageResponse` type #551
- `AppSettings` type #541

## December 7, 2020 - 2.9.0

- Adding `recoverStateOnReconnect` option - [#534](https://github.com/GetStream/stream-chat-js/pull/534)
- Adding `UpdatedMessage` typescript type

## November 27, 2020 - 2.8.4

### Fix

- Reset `unreadCount` when channel gets truncated [#521](https://github.com/GetStream/stream-js/pull/521)

## November 25, 2020 - 2.8.3

### Fix

- add `custom_event` to channel types [#520](https://github.com/GetStream/stream-js/pull/520)

## November 25, 2020 - 2.8.2

### Fix

- Replace uuid with simple random generator [#518](https://github.com/GetStream/stream-js/pull/518)

## November 20, 2020 - 2.8.1

### Fix

- Duplicate message from current user [#509](https://github.com/GetStream/stream-js/pull/509)
- Sort direction array for queries [#501](https://github.com/GetStream/stream-js/pull/501)
- Add `enforce_unique_usernames` to `AppSettingsAPIResponse` type [#511](https://github.com/GetStream/stream-js/pull/511)

## November 17, 2020 - 2.8.0

### Feature

- Channel Export [#504](https://github.com/GetStream/stream-js/pull/504)
- New event `notification.invite_rejected` [#467](https://github.com/GetStream/stream-js/pull/467)
- Channel stopTyping accepts optional `parent_id` for typing in threads `notification.invite_rejected` [#505](https://github.com/GetStream/stream-js/pull/505)

### Fix

- Mute users no longer counted in channel unread [#498](https://github.com/GetStream/stream-js/pull/498)
- `AppSettingsAPIResponse` type includes `image_moderation_enabled` [#497](https://github.com/GetStream/stream-js/pull/497)
- User ban function signature updated [#502](https://github.com/GetStream/stream-js/pull/502): `client.banUser('user1', {user_id: 'user2'})` is replaced with `client.banUser('user1', {banned_by_id: 'user2'})`

## November 06, 2020 - 2.7.4

### Feature

- Ban user by ip [#485](https://github.com/GetStream/stream-js/pull/485)

## November 03, 2020 - 2.7.3

### Fix

- Browser file upload incorrect file name [#487](https://github.com/GetStream/stream-js/pull/487)

## October 30, 2020 - 2.7.2

### Fix

- Improve types of `sendMessage()`, `updateMessage()`, `ChannelFilters` and `AppSettingsAPIResponse` [#480](https://github.com/GetStream/stream-chat-js/pull/480) [#483](https://github.com/GetStream/stream-chat-js/pull/483)

## October 26, 2020 - 2.7.1

### Feature

- New functions to shadow ban a user from one or all channels [#447](https://github.com/GetStream/stream-chat-js/pull/447)

```js
// global shadow ban on all channels
client.shadowBan(target_user_id);
client.removeShadowBan(target_user_id);

// channel speceifc shadow ban
channel.shadowBan(target_user_id);
channel.removeShadowBan(target_user_id);
```

### Fix

- Ignore shadowed messages in the unread count [#475](https://github.com/GetStream/stream-chat-js/pull/475)
- Remove duplicated \_initializeState call [#473](https://github.com/GetStream/stream-chat-js/pull/473)

### Chore

- Upgrade dependencies [#477](https://github.com/GetStream/stream-chat-js/pull/477)

## October 20, 2020 - 2.7.0

### Fix

- `channel.addMessageSorted` performance has been improved. It now accepts an extra parameter `timestampChanged: boolean` which needs to be set for updating a message in the state with the same `id` and different `created_at` [#470](https://github.com/GetStream/stream-chat-js/pull/470/)

## October 12, 2020 - 2.6.0

### Feature

- Typing events for thread #445 [#445](https://github.com/GetStream/stream-chat-js/pull/445/)
- Hard deleted messages are removed from `channel.state.messages` [#454](https://github.com/GetStream/stream-chat-js/pull/454/)
- Simplify and document flag/unflag functions for server side usage [#462](https://github.com/GetStream/stream-chat-js/pull/462/)

### Fix

- BlockList types [#455](https://github.com/GetStream/stream-chat-js/pull/455/)
- `Channel.countUnread()` returns correct unread [#452](https://github.com/GetStream/stream-chat-js/pull/452/)
- `type` key-value pair added to image uploads to fix React Native Android image upload failures [#464](https://github.com/GetStream/stream-chat-js/pull/464/)

## October 1, 2020 - 2.5.0

### Feature

- Add permission for using frozen channels `UseFrozenChannel` [#444](https://github.com/GetStream/stream-chat-js/pull/444/)
- `SendFile` accepts buffer and other types of streams [#448](https://github.com/GetStream/stream-chat-js/pull/448/)

### Fix

- Discard reservered fields from `channel.update()` [#439](https://github.com/GetStream/stream-chat-js/pull/439/)
- Custom Command handler in `AppSettingsAPIResponse` renamed to `custom_action_handler_url` from `custom_command_url` [#409](https://github.com/GetStream/stream-chat-js/pull/409/)
- Regenerate yarn.lock file [#449](https://github.com/GetStream/stream-chat-js/pull/449/)
- `SendFile` properly check for `File` instances [#448](https://github.com/GetStream/stream-chat-js/pull/448)

## September 17, 2020 - 2.4.0

### Feature

- BlockLists [#437](https://github.com/GetStream/stream-chat-js/pull/437/). Refer to docs on how to use this new feature [docs](https://getstream.io/chat/docs/block_lists/?language=js)

### Fix

- `Channel.keystroke` not firing for the first typing event [#440](https://github.com/GetStream/stream-chat-js/pull/440/)

## September 17, 2020 - 2.3.1

- Added backward compatible types and move type definitions for production out of dev dependencies [#432](https://github.com/GetStream/stream-chat-js/pull/432/)

## September 16, 2020 - 2.3.0

- Changed ordering of Typescript generics from usage preference based to alphabetical for consistency throughout the project [#425](https://github.com/GetStream/stream-chat-js/pull/425/files)

## September 10, 2020 - 2.2.2

- Fixing possible race condition between warmUp options request and first queryChannels call. [372b22c](https://github.com/GetStream/stream-chat-js/commit/372b22cffb90fcc4e5470af7d64524ff0d6457dc)

## September 10, 2020 - 2.2.1

- Fixing typescript for `filters` param in queryChannels endpoint [5e840ba](https://github.com/GetStream/stream-chat-js/commit/5e840ba79b9e9f34f987b459d86986cc661d20ca)

## September 10, 2020 - 2.2.0

- Add `warmUp` option for StreamChat constructor, to improve the network latency on api calls [74a9121](https://github.com/GetStream/stream-chat-js/commit/74a91214f69f0ccedadd39095640ac0f7237dcf5)

## September 7, 2020 - 2.1.3

- Move @types dependencies to devDependencies [#418](https://github.com/GetStream/stream-chat-js/pull/418)

## September 4, 2020 - 2.1.2

- Fix connection recovery of client [#414](https://github.com/GetStream/stream-chat-js/pull/414)
- Removed unused recovery option from queryChannels api payload [#414](https://github.com/GetStream/stream-chat-js/pull/414)

## August 31, 2020 - 2.1.1

- Typescript related fixes [4e538e6](https://github.com/GetStream/stream-chat-js/commit/4e538e66fc68e99331f3c2a83365df26f9789c93)
  - Add null checks for tests and correct types to reflect null returns on reactions
  - Change updateMessage to use Message instead of MessageResponse

## August 27, 2020 - 2.1.0

- Added endpoints to enable and disable slow mode [06fe1b2](https://github.com/GetStream/stream-chat-js/commit/06fe1b2d8a73b06d15578e32887d4fdf3c520d61)

  - enableSlowMode
  - disableSlowMode

- Added endpoints for custom commands [f79baa3](https://github.com/GetStream/stream-chat-js/commit/f79baa32c1512281f2bc7b4307910b7c16d2d2b9)

  - createCommand
  - getCommand
  - updateCommand
  - deleteCommand
  - listCommand

- Typescript related fixes [5f2ae83](https://github.com/GetStream/stream-chat-js/commit/5f2ae838aa567a40d6778f01e9e3dbcbf5ebe09c)
  - added generic type `CommandType`
  - Fixing backward compatibility related issues

## August 26, 2020 - 2.0.0

- Library has been migrated to full typescript.
- No breaking changes regarding underlying javascript api.
- The `Event` type no longer takes a string generic that maps to the `type` property of the response. Event now takes multiple high level generics instantiated along with the client and the property `type` on the response is on of the string union `EventTypes`.

## August 11, 2020 - 1.14.1

- Add support for channel.visible event [991c87b](https://github.com/GetStream/stream-chat-js/commit/991c87b094afa23bdae9973aa264e0789a3c12e0)
- Added setter for userAgent [5d87550](https://github.com/GetStream/stream-chat-js/commit/5d87550f5097c9cbea687d598e3c947a56368cca)

## July 24, 2020 - 1.14.0

- Added timeout for muteUser client method [6f44677](https://github.com/GetStream/stream-chat-js/commit/6f446772f42f5a475dcfd4e28d4a8d9c949513b3)

## July 16, 2020 - 1.13.2

- Removing cross-fetch from rollup externals [c7dafb0](https://github.com/GetStream/stream-chat-js/commit/c7dafb0f83bd24a02a03f52add7c27b6ccdb683b)

## July 16, 2020 - 1.13.1

- Changing ws issue logs to warn level [1836606](https://github.com/GetStream/stream-chat-js/commit/1836606acca3690f0223f4434006be8f4c1bc5d1)

## July 8, 2020 - 1.13.0

- Add size comparison action [#361](https://github.com/GetStream/stream-chat-js/pull/361)
- Drop cross-fetch and use Axios for uploads, use local instance of Axios [#365](https://github.com/GetStream/stream-chat-js/pull/365)
- Drop support for node v11, v13 [#372](https://github.com/GetStream/stream-chat-js/pull/372)

## June 24, 2020 - 1.12.1

- Fixing typescript for channel.getCommands [52e562a](https://github.com/GetStream/stream-chat-js/commit/52e562af1922e5d4e56ab3ba312fe70bf7b562e1)

## June 23, 2020 - 1.12.0

- Adding sync endpoint for offline support [eb4793f](https://github.com/GetStream/stream-chat-js/commit/eb4793ff9bce1f4b2f698efe853e43772f9e6a7d#diff-cf27c1d543e886c89cd9ac8b8aeaf05bR1451)
- Fixing typescript for translateMessage endpoint [c9aea32](https://github.com/GetStream/stream-chat-js/commit/c9aea320626d66c29f7424da351c6b965e65675e)

## June 16, 2020 - 1.11.4

- Fixing request retry logic upon token expiry [ab20729](https://github.com/GetStream/stream-chat-js/commit/ab20729dbff05f4e6270d98f736acb2deafae7a5)

## June 12, 2020 - 1.11.3

- Fixing types for setUser function on client [36d04ec](https://github.com/GetStream/stream-chat-js/commit/36d04ec110d687760af8876a296897516c624739)
- Added `translateMessage` function/endpoint to client [c5e1462](https://github.com/GetStream/stream-chat-js/commit/c5e1462aa94a4855900679d656373daefc3019b2)

## June 8, 2020 - 1.11.2

- Improved channel.config types in typescript file [5524675](https://github.com/GetStream/stream-chat-js/commit/5524675656ad0b4483a5b4ed9047fa8b384a5423)
- Added support for `user.deleted` event [b3c328a](https://github.com/GetStream/stream-chat-js/commit/b3c328aa15af4db8bdd07d57effbd21fbd6ae600)

## May 29, 2020 - 1.11.1

- Fixing issue with connection recovery and queryChannels api call [#340](https://github.com/GetStream/stream-chat-js/pull/340)

## May 28, 2020 - 1.11.0

- Introducing queryMembers endpoint [#321](https://github.com/GetStream/stream-chat-js/pull/321)

## May 28, 2020 - 1.10.3

- Fixed typescript issues [a9fa49c](https://github.com/GetStream/stream-chat-js/commit/a9fa49c94fe3a730e91b5c3d199f658b6f69c834)

## May 19, 2020 - 1.10.2

- Fixing read status issue [3289ae2](https://github.com/GetStream/stream-chat-js/commit/3289ae28c6400290719c4f82ce6a7651f6f7f732)

## May 15, 2020 - 1.10.1

- Reverting uuid version change from 1.10.0 due to incompatibility with react-native [issue](https://github.com/uuidjs/uuid#getrandomvalues-not-supported)

## May 15, 2020 - 1.10.0

- Token refresh functionality [#327](https://github.com/GetStream/stream-chat-js/pull/327)
- Bump uuid version to `8.0.0` [d1957d9](https://github.com/GetStream/stream-chat-js/commit/d1957d97c10f459b0ba8131e1c187cecf19ae17e)
- Updated typescript for multitenant feature [6160aa6](https://github.com/GetStream/stream-chat-js/commit/6160aa6ddb45aca46633818967495253343fb359)
- Updated flag function signatures to allow server side flagging/unflagging [05c2281](https://github.com/GetStream/stream-chat-js/commit/05c22811780f801255e94a4180c1613438af6319)
- Disabled presence by default for queryUsers endpoint [26616f5](https://github.com/GetStream/stream-chat-js/commit/26616f5b353b6f0cc8ea7dd87cf2d32e7058672e)

## May 13, 2020 - 1.9.0

- Multi-tenant feature
- Ws Disconnect improvements - forcefully assume closed after 1 sec
- Silent message feature

## April 29, 2020 - 1.8.0

- **Breaking:** updated typescript namespace to avoid conflict with getstream package
  - Fixes: GetStream/stream-js#258

## April 20, 2020 - 1.7.4

- Fixed types for verifyWebhook function

## April 15, 2020 - 1.7.3

- Adding missing event types in typescript file - [8ed49dd](https://github.com/GetStream/stream-chat-js/commit/8ed49ddf6af9d0325af920c985d1092758d6215a)

## April 9, 2020 - 1.7.2

- Fixing typescript for StreamChat, Channel and ChannelState classes [2c78981](https://github.com/GetStream/stream-chat-js/commit/2c789815c1c4ae59121cc2109f4109b1d871cdce)

## April 7, 2020 - 1.7.1

- Fixing typescript for getConfig function in Channel class [5bf2d7e](https://github.com/GetStream/stream-chat-js/commit/5bf2d7e8b6f1434a857dd8367b5a11c4fc839c37)

## April 3, 2020 - 1.7.0

## April 7, 2020 - 1.7.1

- Add types for channel.getConfig()

## April 2, 2020 - 1.6.2

- Adding (missing) following permission constants in typescript file [5b08dec](https://github.com/GetStream/stream-chat-js/commit/5b08dec04e623e940fb5cdffaa2e1ed9410731ae#diff-5b99411a607296a74a128d9535a49dbe)

  - Allow
  - Deny
  - AnyResource
  - AnyRole
  - MaxPriority
  - MinPriority

- Moving following dependencies from devDependencies to dependencies to avoid ts errors regarding missing types [5b08dec](https://github.com/GetStream/stream-chat-js/commit/5b08dec04e623e940fb5cdffaa2e1ed9410731ae#diff-b9cfc7f2cdf78a7f4b91a753d10865a2)

  - @types/seamless-immutable
  - @types/ws

## March 27, 2020 - 1.6.1

- Reverting [c5413c0](https://github.com/GetStream/stream-chat-js/commit/c5413c07e6743e056b04ade7ccacebeb0f2b1b4f)

  Commit description: Avoid duplication of reaction, by adding check for existing reaction

  Reason:

  1. latest_reactions only contain 10 reactions. So the added check is not sufficient.
  2. It will need handle remove reactions as well.
  3. own_reactions doesn't contain user object always. So that use case will need handling as well.

## March 27, 2020 - 1.6.0

- Deprecating updateUser and updateUsers api from StreamChat client.
- Introducing alias for updateUser and updateUsers api
  - updateUser --> upsertUser
  - updateUsers --> upsertUsers
- Fixing typescript for StreamChat constructor [583b528](https://github.com/GetStream/stream-chat-js/commit/583b528f40dfaa74fec6819c5cb57ec4a592350e)
- Fixing typescript for event subscribers [a0c2ef0](https://github.com/GetStream/stream-chat-js/commit/a0c2ef0f4c7e88d58ac1e7e32d7b82f9f90b1d06)
- Added typescript for getMessage and getMessagesById endpoint [a0c2ef0](https://github.com/GetStream/stream-chat-js/commit/a0c2ef0f4c7e88d58ac1e7e32d7b82f9f90b1d06)
- Avoid duplication of reaction, by adding check for existing reaction [c5413c0](https://github.com/GetStream/stream-chat-js/commit/c5413c07e6743e056b04ade7ccacebeb0f2b1b4f)

## March 20, 2020 - 1.5.1

- Fixing `removeMessage` function in ChannelState to handle thread message - [e67a432](https://github.com/GetStream/stream-chat-js/commit/13bdeb75d60370e00abac3e0bc57d81733d40b8e)
- Fixing typescript file for channel mutes - [c7fefa8](https://github.com/GetStream/stream-chat-js/commit/c7fefa8c836658b305dd567b0b6479672bcc745a)

## March 19, 2020 - 1.5.0

- Support for channel mutes

## March 10, 2020 - 1.4.0

- Support filtering by messages custom fields - [#264](https://github.com/GetStream/stream-chat-js/pull/264)

## March 3, 2020 - 1.3.4

- Increment wsID when ws connection is disconnected manually, to ensure any of the callbacks (onclose, onerror etc) are obsolete - [792de5b](https://github.com/GetStream/stream-chat-js/commit/792de5ba178d00dd94fb8e41abdaadf45d7d436f)

## February 17, 2020 - 1.3.3

- Fixing broken browser bundle - fixes [#259](https://github.com/GetStream/stream-chat-js/issues/259)
- Allowing `.off` (event listener removal) on uninitialized channels - [985155f](https://github.com/GetStream/stream-chat-js/commit/985155fe91a571522a78936803a802e6c5cbe3e9)

## February 10, 2020 - 1.3.2

- Fixing client.disconnect and connection.disconnect to always return promise - [600da6c](https://github.com/GetStream/stream-chat-js/commit/600da6cfcbfbf347916934b51e5b9c185a18df40)
- Fixing type definitions for Reaction object - [08c802e](https://github.com/GetStream/stream-chat-js/commit/08c802e0e12848b9d99067465b470cae60f11c00)
- Fixing type definitions for channel method on client - [f2d99b8](https://github.com/GetStream/stream-chat-js/commit/f2d99b8067bee8b7818b5f8e8e83f8c1d0e7c63c)

## February 5, 2020 - 1.3.1

- Adding some more logs for ws connection callback handlers such as onclose, onmessage, onerror - [b54fa53](https://github.com/GetStream/stream-chat-js/commit/b54fa5392a727b48a1552e03911c0fb1b35f7a03)

## January 25, 2020 - 1.3.0

- Added tests for channels operator \$in with custom fields - [1896d98](https://github.com/GetStream/stream-chat-js/commit/1896d98a98968a920b3c1539e50649fa7a33462f)
- Fixed types (in typescript declaration file) for sendReaction function in channel - [e0aa1fa](https://github.com/GetStream/stream-chat-js/commit/e0aa1fa90e8bcc4fde595ea06ef04feea866da8b)
- Fixed types (in typescript declaration file) for sendFile and sendImage functions - [346048f](https://github.com/GetStream/stream-chat-js/commit/346048fa274bf7289f0bb56541e45764f27136ee)
- Added `getMessagesById` endpoint for channel - [cdc2a8e](https://github.com/GetStream/stream-chat-js/commit/cdc2a8ec503bf72a5da6ac3b0d988875926e0bbe)

## January 14, 2020 - 1.2.3

- Updated devtoken methode (for compatibility with RN). Switching to [base64-js](https://www.npmjs.com/package/base64-js) - [96c338e](https://github.com/GetStream/stream-chat-js/commit/96c338e5725a47d5c3bb6081a93107595b646ede)
- Fixed types (in typescript declaration file) for setUser function of client - [6139e4e](https://github.com/GetStream/stream-chat-js/commit/6139e4ecf51fe357c4262404f7df0fc20b4b6cba)
- Fixed and updated types for partialUpdateUser function - [201257d](https://github.com/GetStream/stream-chat-js/commit/201257ddad75588731380ec97f578e43f4ee0a82)

## December 16, 2019 - 1.2.2

- Handling `channel.hidden` event

## December 3, 2019 - 1.2.1

- Handling `channel.truncated` event
- Support for system message for addMember/removeMember functionality
- Throw clear errors when trying to build tokens without secret

## November 28, 2019 - 1.2.0

## November 22, 2019 - 1.1.8

- Improve client.channel signature, support short-hand with only type and object as well as null or undefined ID (instead of only "")

## October 25, 2019 - 1.1.7

- Add support for member invites after channel creation.

## October 15, 2019 - 1.1.6

- Fixing types for client and connection in typescript declaration file.

## October 10, 2019 - 1.1.5

- Fix for issue [#133](https://github.com/GetStream/stream-chat-js/issues/133) - Updating user object in client, when `user.updated` is received corresponding to user of client
- Adding types for ChannelData object
- Fixing tests

## October 07, 2019 - 1.1.4

## October 07, 2019 - 1.1.3

- File upload issue fix - Allowing File object as valid uri in sendFile function in client.

## September 30, 2019 - 1.1.2

- Moving @types to devDependencies

## September 27, 2019 - 1.1.1

- Syncing and improving the typescript declaration file

## September 23, 2019 - 1.1.0

- Added `channel.hide` and `channel.show`

## September 12, 2019 - 1.0.5

- Improving event handling in js client. Earlier, event listeners on client were executed before channel could handle the event and update the state. This has been fixed by handling event completely on client and channel level first before executing any of the listeners on client or channel.

## July 31, 2019 - 1.0.4

- Added error logs for errors in API calls

## July 23, 2019 - 1.0.3

- Support \$exists operator for queryChannels/queryUsers

## July 22, 2019 - 1.0.2

- Support hard delete messages for server side auth

## July 19, 2019 - 1.0.1

- Fixing broken types in ts declaration file : [264ee9a87d6591d39f20b99d1d87381532b9957b](https://github.com/GetStream/stream-chat-js/commit/264ee9a87d6591d39f20b99d1d87381532b9957b)

## July 18 2019 - 1.0.0

- This library is stable and used in production already, bump to 1.0.0

## July 18 2019 - 0.13.8

- Avoid memory leaks server-side when client is created many times

## July 11 2019 - 0.13.7

- Track client version with WS
- Add configurable logging
- Bugfix: reconnection and threads' replies are now handled correctly
- Bugfix: replies pagination now works with both ASC and DESC ordering

## June 27 2019 - 0.13.6

- Improve reconnection mechanism

## June 20th 2019 - 0.13.5

- Added populated `channel.data` when calling `channel.watch()`

## April 29th 2019 - 0.12.0

- Improved channel.unreadCount

## April 28th 2019 - 0.10.1

- Improved user presence support. If listening to user presence, channel.state.members and channel.state.watchers
  are now automatically updated with the user's online/offline presence.

## April 27th 2019 - 0.10.0

- add channel.countUnreadMentions
- improve client.disconnect
- add userID param to add reactions server-side

## April 24th 2019 - 0.9.1

- add babel runtime to dependencies

## April 24th 2019 - 0.9.0

- GDPR endpoints: deleteUser, exportUser and deactivateUser

## April 24th 2019 - 0.8.0

- markRead now supports sending a message_id to mark the channel read up to (and including) that specific message
- added markAllRead client method
- countUnread can be called without any parameters now client-side and it will default to current user's read state

## April 9th 2019 - 0.7.2

- queryChannels used to return the list of members twice, this has now been resolved. However if you were using the duplicate list of members in channel.members you'll want to update to Object.values(channel.state.members)

## April 2nd 2019 - 0.5.0

- event.own_user renamed to event.me
- user.status.changed renamed to user.presence.changed
- connectResponse.unread renamed to connectResponse.unread_count
- channelState.online renamed to channelState.watcher_count
