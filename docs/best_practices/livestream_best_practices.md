This guide is designed to provide general best practices for the Livestream and Live Events use cases.

- Use the **Livestream channel type** which doesn't require membership for read/write access
- **Disable expensive features** like read events, typing indicators, and connect events to improve performance
- Enable **slow mode** and message throttling for high-traffic events
- **Pre-load users** before events to avoid registration bottlenecks
- Use **virtualized lists** on web to limit DOM elements and protect performance
- **Load test your app** at high message volumes to catch UI performance issues
- Implement **moderation tools** like block lists, automod, and flagging

### Channel Types

The Livestream channel type is designed to be used in a Livestream setting and has pre-configured permissions that do not require membership as a registered user to read or write to a channel. This channel type is "open" to any user accessing it with an authorized JWT. Users are not required to be added as members, which saves complexity and additional updates to the channel through the [membership endpoint](/chat/docs/node/channel_members/). The channel can be "[watched](/chat/docs/node/creating_channels/#watching-channels)" by users in order to receive real-time updates on the activity (new messages, etc) in the channel.

> [!NOTE]
> For general information on understanding [channel types](/chat/docs/node/channel_features/), [roles](/chat/docs/node/update_users/), and [permissions](/chat/docs/node/chat_permission_policies/), please refer to those documentation pages.


Live events, by contrast, may sometimes be well suited for the Livestream channel type, but frequently require membership for interacting in channels. Creating a new channel type with similar settings to the Livestream channel, but with some tweaks to tailor to your event platform's needs, may be necessary.

### Channel Features

A performant website or mobile app can easily be degraded or overwhelmed by excessive API traffic. The Stream API has been designed with this in mind with features to protect clients (see [throttling](/chat/docs/node/slow_mode/) and [slow mode](/chat/docs/node/slow_mode/#channel-slow-mode/)). However, we still recommend taking these additional steps.

Certain features that are beneficial to remove for Livestream type settings (in order of performance impact) are

1. Read events

2. Typing indicators

3. Connect events

4. File uploads

5. Custom messages

The Stream Chat API automatically starts throttling typing and read events at 100 watchers in a channel, but it is good practice to remove these from the start, as even 100 very active users can be problematic. It's also worth noting that typing and read events lose their value in user experience as active users rise.

### Message Throttling and Slow Mode

The Stream API will begin to throttle messages at >5 messages per second and some messages will not be delivered to all clients watching a channel to protect the client from degraded performance. We also recommend considering Slow Mode for events in which traffic is expected to be particularly high.

> [!NOTE]
> For reference, Stream found that in [this SpaceX launch video](https://www.youtube.com/watch?v=gBELXjq_X-M), the peak message volume was 9 messages per second, and the Chat experience was difficult to follow.


### Application Settings

> [!NOTE]
> It is always recommended to ensure that [Auth and Permission checks are **not** disabled](/chat/docs/node/app_setting_overview/) for any application that is in a production environment.


It is common for guest or anonymous users to be integrated into Livestream channels. These users have access to fewer permissions by default, but this is entirely configurable. Guest and Anonymous users do not require a signed JWT from a server.

### Adding Users Prior to Events

Stream recommends that users are "pre-loaded" into the Stream API prior to the event. This prevents registration/upsert bottlenecks at the start of the event. In particular, for channels that may have large member counts, it is advised to add members to these ahead of time.

If this can't be achieved, based on your app's use case, then we recommend batching users being added to Stream and members being added to channels. Both upsertUsers and addMember endpoint accept up to 100 user_id's in a single API call.

Lastly, if this isn't possible, and you expect to exceed rate limits, please email <https://getstream.io/contact/support/> with your use case and we may seek to make an exception for your application to avoid any disruptions.

### API Calls to /channels

There are [several methods](/chat/docs/node/query_channels/#channel-creation-and-watching) that will trigger an API call to /channels. Watch, query, and create. Only one of these is necessary and additional API calls quickly add up and can be problematic. Filtering and sorting generally are not issues for this use case, but for more information on optimizing these queryChannel parameters, take a look at the [best practices](/chat/docs/node/query_channels/#best-practices).

### Virtualized Lists

Using a Virtualized list on a web platform is a recommended means to cap the number of messages stored in the DOM and have proven to significantly improve client performance and protect the quality of a video stream. For more information on the Stream Virtualized list components, take a look [here](https://github.com/GetStream/stream-chat-react/blob/85c75524cafdcdf3b64f04995b608de88ac6d23c/src/docs/VirtualizedMessageList.md). The key caveat to the Virtualized List component is that messages should have a fixed height, which can make images, emojis, and custom messages types problematic.

### Load Testing

Before launching a live event, test your application under high user and message volumes. It's easy to have subtle mistakes in UI elements that cause performance degradation at scale—issues that aren't apparent during normal development and testing.

Common issues that only surface under load:

- **Expensive re-renders**: Components that re-render on every message can cause lag when message volume is high
- **Memory leaks**: Unbounded message lists or event listeners that aren't properly cleaned up
- **Avatar and image loading**: Fetching user avatars or images for every message without caching
- **Complex message formatting**: Rich text parsing, link previews, or emoji rendering that doesn't scale
- **Animation overhead**: CSS animations or transitions that compound with high message frequency

Use Stream's [benchat](https://github.com/GetStream/benchat) tool to stress test your chat channels and simulate realistic traffic patterns. Test with at least 5-10 messages per second to approximate peak livestream conditions, and monitor your application's CPU usage, memory consumption, and frame rate during these tests.

> [!TIP]
> Profile your application using browser developer tools or mobile profilers while simulating high traffic. Look for long-running JavaScript tasks, excessive DOM updates, and memory growth over time.


### Moderation

Stream provides a number of moderation tools that can be useful in a Livestream setting:

1. **Users flagging messages** - Any user has the ability to flag another user's message. Flagged messages are currently sent to the Stream Moderation Dashboard and flagged messages also trigger a Webhook event.

2. **Moderation Dashboard** - available to all customers and includes a chat Explorer, Flagged Message review area, and a number of API driven features to ban or delete users.

3. **Block Lists** - a simple but powerful tool to prevent lists of words from being used in a Chat. These are applied on a Channel Type basis and either a Flag or Block behavior can be defined.

4. **Pre-send message hook** - a customer-hosted solution that provides a means to host your own moderation solution that can hook into any 3rd party solutions, have Regex filters, or more advanced filtering based on your own criteria.

5. **AI Moderation** - currently in beta testing currently. Please reach out to <https://getstream.io/contact/support/> to learn more.

6. **Image Moderation** - an addon to Enterprise packages and will flag images that are deemed to be inappropriate by the moderation logic.
