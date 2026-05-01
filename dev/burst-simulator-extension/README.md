# Stream Chat Burst Simulator (Chrome extension)

Dev-only Chrome extension that dispatches synthetic `message.new` and `reaction.new` events at `window.streamChannel` for stress / perf testing the chat UI.

Not part of the npm package. Not shipped to users.

## What it does

On click, it injects [`simulator.js`](./simulator.js) into the active tab's main world (where `window.streamChannel` lives) and calls `window.__streamSimulateBurst(config)`. The simulator:

- builds a pool of fake users
- generates `message.new` events with varied text (3–50 words, occasional emojis / fake URLs / line breaks) so the renderer has real layout work to do
- generates `reaction.new` events targeting the sliding window of recently-generated messages
- mirrors the real receive path's per-frame parse cost: stringify once, `JSON.parse` it locally (matches `connection.onmessage`'s local parse), then hand the string to `client.handleEvent` (which parses it a second time before dispatching). Production does both parses per WS frame — the simulator does too.
- paces dispatch by `ratePerSec`, or fires the whole burst in one `requestAnimationFrame` tick when rate is `0`
- returns `{ dispatched, durationMs, messages, reactions }` and `console.log`s the same so the result survives the popup closing

## Prerequisites

The page under test must render the channel UI with React and `stream-chat`. The simulator calls `channel.getClient().handleEvent(...)`.

You don't need to expose `window.streamChannel` yourself — the popup walks the React fiber tree on open, finds the active `Channel` (by duck-typing: any prop whose value has `getClient`, `cid`, `id`, `type`), and binds it to `window.streamChannel` automatically. If multiple Channel-shaped props exist (e.g. a `ChannelList` of previews next to an active `<Channel>`), it picks the one whose owning fiber wraps the largest subtree — typically the active channel.

If you've already set `window.streamChannel` manually, the popup honors it and skips the fiber walk.

## Load it

1. Open `chrome://extensions`.
2. Toggle **Developer mode** on.
3. Click **Load unpacked** → select this `dev/burst-simulator-extension/` folder.
4. Pin the extension to the toolbar.

After editing any file, click the refresh icon for the extension on `chrome://extensions`. No build step.

## Use it

1. Open a page where the channel UI is mounted (no manual setup needed — the popup auto-finds the active `Channel`).
2. Click the **Burst Simulator** icon.
3. Configure:
   - **Count** — total events (default `1000`)
   - **Rate / sec** — pacing; `0` = fire all in one tick (default `50`)
   - **Reaction ratio** — `0`–`1`, fraction of events that are reactions (default `0.5`)
   - **User pool size** — distinct fake users to rotate (default `10`)
   - **React to last N** — sliding window of recent messages reactions can target (default `20`)
4. Click **Run burst**. Status line updates when the run completes; result is also `console.log`ged in the page's DevTools console.

## Recommended profiling workflow

1. Open the page, open DevTools → Performance.
2. Open the extension popup, set your config.
3. Click Record in DevTools.
4. Click **Run burst**. Wait for completion.
5. Stop recording and inspect the flame chart.

For a single all-at-once burst, set **Rate / sec** to `0` — every event lands in one frame, captured as one long task.

## Files

- `manifest.json` — MV3 manifest, `scripting` + `activeTab` only
- `popup.html` / `popup.css` / `popup.js` — popup UI and `executeScript` wiring
- `simulator.js` — core simulator, runs in the page's main world

## Limitations (v1)

- No mid-run cancel — if a long run is wrong, reload the tab.
- `message.new` and `reaction.new` only — no typing, edits, deletes, threads, attachments, or mentions.
- Reactions only target burst-generated messages (not pre-existing channel state).
- Single-channel only (whatever is on `window.streamChannel` — auto-bound or manually set).
- Auto-detection requires the page to be a React app and the `Channel` to be live in the fiber tree. For non-React hosts, set `window.streamChannel` manually before opening the popup.
