# stream-chat-react: impact of the v10 pre-release fixes

Throwaway working file. It lists how the fixes landed on stream-chat-js `fix/v10-hotfixes` (section 1 of `ai-docs/v10-followups.md`) affect stream-chat-react, one entry per fix as it lands.

- **stream-chat-react:** `master` @ `2db4e7b5e` (`15.0.0-rc.2`, `stream-chat` `^10.0.0-rc.22`).

## Breaking for React

### 1. `typing` removed from the text composer

`TextComposerState` no longer has `typing`, and `TextComposer` no longer has the `typing` getter / setter, `setTyping`, `setTypingEvent` or `removeTypingEvent`. `channel.state` is the only owner of the typing map (`TypingUsersState['typing']`, still `Record<string, Event>`). v9 had no composer typing either; the copy existed only in the v10 release candidates.

React reads the composer copy in four places, all through the same selector over `messageComposer.textComposer.state`:

- `src/components/TypingIndicator/TypingIndicator.tsx:30,62-63`
- `src/components/TypingIndicator/TypingIndicatorHeader.tsx:21,45-46`
- `src/components/ChannelHeader/ChannelHeader.tsx:18,28-29`
- `src/components/Thread/ThreadHeader.tsx:25,49-50`

Each one compiles against a missing `typing` key and then reads `{}`, so no typing indicator renders. The replacement reads the channel's store; `messageComposer.channel` is already available in all four:

```ts
import type { TypingUsersState } from 'stream-chat';

const typingSelector = ({ typing }: TypingUsersState) => ({ typing });

const { typing = {} } =
  useStateStore(messageComposer.channel.state, typingSelector) ?? {};
```

The existing `parent_id` filters stay as they are. Inside a thread, `useMessageComposerController()` returns the thread's own composer, and `stream-chat` only ever copied typing into `channel.messageComposer`, so on the RCs the thread-mode indicators (`TypingIndicator`, `TypingIndicatorHeader`, `ThreadHeader`) always saw an empty map. Reading `channel.state` makes them work for the first time.

Tests that seed the composer copy need to seed `channel.state` instead (`channel.state.setTypingEvent(userId, event)`, or `channel.state.typing = {...}`):

- `src/components/TypingIndicator/__tests__/TypingIndicator.test.tsx:23-71,116` (builds a fake `textComposer.state` store for thread mode and assigns `channel.messageComposer.textComposer.typing`)
- `src/components/Thread/__tests__/ThreadHeader.test.tsx`

### 14. Positional client and channel methods take one request object

`pinMessage` / `unpinMessage`, `getThreadAndHydrate`, the channel member and filter-tag helpers, `channel.deleteImage` / `deleteFile`, `client.polls.queryPolls` and `moderation.flagMessage` / `flagUser` now take the same object shapes as the generated methods. `requestOptions` stays the last argument.

| Method                                                   | Before                                           | After                                                                                                            |
| -------------------------------------------------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| `client.pinMessage`                                      | `(messageOrId, timeoutOrExpiration?, pinnedAt?)` | `({ id }, { pin_expires?, pinned_at? }?)`, `pin_expires` a `Date` / RFC3339 string / `null`, no relative seconds |
| `client.unpinMessage`                                    | `(messageOrId)`                                  | `({ id })`                                                                                                       |
| `client.getThreadAndHydrate`                             | `(messageId, options?)`                          | `({ message_id }, options?)`                                                                                     |
| `channel.addMembers` / `inviteMembers` / `removeMembers` | `(members, message?, options?)`                  | `({ members, message?, ...options })`                                                                            |
| `channel.addFilterTags` / `removeFilterTags`             | `(tags, message?, options?)`                     | `({ tags, message?, ...options })`                                                                               |
| `channel.deleteImage` / `deleteFile`                     | `(url)`                                          | `({ url })`                                                                                                      |
| `client.polls.queryPolls`                                | `(filter, sort?, options?)`                      | `({ filter, sort?, ...options })`                                                                                |
| `client.moderation.flagMessage` / `flagUser`             | `(id, reason?, options?)`                        | `({ message_id, reason?, ...options })` / `({ user_id, reason?, ...options })`                                   |

React call sites that change:

- `src/plugins/ChannelDetail/Views/ChannelMembersView/ChannelMembersAddView.tsx:240`: `channel.addMembers(selectedUserIds)` -> `channel.addMembers({ members: selectedUserIds })`
- `src/plugins/ChannelDetail/Views/ChannelMemberDetailView/ChannelMemberActions.defaults.tsx:603`: `channel.removeMembers([targetUserId])` -> `channel.removeMembers({ members: [targetUserId] })`
- `src/plugins/ChannelDetail/Views/ChannelManagementView/ChannelManagementActions.defaults.tsx:644`: `channel.removeMembers([client.userID])` -> `channel.removeMembers({ members: [client.userID] })`
- `src/components/ChannelListItem/ChannelListItemActionButtons.defaults.tsx:270`: `channel.removeMembers([client.userID!])` -> `channel.removeMembers({ members: [client.userID!] })`
- `src/components/Message/hooks/useFlagHandler.ts:22`: `client.moderation.flagMessage(message.id)` -> `client.moderation.flagMessage({ message_id: message.id })`
- `src/components/Message/hooks/useMessageAlsoSentInChannelNavigation.ts:78`: `client.getThreadAndHydrate(parentId, { watch: true })` -> `client.getThreadAndHydrate({ message_id: parentId }, { watch: true })`

`client.pinMessage(message)` / `client.unpinMessage(message)` in `src/components/Message/hooks/usePinHandler.ts:69,94` pass the message object, which still compiles.

Test assertions on the old argument shapes:

- `src/plugins/ChannelDetail/Views/ChannelMembersView/__tests__/ChannelMembersAddView.test.tsx:161,214` (`addMembers`)
- `src/plugins/ChannelDetail/__tests__/ChannelManagementActions.defaults.test.tsx:448` (`removeMembers`)
- `src/components/ChannelListItem/__tests__/ChannelListItemActionButtons.defaults.test.tsx:464` (`removeMembers`)
- `src/components/Message/__tests__/Message.test.tsx:557,577` (`flagMessage`)
- `src/components/Message/__tests__/MessageUI.test.tsx:787` and `src/components/Message/hooks/__tests__/useMessageAlsoSentInChannelNavigation.test.tsx:171` (`getThreadAndHydrate`)
