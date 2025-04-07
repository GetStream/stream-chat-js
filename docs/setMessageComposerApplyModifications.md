# StreamChat.setMessageComposerApplyModifications

One `MessageComposer` setup function per client, ideally you'd setup this function only once (or each time a specific dependency changes).

```tsx
import { defaultTextComposerMiddlewares } from 'stream-chat';

const chatClient = useCreateChatClient({
  apiKey,
  tokenOrProvider: userToken,
  userData: { id: userId, language: 'en' },
});

const [emojisEnabled, setEmojisEnabled] = useState(false);

useEffect(() => {
  chatClient.setMessageComposerApplyModifications(({ composer }) => {
    if (composer.contextType === 'channel') {
      composer.textComposer.upsertMiddleware(
        defaultTextComposerMiddlewares.map(composer.channel),
      );

      if (emojisEnabled) {
        composer.textComposer.upsertMiddleware([createEmojiMiddleware(SearchIndex)]);
      }

      return () => {
        composer.textComposer.removeMiddleware('emoji');
      };
    }
  });
}, [chatClient, emojisEnabled]);
```

Each `MessageComposer` has a `contextType` getter which gets evaluated from the `compositionContext` value provided at construction time. A composer can have a context type of `channel`, `thread`, `legacy_thread` or `message`.

You might not need this information but it's there when you need it; for example when you're deciding what middlewares to apply to only channel-based or thread-based composers.

:::note
Type `legacy_thread` is a simple message object extended with `legacyThreadId` property whose value equals to that message's `id`.
:::
