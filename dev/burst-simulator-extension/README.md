# Stream Chat Burst Simulator (Chrome extension)

Dev-only Chrome extension that dispatches synthetic `message.new` and `reaction.new` events at a Stream Chat `Channel` for stress / perf testing the chat UI. Triggered from a popup; runs entirely in the active tab.

Not part of the npm package. Not shipped to users.

## Quick start

```bash
git clone git@github.com:GetStream/stream-chat-js.git
cd stream-chat-js
# the extension lives at:
ls dev/burst-simulator-extension/
```

Then load it in Chrome (or any Chromium-based browser supporting Manifest V3):

1. Open `chrome://extensions`.
2. Toggle **Developer mode** on (top right).
3. Click **Load unpacked** and select the `dev/burst-simulator-extension/` folder.
4. (Optional) Pin **Burst Simulator** to your toolbar — easier access while testing.

After editing any file in the folder, click the refresh ↻ icon on the extension's card on `chrome://extensions`. No build step is required.

> **Browser support.** Chromium-based browsers with MV3: Chrome 88+, Edge 88+, Brave, Arc, Opera. Not tested with Firefox.

## Use it

1. Open a page where a Stream Chat `Channel` is mounted (any React app using `stream-chat-react` works — no manual setup needed).
2. Click the **Burst Simulator** icon. The status line should resolve to `Ready · <cid> · …`. If detection fails, the ↻ button re-runs detection.
3. Configure:
   - **Total events** — synthetic events to dispatch (default `1000`)
   - **Rate per second** — pacing; `0` = fire all in one tick (default `75`)
   - **Reactions ratio** — `0`–`1`, fraction of events that are reactions (default `0.25`)
   - **User pool size** — distinct fake users to rotate (default `10`)
4. Click **Fire burst**. Live progress streams to the status line: `Running · 230 / 1000 · 76 eps · 3s`. The button morphs into a red **Stop** — click to abort and get a partial result. Closing the popup does **not** stop the run; reopening re-attaches.

## How it works

On click, the popup uses `chrome.scripting.executeScript({ world: 'MAIN' })` to inject [`simulator.js`](./simulator.js) into the active tab's main world (where the page's `window` and React tree live). The simulator:

- builds a pool of fake users
- generates `message.new` events with varied text (3–50 words, occasional emojis / fake URLs / line breaks) so the renderer has real layout work to do
- generates `reaction.new` events targeting any of the burst-generated messages, picked at random; pre-applies `latest_reactions` / `reaction_counts` / `reaction_scores` / `reaction_groups` to `event.message` so `channel_state.addReaction` lands them correctly
- routes each event through `client.handleEvent({ data: jsonString })`, exercising the WS frame's `JSON.parse` cost
- paces dispatch by `ratePerSec`, or fires the whole burst in one `requestAnimationFrame` tick when rate is `0`
- returns `{ dispatched, durationMs, messages, reactions, aborted }` and `console.log`s the same; the popup also surfaces it in the status line

> **Note on parse cost.** The simulator currently runs an extra local `JSON.parse(jsonString)` to mirror the pre-[#1729](https://github.com/GetStream/stream-chat-js/pull/1729) `connection.onmessage` shadow parse. With #1729 merged, prod does a single parse — flipping the simulator to single-parse is a planned follow-up.

### Channel detection

The popup auto-binds the channel by walking the React fiber tree on open. It looks for any prop whose value duck-types as a Channel (`getClient` + `cid` + `id` + `type`) — including the conventional `channel` prop on `<Channel channel={ch}>`. When multiple Channels exist (e.g. a `ChannelList` of previews next to an active `<Channel>`), it picks the one whose owning fiber wraps the largest subtree.

Manual override: set `window.streamChannel` (canonical) or `window.channel` (alias) before opening the popup, and the fiber walk is skipped.

## Recommended profiling workflow

1. Open the page, open DevTools → **Performance**.
2. Open the extension popup, set your config.
3. Click **Record** in DevTools.
4. Click **Fire burst**. Wait for completion.
5. **Stop** recording and inspect the flame chart.

For a single all-at-once burst, set **Rate per second** to `0` — every event lands in one frame, captured as one long task.

## Troubleshooting

| Status line                                                                  | Meaning                                                                 | Fix                                                                                                                                  |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `No React root found on this page`                                           | Page isn't a React app, or its root hasn't mounted yet.                 | Reload the page; if not React, set `window.streamChannel` manually before opening the popup.                                         |
| `No Channel-shaped prop found in the React tree`                             | React is mounted, but no Channel-like object is in any `memoizedProps`. | Make sure a chat UI is rendered with an actual channel. Click ↻ to re-detect.                                                        |
| `window.streamChannel / window.channel is set but is not a Channel instance` | One of the globals is set to something that isn't a `Channel`.          | Inspect what's bound, clear it, click ↻.                                                                                             |
| `channel.getClient().handleEvent is unavailable`                             | Probably a `stream-chat` version skew on the host page.                 | Make sure the page uses a recent `stream-chat`.                                                                                      |
| `Detection failed: …`                                                        | `chrome.scripting.executeScript` couldn't run.                          | The tab is likely a `chrome://` or `chrome-extension://` page (extensions can't inject there). Switch to a normal `http(s)://` page. |

## Files

- `manifest.json` — MV3 manifest, `scripting` + `activeTab` only
- `popup.html` / `popup.css` / `popup.js` — popup UI and `executeScript` wiring
- `simulator.js` — core simulator, runs in the page's main world

## Limitations

- `message.new` and `reaction.new` only — no typing, edits, deletes, threads, attachments, or mentions.
- Reactions only target burst-generated messages (not pre-existing channel state).
- Single-channel only (whatever is currently bound to `window.streamChannel` / `window.channel` — auto-bound or manually set).
- Auto-detection requires the page to be a React app and the `Channel` to be live in the fiber tree. For non-React hosts, set `window.streamChannel` manually before opening the popup.
- **Stop is best-effort.** In `rate per second: 0` (burst-all) mode the entire batch lives inside one `requestAnimationFrame` tick, so the abort flag never has a chance to be observed mid-run. Use a paced rate if you want to abort.
