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
