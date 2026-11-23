---
name: llc-spec-intake
description: Read a feature spec written by another team (a backend RFC or API design, an SDK API spec, a ticket) together with the server's code, and write a short document for front-end engineers: what the stream-chat-js (LLC) and the UI SDKs (stream-chat-react, stream-chat-react-native) must do and why, in SDK terms with inline evidence, what already works, and the questions the spec leaves unanswered or answers in a contradictory way, phrased for that team. Use before llc-feature-design whenever the input is a spec that doesn't know the LLC's architecture, or when asked what to ask the backend about a feature.
---

# Read another team's spec for the LLC

A backend spec describes rows, endpoints, status columns, workers, who gets notified and error names. It never says "paginator", "parent" or "store rule", and it leaves out what the server doesn't need to decide. This skill reads the spec and the server's code, and answers one question for the engineers who build the LLC and the UI SDKs: **what do we have to build or check, and what do we need to ask before we start?**

The server's behaviour appears in the document only as the reason for something the SDK must do, or as the subject of a question. A front-end engineer should finish it knowing what the SDK must do, not how the server works.

## The document

Save it as `specs/<feature>/spec.md` in this repo, and your run notes as `specs/<feature>/intake-run-notes.md`. `<feature>` is a short kebab-case name for the feature (`message-reminders`); when the folder exists, add the files next to what it holds and change nothing else in it. When the `spec.md` there holds an earlier intake of this feature (it opens with a Sources line), rewrite the intake parts under "Changing an intake later" below, keep every `Answer:` line and the `## Design` section, write every part that relies on an answered question as its `Answer:` says, not as the earlier assumed answer, and tell whoever started you that the Design section may be stale. Any other `spec.md` is not yours to overwrite: ask where to save. When your brief gives other paths, use those. The file is the feature's one spec; `llc-feature-design` adds to it.

**Changing an intake later** (a rerun, `llc-feature-design` applying answers, a review): ids are never renumbered or reused. Anything added goes where this skill's rules place it, at the end of its group (a new choice after the last choice, before the "not now" decisions), and takes the next number of its kind, even where that breaks the order of the numbers; a blocking question also joins the In short's blocking list. A wrong statement is corrected in place, and its item keeps its id. When two parts contradict, correct the one the sources don't support, then every part that relied on it. A question that is answered or no longer needed stays where it is. An id no longer needed keeps its text, with "not needed (<the id that settles it>)" at the end of its title or in the first cell of its table row; an id needed only by unneeded ids is unneeded too. A question with an `Answer:`, or marked not needed, is marked non-blocking and leaves the In short's blocking list. An `Answer:` line gives, in one sentence, the facts the SDK acts on, and its source as the **Links** rule says; the Sources line doesn't list answers.

It opens with a **Sources line** (template, section 6), then eight parts, in this order.

The Sources line names the spec, its date and status, and whether it has an out-of-scope list; the design doc and the ticket, each read or "not read" with what it would have covered; the linked docs read; that `src/gen` was checked; the server repo's path, its commit, whether it is behind `origin/master` and whether the source is partial, or "not available"; the UI SDK checkouts and their commits; the other chat apps compared, with the sources read for them; each source from outside this repo as its link, or marked "(no URL)" (the **Links** rule); and Stream's own setup: the internal feature flag and any setup gap, which is anything only Stream can fix, for one app or for all (a server integration not configured, a rejected provider key). Leave out branch names, which go in your run notes, and the tool each document was read through (a PR that is itself a source stays).

1. **In short.** At most six lines, sub-bullets included:
   - who asked for the feature and what they use it for (the customer and their use case, from the design doc or the ticket), and any committed date;
   - what changes for a user of the app;
   - where the data lands in the SDK, and whether the feature adds a node to the ownership map or a field or event to an existing one;
   - how much SDK work it is;
   - which questions are blocking, listed by id (section 5).

   Example: "Requested by a customer whose agents follow up on open chats; the list in the app is secondary. A user can ask to be reminded of a message later and see their reminders in one list. In the SDK it's an entity of its own, kept by `client.reminders` (a `ReminderManager` on `StreamChat`) and listed by a `ReminderPaginator`, with its own events. Work: regenerate `src/gen`, event handling in `client.reminders`, the timer per reminder, a list in both UI SDKs. Blocking: Q1–Q3."
2. **What the user sees.** Four pieces:
   - **The main scenario:** one realistic flow, as steps in the UI, each saying what the user sees. It stays online, never restarts the app, and shows the feature with every item built (a decision that defers an item says what users see meanwhile). Every action it shows on a new field or entity is a "yes" in "Who can do what". At each step where an event or response arrives, name each risk it brings to the content that step shows, as what must hold, with its id: "`reminder.created` arrives after the create response; `client.reminders` must hold one copy (A2)". A risk goes at the step where its threat arrives, never at a later user action. Never write it as an outcome ("X stays", "nothing happens"); an id never replaces the risk. Tell each arrival at one step only; a later event of the same type is a new arrival with its own risks at its own step (after another device's edit of a reminder, the user's own edit brings a second `reminder.updated`). A risk whose threat arrives at no step that shows its content stays out (its id still covers it). Several risks at one step are sub-bullets, each starting with whose screen it is ("Jane:", "Both:"). A step that shows new UI with nothing at risk names the item that builds it ("she sees the reminder time (U1)"). Leave out a step with neither, unless the flow needs it. A risk to what the offline DB stores goes at the step where its event arrives; what the user then sees offline is the Offline table.
   - **Who can do what:** a table for each new field, entity or setting (such as a channel config field). Rows are the actors (the author, other members, moderators, the integrator's backend, Stream's server); actors whose cells match share a row. The columns are create, read, update, delete and any special action for a field or entity, and Set and Read for a setting. Each cell says yes or no and how (a UI action, an endpoint, "server only"); for an entity the client only receives, the Read cell says where it arrives ("every response and event that carries the message"). A cell no source settles reads "assumed yes" or "assumed no", and is a question only when an item or the UI depends on it. A cell for an action the API allows but the UI SDKs don't offer reads "yes: <endpoint>; not offered in the UI". A "no" a user would expect to be a "yes" (a user can't set two reminders on one message) is a question. A per-user control another app offers (an opt-out) is not a cell: it is a question or a decision. A setting no client can set gets one line instead of a table (template). A field no client can write gets no table, only one bullet: it is **read-only**, where it arrives, its outcome on each path from checklist row 3 and what a read returns for a value an app already stored under that name, with the id that covers each (a path the server ignores and nothing depends on needs no id), and who can correct or hide a wrong value, or a question when nobody can.
   - **When it goes wrong:** one line for each non-happy path that "Where a finding goes" sends here and the main scenario doesn't walk: what triggers it, what the user sees, and the id that covers it.
   - **States:** a table of the states the UI has to draw. A row's first cell names the state, followed by only those causes the SDK can't tell apart (a cause the channel config reveals is one it can tell apart), or, when a question's Case lists them, by that question's id alone. A failure that leaves no trace, including an event lost after the data was stored, gets no row of its own: its E id joins the first cell of the state it looks like ("still coming"), and that row keeps its own cells. Then: what the SDK receives, what the UI shows, and whether the SDK can tell the state apart. Each row names the id that covers it; where the SDK can't tell the state apart, that id is the question or item, and the row doesn't explain again. The row of an error that leaves a stored error value (the exception under "Where a finding goes") names the state by what the UI shows, with its E id ("Failed (E1)"); its receive, show and Covered by cells read the E id only, and its tell-apart cell is yes or no.
3. **Errors.** A table of every error the feature can produce, whether the server returns it, stores it in the data, or never reports it. Errors whose cells match in every column except the first share one row, with each cause and value listed in its first cell ("`limit_exceeded`, `not_allowed`, `expired`, or any other stored value"). Causes inside the server that the client can't see (an outside service failing, retries running out) are one cause, written only as "the server gave up", without the server's reasons. A setup gap is not a cause; a value it leaves in the data is shown by that value's row. An event lost after the data was stored is its own row, because the next query repairs it. Rows are numbered E1, E2, …. Every cell is filled; a dash or a bare pointer ("depends on Q2") is never an answer: write what the user sees under the assumed answer, then the id. Each row has:
   - **the error and the case that causes it** ("the reminder time is already in the past");
   - **how the SDK learns of it:** an error response (HTTP status, numeric code, reason), a value stored in the data (an `error` field, a `failed` status), an event, or nothing at all;
   - **final or retryable**, and who decides: the server retries, the client may retry, or nobody does;
   - **who learns of it:** the user who acted, every member, the integrator's code only, or nobody;
   - **what the LLC and the UI SDKs do with it today, before any item of this feature is built:** the code path it takes and where that ends (section 4, "Follow every error through the SDK"), with the reasoning; only the ending and the id when an item changes that path or an A line walks it ("repaired on the next load (A6)");
   - **what the user should see**, and the id that covers it, or "none needed" when the SDK's path today is right.
4. **Offline.** A table with one row per question of section 4, "Walk the feature offline" (row names in the template), and two answer columns: stream-chat-react, which has no offline DB, and stream-chat-react-native with its offline DB. Each cell gives the verdict in a few words ("kept", "not kept", "queued") and ends with the id that covers it, or with "n/a:" and the reason and no id ("n/a: the feature has no user action"). A failed request ends with its E id.
5. **What the SDK must do.** Two lists: **In the LLC** (L1, L2, …) and **In the UI SDKs** (U1, U2, …). Only work that needs doing. An existing LLC or UI behaviour that some normal use of the feature always hits (a memo comparator that ignores the new field) is an item of this feature, even when its fix also helps other triggers. Its Why starts with "Existing:" and says how it shows today, naming every event or call that triggers the code path today (read its listeners; don't stop at the first). One that needs two requests or events to land within one round trip, or an unusual setup, is a fix-or-file decision instead; being quick (editing within seconds of sending) is normal use, so that is an item. An item that waits for a decision names it (D3) instead of stating its default. Work that only an answer other than the assumed one needs is not an item; the question's "What the SDK does with the answer" names it. Each item has:
   - **the change**, in SDK terms;
   - **why:** the reasoning that leads to the change, in one or two sentences: what the code, the spec or the server does, and what follows for the SDK ("Show how you got to each claim"). A Why that starts with "Existing:" or carries an announced change may add one sentence for it; a re-render Why may pass that (section 4, "Follow the new data to the screen");
   - **where:** the file, method or component; for a UI item, which SDK (stream-chat-react, stream-chat-react-native or both);
   - **depends on:** the question, decision or other item it waits for, or "none";
   - **evidence:** one line of sources.

   Example:
   - **L2. A reminder the user deleted must not come back when a query returns its message.**
   - Why: Existing: `ReminderManager.hydrateState()` adds every `message.reminder` that a channel query (`Channel.applyChannelStateFromResponse`) or channel-list query (`StreamChat.hydrateChannels`) returns to `client.reminders`, and the spec doesn't say a delete clears it (spec "Delete"), so the reminder could return.
   - Where: `ReminderManager.hydrateState()`, `ReminderManager.deleteReminder()`.
   - Depends on: Q3.
   - Evidence: spec "Delete"; `src/gen/models/index.ts` (`MessageResponse.reminder`); `src/reminders/ReminderManager.ts`.

   When one SDK already handles what the other needs, the item is about the one that needs work; the other goes under "Already works".

   Then **Already works, don't rebuild** (A1, A2, …): one line each: what works, the existing service that covers it, and why it covers it ("edits reach quoted copies: `Channel._handleChannelEvent` calls `messagePaginator.reflectQuotedMessageUpdate()` on `message.updated`"). The design step reuses these instead of building them again. Keep the service and why it covers the case; a step-by-step walk stops at two sentences, except a re-render line, which follows section 4, "Follow the new data to the screen". A line about what the UI draws names the code it relies on in each UI SDK whose checkout you read, and is marked assumed for one you didn't. A line that holds only if the server confirms something says "relies on Qn". A line whose path replaces without comparing (such as `EntityStore.upsert()`, `MessagePaginator.ingestItem()`, `reflectReactionEvent`, a query page; checklist row 7) names the item, decision or question that covers an older copy arriving later. Before you write a line, re-read every step of the path it names: a wrong line hides work from the design step.
6. **Questions for the spec's team** (section 5).
7. **Where the sources disagree:** the spec, the design doc and the ticket, the server's API definitions, the server's code and the linked docs. One line each (differences one source settles the same way may share a line) with both statements, their evidence, and what settles it (section 3). A docs-issue line (section 5) gives only what to document or fix, in which doc, and its evidence. A disagreement a question asks is only "<topic>: asked in Qn"; the question's Case carries both statements and its Evidence line the paths. These also go to the other team.
8. **Decisions for the SDK team** (D1, D2, …), in three kinds, shaped as in the template: prerequisites on our side (such as regenerating `src/gen`); choices only the SDK can make, including fix-or-file decisions ("What the SDK must do"); and "not now" decisions for out-of-scope work or announced future work. A choice has what it affects and a proposed default stated only as what the user sees, with no reason and no other app; a fix-or-file decision's Affects is "the behaviour in the title" and its default is the option alone; a prerequisite and a "not now" decision take only the lines the template gives them. A choice's title is only its options, in a few words, with no case or reason after it ("Sort the reminders list on the client, or trust the server's order"). A fix-or-file title first names the existing behaviour in a few words, with no cause or mechanism ("Reminder list order after a reconnect: fix with the feature, or file separately"). The default doesn't restate the item it covers. These go to `llc-feature-design`, not to the other team.

### Where a finding goes

Every checklist row (section 3) and every walk in section 4 ends here:

| Finding | Goes to |
| --- | --- |
| SDK code must change | an L or U item |
| An existing service covers it | an "Already works" line |
| The server's team must change, confirm or settle it | a question |
| Only the SDK team can choose | a decision |
| Two sources state it differently | a disagreement line, plus a question when section 3 asks for one |
| `src/gen` is behind the server | a prerequisite decision |
| Stream's setup (the internal feature flag, a setup gap) | the Sources line and the test-app question (row 21), nowhere else |
| Who may create, read, change or delete a new field or entity, or set or read a setting | "Who can do what" |
| How another chat app does it (section 1, "Other chat apps") | a question or a decision, or both, by the rows above (in a decision, one sentence after its Affects ids), when it differs in a way that changes what the SDK does or leaves undecided a detail that would; nowhere otherwise |

A non-happy path goes to the first place that fits:
1. an outcome "Who can do what" already states (nobody can correct or hide a wrong value), or a path that can't happen for this feature: nowhere. An error the server returns on such a path still gets its Errors row;
2. a failure, whatever triggers it, including one that leaves no trace (a setting turned off while the server's work on some content is pending, and the server drops that work): an Errors row;
3. being offline, or catching up after it: the Offline table;
4. a result the UI keeps drawing until something changes: a States row;
5. a path the user passes through (a permission lost and regained, a concurrent edit): a "When it goes wrong" line.

The one exception: an error that leaves a stored error value is both an Errors row and a States row. A failure that leaves no trace adds only its E id to the state it looks like (States).

### Rules for the whole document

- **State each fact once**, in the part where someone acts on it. Everywhere else, refer to it by its id (L2, U1, A3, E2, Q3, D1) with no reason clause; a table cell that an item or an A line explains gives the verdict and the id only ("no (A4)", "kept (A8)", "not kept (L3)"). A pointer never names a part or a row ("see Offline", "row 3"). Questions are the exception: they go to the other team, so each states its case in full, and whatever depends on a question points to it by id.
- **Show how you got to each claim.** Every claim carries the reasoning behind it, written once, where the claim is stated: in an item's Why, an "Already works" line, a question's case. A scenario step, a "When it goes wrong" line or a state row that points to an id uses that id's reasoning; a scenario step with no id gives its reason in a short clause ("…, because `reminder.updated` overwrites the stored reminder's data"). The reasoning says what you observed, where, and what follows from it. Keep the observed part ("`client.reminders` keys reminders by message id", "the spec says") apart from the inference ("so a new reminder on the same message replaces the old one"). A link you assumed rather than read is marked "assumed", and becomes a question under the rules in section 3 ("A fact counts as answered…"). A fact that rests on code your inputs don't contain (a partial server export, a UI checkout that lacks a file) is assumed when the search in section 1, "The server repo", doesn't find it: mark it "assumed" where the document states it, add "relies on Qn" when a question can settle it, and list those files in your run notes.
  - **Don't:** "A new reminder replaces the old one."
  - **Do:** "A new reminder replaces the old one: `ReminderManager.upsertReminder()` sends an update, not a create, when `client.reminders` holds one for the message or the create fails because one exists (`src/reminders/ReminderManager.ts`); the server keeps one reminder per user and message ([server `<commit>` `lib/chat/<feature>/…_test.go`](<url>))."
- **Other chat apps:** outside the questions, another app's behaviour is stated once and referred to after that; every mention, a question's Case included ("in WhatsApp (documented), …"), carries its documented or observed mark, linked to the page it rests on ("in WhatsApp ([documented](https://faq.whatsapp.com/…)), …"; section 1, "Other chat apps").
- **Context first, then detail.** Each item, "Already works" line, question, decision and scenario step reads on its own: it opens with the situation in plain words (who does what, where the user sees it), then gives the SDK detail. Name each field, setting and store in full with its owner the first time it appears (`channel.config.<setting>`, set per channel type on the server; `client.reminders` in the LLC). Context is a clause, not a paragraph, and never repeats a fact another part states. Write short sentences with one claim each; split a sentence that chains semicolons or nests parentheses, and drop words that don't change the meaning ("note that", "in order to", "basically").
  - **Don't:** "Stale `remind_at` after resync; wrong badge (U3), relies on Q2."
  - **Do:** "A user moves a reminder to tomorrow on their phone while their laptop is offline. After the laptop reconnects, `client.reminders` still holds the old due time until reminders are queried again, so the laptop shows it as due today (U3; relies on Q2)."
- **The checklist (section 3) is your research, not part of the document.** Don't list its rows. Finish the document with one line, "Checked, nothing for the SDK:", naming the checklist items that don't apply to this feature (nothing to build, reuse or ask), each with its reason in a few words ("bounds: no lists in any payload") unless the item's name already says it, and the out-of-scope entries that settle nothing else. Anything an existing service covers goes under "Already works" instead.
- **Cut what repeats.** There is no word limit; the document is as long as the feature needs. Before you hand over, cut: reason clauses next to ids; decision defaults that restate the item they cover; "Already works" walks past two sentences, except a re-render line; closing-line reasons the item's name already gives; branch names and the tool each document was read through; server mechanics outside evidence paths; the server's reasons after "the server gave up". Never cut a named risk, a read-only marking, an error, an Offline row or a question: merge rows that are handled alike, or trim a Why to its allowed sentences. Put the word count (`grep -v '^| ---' <file> | wc -w`) in your run notes.
- **Keep notes about the run itself** (unclear instructions, missing inputs, tooling problems, and the lists section 7 asks for) out of the document: write them to the run-notes file, and name that file to whoever started you.

Don't design anything here; the design skill does that from the document. Paths are relative to the repo root. The LLC code this skill and `llc-services` describe is `master`'s: when this checkout is on another branch, read `src/` (`src/gen` included), `CLAUDE.md` and `AGENTS.md` with `git show origin/master:<path>`.

## Write in the SDK's language

The reader is an SDK developer. Every item and state is stated as what it means for the SDK, not as what the server does. Questions are phrased for the other team (section 5).

- **In the LLC:** call `channel.messagePaginator` the channel's message list ("channel list" is the list of channels). The object and state the data lands in (`channel.messagePaginator.state.items`, `client.messageStore`, `channel.config`), the service and the code path that handle it (`Channel._handleChannelEvent` → `messagePaginator.ingestItem()`), and the LLC behaviour that follows.
- **In the UI SDKs:** what a user of stream-chat-react or stream-chat-react-native sees or does, and the component or hook involved when you know it (`<MessageEditedIndicator/>`).
- **Evidence:** the spec section, `src/gen` path or server file that supports it, on the evidence line of the item, question or disagreement, or inside the reasoning; there is no evidence appendix. Cite server code, and server mechanics (SQL, task options, internal function names, column names), as a link there (`[server <commit> path:line](<url>)`, the **Links** rule); don't explain them, there, in the item or in a question's case. If a server detail matters, state its effect in SDK terms and cite the detail.
- **Links:** every source from outside this repo is a Markdown link to its URL each time it is cited: the spec, the design doc, the ticket, a linked doc, a PR, another app's page, and code in the server repo or a UI SDK (`[server <commit> path:line](https://github.com/<org>/<repo>/blob/<commit>/<path>#L<line>)` when the repo has a GitHub remote and the commit is pushed). Link a source whose URL you know even when you read it from a local copy or couldn't open it (a design doc whose URL another document gives). A URL built from facts your inputs give (a repo named by a module path, a PR's head commit) counts as known; the Sources line says once what such links were built from and that they weren't opened. A source with no URL you know is marked "(no URL)" once, in the Sources line (an `Answer:` line's source, which the Sources line doesn't list, on that line), with its path, or with its key or number when you have no copy (a ticket, a PR); elsewhere, name it plainly. A source with a URL is a link at every mention, a plain one included ("the [design doc](<url>) says"). Never leave a source out to pass a check. Code in this repo is cited by its path.

Example, the same fact written both ways:

- **Server language (don't):** "The due-reminder job picks rows past `remind_at` and emits `notification.reminder_due` to the owner's connections."
- **SDK language (do):**
  - In the LLC: when a reminder comes due, an event reaches every connection of its user, also for channels the SDK hasn't loaded. `client.reminders` must handle it there, not a `Channel`, by the event's message id.
  - In the UI SDKs: the reminder shows as due in the reminders list, channel open or not.
  - Evidence: [server `<commit>` `lib/chat/<feature>/…`](<url>).

**Prefer the effect to the backend term.** When a backend term must appear (usually in a question; the Sources line and the closing line count too), including the server's names of states, jobs and settings ("the due-reminder job", "retries ran out"), define it the first time in plain words: who sets it, where it lives, whether the client can see it. Put the backend name after it, in parentheses. A reader who hasn't read the spec must understand every sentence.

- **Don't:** "the message is skipped when `type` isn't `regular` or `reply`".
- **Do:** "the message isn't processed when it isn't an ordinary message or thread reply (its `type` is `system`, `error` or a message held back by moderation)".

## 1. Gather the inputs

- The spec, and the docs it links to when they're reachable. Note its date and status, or that it has none.
- **The design doc and the ticket behind the spec.** A public docs page or a PR shows what was built; the design doc (an RFC) and the ticket hold why, for whom, what was left out and what comes next. Look for them in the spec's links, the server's internal docs, the PR descriptions and the ticket, and read them through the connectors you have (Notion, Linear). One you can't reach, or that your brief rules out, is "not read". From them, record:
  - **who asked and why:** the customers, their use case and any committed date. When the main customer doesn't need the UI (they read the data only through the API, from their own tools), add a decision for the SDK team: ship the UI now, or the LLC types first; its default says what users see, taken from what the spec tells apps to show, without naming the spec; its Affects line also names any announced future work that ties the UI to a later phase;
  - **future work:** extensions the team has announced. Walk them in section 4 ("Leave room for the announced future work").
- **Out-of-scope lists:** the spec's, the design doc's, and any spec section that lists what the feature skips ("Messages that are not processed"). Each bullet is an entry, and a bullet that lists several items is one entry per item. Read them closely: what the server team defers is often what the SDK needs first (deferring push can defer the job that emits the due event). An entry says what the server won't do on purpose, not what other code paths do anyway: it settles a question only after you have read every path that could do it (row 6's triggers). Place each one by section 4, "Account for every out-of-scope entry".
- **The generated API** in `src/gen/` (`chat/ChatApi.ts`, `chat/ChannelApi.ts`, `models/index.ts`): the endpoints, request flags, response fields, event types and their doc comments. We generate it from the server's OpenAPI spec (`yarn generate-client`, see `CLAUDE.md`), so it shows the API as of our last regeneration. When the feature is missing from it, follow section 3, "`src/gen` behind the server"; the server's API definitions are the request and response payloads with their OpenAPI annotations (in the server repo, `lib/chat/controller/v1/payload/`).
- Existing SDK behaviour the feature touches (`.claude/skills/llc-services/SKILL.md`), and the LLC code paths the data will flow through: read them, so each fact can be stated in their terms.
- **The UI SDKs, when available:** the stream-chat-react and stream-chat-react-native checkouts. Ask for their absolute paths, or take them from your brief when you run as a subagent; never guess them. Use them to name the components and hooks that render or trigger the data. Without them, describe the UI behaviour in plain terms. Take LLC code and types only from this repo: never from a UI SDK's `node_modules`, which can hold an older release, or from remarks about the SDK in the server's tests and docs.
- The server's code, when its repo is available (below).
- **How other chat apps do it** (below).

### Other chat apps

Users and customers judge a feature against the apps they already use, often one named app ("like WhatsApp"). The spec rarely spells out that app's details, and a missed detail is a visible bug. In message reminders, Slack offers preset times ("in 20 minutes", "tomorrow") next to a custom one, and a customer who asks for "like Slack" expects them.

- **Which apps:**
  - the app the spec, the ticket or the customer names as the model;
  - two or three widely used chat apps with the feature (WhatsApp, Telegram, Signal, iMessage, Messenger, Slack, Discord);
  - chat SDKs we compete with when they offer it (Sendbird, CometChat, PubNub, Twilio Conversations).

  Start from the spec's own comparison section, if it has one.
- **Where from:** the apps' help pages and the SDKs' public docs. Use web search when you have it. Don't send anything from the spec or this repo to a search engine; search with generic terms ("WhatsApp read receipt group").
- **What to record, per app, at the detail a user notices:**
  - who triggers it and when;
  - who sees it (only the user who triggered it, or everyone), and where in the UI;
  - **whether the current user's own actions count** (the author opening their own message, the user's own reaction);
  - 1:1 versus group behaviour, and what a group shows (count, names, a cap);
  - undo, and privacy settings that turn it off (read receipts off);
  - several devices of one user;
  - what happens on edit, delete and forward.
- **Mark each source**, linked by its URL (the **Links** rule), as documented (the vendor's own help pages, docs or blog) or observed (press, third-party guides, forums). A vendor page read only through a search summary is observed, and so is a detail a documented page implies but doesn't state. Don't build an item on an observed-only detail alone; if it matters, raise the difference as a question or a decision.

### The server repo

The server's implementation answers many questions faster than its team can: which transitions change which fields, who receives an event, what a retry returns. Read it before writing the questions.

- **Find it.** Ask the user with AskUserQuestion for the absolute path of their checkout (the `chat` repo; `yarn generate-client` reads the API spec from it). Never guess one from this repo's location or from another machine. When you can't ask (you run as a subagent), use the path your brief gives. Without one, skip this part: the questions go out as they are.
- **Report its state** before using it (run git in that repo; read-only): the branch goes in your run notes; the commit, and whether it is behind its `origin/master`, go in the Sources line. A checkout can be ahead of or behind what is deployed. When the source is partial (a PR's changed files, an export without git), say so; a file it doesn't contain is unknown, not absent. Before you call a function missing, grep the whole export for its bare name (`grep -rn 'Name('`; a Go method has its receiver before the name, so `func Name` misses it). Read each function the search finds to its end; mark assumed only what it doesn't find. When the export holds several commits and you can't tell which version of a file it holds, name the commits once in the Sources line and cite `server path:line` after that (this replaces the `<commit>` in the citation format).
- **Where to look**, relative to that repo's root:
  - the feature's packages (`lib/chat/<feature>/`, its state layer in `lib/chat/state/<feature>/`; older code in `monolith/state/`): transitions, which fields each write changes, what is kept after removal;
  - the controllers (`lib/chat/controller/v1/`): request checks, responses, error names and codes (`lib/chat/errors/`);
  - where events are emitted (search the feature's packages, `lib/chat/event/`, `monolith/state/events/`): payload and audience;
  - the QA tests (`tests/chat/tests/<feature>.test.ts`): the behaviour the team guarantees;
  - the internal docs (`docs/docs/backend/07-chat/`).
- **Read only.** Don't build, run, edit, commit or switch branches there.

## 2. Translate the vocabulary

Translate every server term before it goes into the document.

| The spec says | In the SDK |
| --- | --- |
| `cid`, `channel_cid`, `type:id` | a `Channel` (`client.channel(type, id)`, `channel.cid`) |
| `parent_id` | a reply in a `Thread` whose id is the parent message id |
| `user_id` of the caller, "own rows", "user-scoped" | visible only to the connected user; that says who sees it, not which node holds it: the narrowest node whose key and lifetime match (`llc-feature-design`, "Parent"; `llc-services`, "The map") |
| "the owner's connections", "notify own users", "user events" | the event reaches every connection of the user, whether or not they watch the channel, so it can arrive for a channel the SDK hasn't loaded |
| "channel event", "sent to watchers / members" | the event reaches only connections watching the channel |
| GetOrCreateChannel, "channel query" | `Channel.query()` / `watch()` / `create()` (`ChannelApi.getOrCreate`; `ChatApi.getOrCreateChannel` / `getOrCreateDistinctChannel` in `src/gen/chat/ChatApi.ts`) |
| QueryChannels | `StreamChat.queryChannels()` / `queryChannelsAndHydrate()`, the channel lists of `client.channelManager` |
| "opt-in field", `omitempty`, "absent means …" | a response field that can be missing; "absent" and "empty" mean different things |
| client-side vs server-side auth | this SDK is client-side only: server-side-only fields, endpoints and rules don't apply |
| task, worker, sweep, "the due-reminder job", cron | a change no client request causes: the SDK learns of it only from an event or a later query |
| row `status`, `attempts`, internal `version`, hidden ids | entity state; check which of these are on the wire (`src/gen/models`) and which are server-only |
| keyset, cursor, `next`, `limit` | `BasePaginator`'s cursor and `pageSize` |
| permission name (`SendPoll`) | an own capability: a kebab-case `ChannelOwnCapability` in `src/gen`, read from `channel.state.ownCapabilities`. A permission with no matching capability is an open question |
| channel type config, channel config overrides | a setting, never a "flag": the channel's server config, `channel.serverConfig` (per `cid`, with overrides), ANDed into the gated object's config (`llc-services`, "`Channel` and `Thread`", Config, and "Message composer") |
| internal feature flag (`chat.<feature>`, an experiment, kill switch or entitlement) | Stream's switch for rolling the feature out to an app. The client never receives it; integrators control the feature through the channel config. Assume it is on. It is never a state, a case, a cause, an error, a "Who can do what" row, the reason for a default or a proposed change, however often the sources mention it ("Where a finding goes" places it) |
| app setting the client reads | `client.getAppSettings()`; use it only when the feature documents a setting there |
| app setting the client can't read (a server-side option such as a webhook that can change a message before it is stored) | "for some apps", defined in plain words at first use; an item built on it must hold for all apps |
| error name, `ExceptionFields.reason`, HTTP status | generic codes are in `APIErrorCodes` (`src/errors.ts`); a feature's own codes or reasons get a named predicate next to `APIErrorCodes` or in the feature's folder (`llc-services`, Reuse table). If the spec names an error without its numeric code, write "code assumed <n>", with <n> the `APIErrorCodes` entry for that error name, and ask for it only when the SDK branches on the code |
| soft cap, limit | a reason to disable or hint in the UI; the server enforces it |
| idempotent create, client-supplied id | a request that can be retried or replayed offline with the same id |
| JSON options v1 / v2, flat vs nested custom data | the shape the server reads custom fields in: v2 nests them under `custom` (the `custom` fields in `src/gen/models` are the evidence, not an assumption), which is what this SDK sends; v1 puts them at the top level. Write "the nested-custom shape this SDK sends", not "v2" |

## 3. The fact checklist

The checklist is your research guide, not the shape of the document. Investigate every item. It covers the server's side; section 4 walks the UI SDKs.

| # | Fact | What to look for |
| --- | --- | --- |
| 0 | Place in the map | For each concept the spec introduces, the node of the ownership map (`llc-services`, "The map") it attaches to, and whether it is a new node or a new field or option on an existing one. A concept that fits nowhere is a decision for the SDK team, not a new branch |
| 1 | Identity | Which field is the id; who creates it (can the client choose it?); can an id be used again after the entity is removed, and by whom |
| 2 | Owner and scope | The keys on each record (`cid`, `parent_id`, `user_id`); which one the entity belongs to; whether it exists without a channel |
| 3 | Operations and permissions | For the entity and each new field: who can create, read, update and delete it (the author, other members, moderators, the integrator's backend, only Stream's server), through which `src/gen` endpoint, and what each response returns. A field no client can write is read-only. Check what the server does on each path a client can send it: the top level; the same name inside `custom`, in the nested-custom shape this SDK sends; and an edit that copies the stored value back. It may ignore it, reject it, overwrite it, or read an app's stored value back as the new field. A test settles the `custom` path only when it sends that shape. A path no test settles takes the outcome the internal docs state, which counts as intended; failing those, the validation code's outcome, marked assumed and asked. Any outcome other than "ignored", where the spec says "ignored", is a disagreement and a blocking question, because apps that already store that key lose it. When the internal docs or QA tests state the rejection as intended, ask only whether apps may already store the key; that question stays blocking, whoever put the key there |
| 4 | Listing | Filter fields, allowed sorts, the **server's actual order** (groups, tie-breakers), max page size, cursor, what is never returned; what the UI needs that the server can't filter by |
| 5 | Embedding | Other responses that carry the entity (channel query, QueryChannels, events, message payloads), the request flag, and what an absent field or a partial set means |
| 6 | Lifecycle | All statuses; each transition and what triggers it (user request, worker, other entity); which transitions emit which event; which statuses are final; which can come back. For work no client request does directly (a worker), find every call that starts it (create, edit, unblock, a retry), read the condition each one checks, and say whether it starts the work for content created before the feature was turned on and for content whose retries ran out (an edit of such content is the usual case); compare with what the spec says starts it. A guard against repeats doesn't stop content that never started the work. An extra trigger is a disagreement and a question, blocking only under section 5's rules; check each "Already works" line against it: a line that no longer holds becomes an item or names the question that covers it |
| 7 | Ordering of copies | Which wire field tells the newer copy of an entity (a timestamp, a version); whose clock, for each write path; which transitions change it and which don't. Then list every source of a copy on the client (the send response, the edit response, the user's own and others' events, a query or reload, the offline DB, `client.sync()`) and the merge point each goes through: `MessageOperationStatePolicy` compares `updated_at`; `EntityStore.upsert()`, `MessagePaginator.ingestItem()`, reaction events (`reflectReactionEvent` → `client.messageStore.upsert()`) and a query page, which replaces the messages it holds, replace without comparing; also any listener that re-initialises local state from the entity's events (search the code for each event type the feature sends). Each source gets a verdict: an A line, an item, a decision or a question |
| 8 | Events | Each event type, its payload (the full entity? the status after the change?), its audience (watchers or the owner's connections), and whether it's sent for unloaded channels |
| 9 | Conflicts and retries | Concurrent edits (409s, "first writer wins"), idempotent retries, what a retry of a finished operation returns |
| 10 | Gating | How integrators turn the feature on and off: the channel config field, the own capability, limits. Compare with how existing features are gated (section 4); what each operation does when the feature is off (its errors go to row 24) |
| 11 | Effects of other entities | What happens when the channel is deleted, truncated or frozen, the user is removed, banned or muted, the parent message is deleted |
| 12 | Visibility to others | Whether other users see anything before or after; effects on unread counts, channel order, the message list |
| 13 | Composition | Which message fields and kinds are allowed or rejected (commands, polls, locations, attachments, thread replies, quoted messages) and when the server checks |
| 14 | Offline and catching up | Whether the server's sync endpoint (`client.sync()`) returns the feature's events; whether a query returns the current state after a reconnect; whether a request sent late (from the offline queue) is safe: idempotent by a client-chosen id, still valid after time passed, and what the server does when the target changed meanwhile. Then walk the feature offline (section 4) |
| 15 | Time | Whose clock decides, rounding of times, minimum and maximum durations, what a time in the past does, and what that means for a request replayed late |
| 16 | Look-alike shapes | Responses or events whose shape matches an existing SDK entity (a `MessageResponse` in a create response, a message-like payload) but whose meaning differs. Existing services would take them as that entity: the message list, `messageOperations`, the offline `send-message` replay |
| 17 | Granularity | What one record is attached to (a message, an attachment, a user, a channel), checked against the real content: can the target hold several of the things the feature is about? |
| 18 | Extensibility | Whether the types, kinds or enums the spec introduces are closed or open; whether integrators or the SDK can add values, and how the server treats an unknown one |
| 19 | Bounds | Every list or aggregate in a response or event: is it capped, truncated or paginated, and what does "all" mean in a channel of 10,000 members? A field said to hold "all users" in a payload sent to every member is capped or a cost problem: ask which |
| 20 | Proposed SDK surface | Method names, fields added to existing SDK entities (on the message, the channel), the client-side update rule the spec suggests, and where the UI is expected to call it. Map them onto the SDK's conventions (the parent that holds the action, `Class.method()` names, which entity's fields change, the store that holds it) and say where they don't fit: a decision when the SDK owns the surface, a question when the spec's team does (an SDK API spec) |
| 21 | Trying it | Where the SDK team can try it: environment, app, feature flag, grant, test keys. A spec without one can't be built against: ask in the test-app question (section 5) |
| 22 | Features that already process this data | Every existing feature, in the server or the SDKs, that works on the kind of content the feature creates or changes: auto-translation (`message.i18n`, `ChatApi.translateMessage`), moderation, message search, push and message previews, webhooks, exports, the offline sync. For each: does it now cover the new data, and if not, is that intended or planned? An out-of-scope entry settles it only when it says what that feature does with the new content; an entry about how two features share work (cost, storage) leaves the user-visible question open. A settling entry gives a "not now" decision when the UI shows that feature next to the new data. Otherwise one question per feature whose answer changes what the SDK shows, and a docs-issue line for one that only needs documenting. Ask each one separately, with the case a user sees ("a French user opens an English poll in a channel translated to `fr`") |
| 23 | Behaviour in other chat apps | For each detail recorded under "Other chat apps": does the spec do the same, and does it say why it differs? Walk the case in the model app (section 4, "Compare with the app the user knows") |
| 24 | Errors | Every error an operation can return (HTTP status, numeric code, reason) and every error or failed status the server stores in the data, including request validation errors; failures that leave no trace; for each: final or retryable, and who receives it. Then follow each through the SDK (section 4) |

A fact counts as answered only when the spec, `src/gen` or the server repo states it; cite it on the evidence line (the **Evidence** rule in "Write in the SDK's language"). If you inferred it from how the server probably works, it is a question with your inference as the assumed answer, unless no answer would change what the SDK does or shows (section 5).

Server code shows what the server does today, not what it promises. A fact that only the code states, and that a wrong guess would turn into lost, duplicated or wrongly shown data, stays a question, phrased as a confirmation: "`<file>` does X; can the SDK rely on it?". A fact in the QA tests or the internal docs, or one the design doc and the code both state, counts as intended behaviour. When your inputs lack that code, a fact only the design doc states is asked on the same terms: "the design doc says X; can the SDK rely on it?"

When sources state a fact differently, don't pick one silently.

- **`src/gen` behind the server** (a field or endpoint the server has and `src/gen` lacks, or an older doc comment): our regeneration is due. `src/gen` is the SDK team's: never ask the backend team about it. Take the fact from the server's API definitions, and add the regeneration to the decisions for the SDK team as a prerequisite. Not a question, not a disagreement.
- **The spec, the server's API definitions and the server's code disagree:** work from the newest source (compare the server commit and the spec's date), list the difference under "Where the sources disagree", and ask the other team which is right when the answer changes what the SDK does or shows; otherwise it is only a docs-issue line (section 5).
- **A design doc or ticket older than the code** (not the spec you were given; for the spec, the rule above applies) describes an earlier plan. Where it differs from what shipped (a renamed field, a dropped option, a race the code later closed), work from the code, subject to the confirmation rule above ("Server code shows what the server does today"). List the difference under "Where the sources disagree" only when it affects the SDK or would mislead someone who reads the design doc (a renamed field), and ask a question only when the code doesn't settle it or that rule applies.
- **A public doc's example disagrees with how this SDK sends the data** (an older payload shape): check every field of each JSON example against `src/gen/models`, or the server's API definitions when `src/gen` is behind (top level or under `custom`), not only the new field, and list a mismatch under "Where the sources disagree" as a docs issue, not as a server question.

## 4. Question the spec like the developer who builds the UI

The checklist finds missing facts. These checks find wrong ones: a spec can be complete and still not fit the product.

- **Walk a real case end to end.** Take one realistic piece of content and one user flow through every step of the spec, and check that each step has what it needs. Pick the case that stresses the feature: content with several of the things the feature is about, the largest allowed channel, a thread reply. A fact the spec states clearly can still be wrong for the product: when the real case doesn't fit it, that is a question, not a settled fact. Example: for delivery receipts, a thread-only reply. The spec keeps one receipt per member and channel, so the reply can't be marked delivered on its own. Before proposing a change, check whether the spec's types let the SDK work around it (a thread reply's id in `DeliveredMessagePayload`), and say which one you'd prefer.
- **Walk the non-happy paths.** After the main case, walk each of these against the spec and the server code, and write down what the user sees:
  - the operation fails, times out or is rejected, and whether the failure is final or retried (each error then goes through "Follow every error through the SDK" below);
  - the user is offline when it happens, or acts while offline and syncs later (walk it through "Walk the feature offline" below);
  - the feature is off in the channel config (or the own capability is missing), or is turned off while the server has work pending on some content (the server then refuses new requests and may drop that work: section 4, "Compare the gating with existing features"), or the content was created before it was turned on and is then edited;
  - the user lacks the permission, or loses it halfway (removed from the channel, banned);
  - a concurrent action by the same user (edit, delete, resend) or by someone else (a moderator deletes the message, the channel is truncated);
  - the thing it works on changes or disappears halfway (the attachment is replaced, the message is deleted);
  - the result is wrong (a wrong count, a stale preview), and the user wants to correct, undo or hide it;
  - the app restarts or the user switches devices halfway.
- **Walk the feature offline.** Answer each of the five questions below for both setups.
  - **Without an offline DB** (stream-chat-react, and React Native without offline support): state lives only in memory, so a restart loses it; a request made while offline fails (Errors table); after a reconnect, `ConnectionRecoveryManager` refreshes what `llc-services` ("Connection recovery") lists.
  - **With an offline DB** (React Native's offline support, injected with `client.setOfflineDBApi()`; `AbstractOfflineDB` in `src/offline-support/offline_support_api.ts`, implemented in stream-chat-react-native `package/src/store/`; how the LLC syncs it is in `llc-services`, "Offline support"):
    - **Kept for a cold start** (does the new data survive an app restart, and where?): which table and column would hold the data (`package/src/store/schema.ts` and the mappers in `store/mappers/`). A new top-level field on a message, channel, reaction or user lands in that row's `extraData` JSON column and survives without a change, unless the mapper drops it (a message drops `latest_reactions`, `own_reactions`, `poll` and `reminder`); a new field inside a value the mapper stores as a JSON column survives too (check which values it stores that way). A new field on a member, read, poll, draft or reminder needs a column and a mapper change. A new entity needs its own table, or it isn't kept.
    - **Shown before the network answers** (what does the user see when the app opens offline, and can it be stale?): `ChannelPaginator.preloadFirstPageFromOfflineDb` shows the stored channel lists, and the channels it hydrates (`offlineMode: true`) bring their stored messages, members and reads; message paginators don't read the DB themselves. Reactions (`queryReactions` → `getReactions`) and drafts (`getDraft`) read it on their own. Check whether a stored state can be wrong by then (a "pending" that finished while the app was closed), and what the user sees until the network answers.
    - **Kept current by events** (does the offline DB write the feature's events?): `AbstractOfflineDB.handleEvent` routes each event type to a handler. An event type it doesn't route leaves the DB stale. A routed handler can still skip the event: compare its guards (the fields it checks before writing) with those of the handler that first stored the data. A stored event carries the new data only if the handler stores the whole entity.
    - **Missed while offline** (how does the SDK catch up on what happened while it was offline?): without an offline DB, only through what the reconnect refreshes, so name what that leaves stale. With one: does the server's sync include the feature's events? Unless the spec, the QA tests or the internal docs state it, that is a question (section 3). If it doesn't, the DB catches up only when a query rewrites the data.
    - **The user acts while offline** (queued, refused or failed; what the user sees while it waits; whether the replay is safe): an action is queued only if it goes through `queueOrRun()`, has an entry in `QUEUEABLE_OPERATIONS` (`queueableOperations.ts`), is replayable (a channel type and id when the operation needs a channel, a message id for a send; an edit whose attachments are still on local URLs is dropped), and fails with an ephemeral error (`isEphemeral()`); one that fails otherwise is dropped, and its error goes to the caller. Anything else runs once and fails (Errors table). For a queued action, check: what the user sees while it waits (for messages, see `llc-services`, Reuse table, "Tell the user something failed": a queued edit or delete stays pending, a queued send or retry is marked failed; other operations show only their optimistic state); whether the replay is safe (the same id, a time that may have passed, a target another user changed or deleted meanwhile); and what happens when the server rejects the replay. Only `send-message` has an `onReplayRejected`, so for any other operation the optimistic state stays unless the item adds one.
- **Follow every error through the SDK.** List every error the feature can produce: those in the spec, the error names, codes and reasons in the server code (`lib/chat/errors/`, the controllers' checks), the values the server stores in an error or status field, and the failures that leave no trace (retries run out, the data is stored but its event is lost). For each one, reason step by step:
  - **How it reaches the client.** An error response to a request, a value in the data, an event, or nothing. A failure that reaches nobody is a question: the UI can't tell "still coming" from "never coming".
  - **Which LLC path it takes today, and where that ends.** Follow the code from the paths `llc-services` lists (Reuse table: "Tell a final error from a transient one", "Tell the user something failed"; "Offline support"); don't guess. In the UI, stream-chat-react shows a failed message with a retry action unless `error.status` is 403 (`isMessageErrorRetryable`); check stream-chat-react-native separately.
  - **Whether that ending is right for this error.** Typical mismatches: a final error the LLC retries or replays; a transient error it drops; a feature-specific error that reuses a generic code (`InputError`, code 4) and can be told apart only by its reason, which needs a named predicate; an error only the integrator's code sees, which the user should see; an error the user who acted should see, which reaches every member, or the other way round; a stored error value the UI doesn't know (decide how an unknown value is shown).
  - **What the user sees, and whether they can recover:** retry, change the input, or nothing. Check that the UI SDKs have a message for it (their translation strings), or that one is needed.
- **Follow the new data to the screen.** For each new field, follow it in each UI SDK from the list that renders the message down to the component that draws it, through every component in between. Where a component routes content by kind to different child components, follow the one the new data's kind goes to (stream-chat-react's `renderMessages` sends a system message to `MessageSystem`, not `Message`). Open every memo comparator on the way (`React.memo` with an `areEqual`, `useMemo` and `useCallback` dependencies, custom equality helpers) and check that a change in the new field reaches the component. Don't stop at the first one that blocks it: every comparator that compares other fields only goes into the same U item. The re-render line ("Already works" or a U item's Why) names, in each UI SDK, the drawing component and every comparator on the way, in order from the list, each with what it compares; it may pass two sentences. A file the checkout lacks makes the line assumed.

  Then check what else the same update changes. An event that brings the new field carries the whole entity, and its other fields may differ from the copy on screen (a new `updated_at`, re-ordered `latest_reactions`). A component keyed by such a field, or state looked up by it, remounts or resets: a U item, or a question when only the server can keep the field stable. Name the fields each key or lookup id on the path is built from (stream-chat-react's `MessageReactionsDetail` keys a row by `${user?.id}-${type}`), and check in the server code, for each arrival the main scenario shows (the feature's own event, the user's own action's response and its event), whether it changes them; each action takes its own server path. An "Already works" or re-render line may say the component keeps its state only when the line names each field its key is built from, cites the server code that keeps each one the same, and says "relies on Qn" when only that code states it (section 3).
- **Walk every place the UI shows the item in short.** Besides the message list: the channel-list preview, the quoted-message preview, the thread list, the pinned list, search results, the notification text, copy-to-clipboard. For each, what it shows for the new content today; the right display is a decision when it is a product choice. A place the content can't reach goes in the closing line.
- **Account for every out-of-scope entry.** Go through each entry of the spec's and the design doc's out-of-scope lists once. Each lands in exactly one of these places (a question's Case may also cite an entry that landed elsewhere): cited where it settles an item or a question (so nothing is asked about it), a "not now" decision when the SDK would otherwise build for it, a question when the SDK needs it anyway, or the closing "Checked, nothing for the SDK" line. An entry that excludes content (older content, imports) goes in the closing line only after you check which state the UI draws for that content; when it is a state the SDK can't tell apart, the entry is a case of that state's question.
- **Compare the gating with existing features.** Integrators switch features in the channel config; which fields it has, how the LLC reads it and when it refreshes is in `llc-services` ("`Channel` and `Thread`", Config, and "Message composer"). No event refreshes an open channel's gates (`llc-services`, Config): it keeps what its last query returned. So the config change itself gets no scenario step, no "When it goes wrong" line and no States row. What follows on the server is an Errors row: after a setting is turned off, the server refuses new requests while the UI still offers the feature until the next query, and it may drop work it had pending (a failure that leaves no trace). Ask only where the feature departs from this pattern.
- **Ask the reason for every restriction.** "Not for thread replies", "channels up to 100 members", "one customer only": a product decision, a cost limit, or an implementation gap? The answer decides whether the SDK hard-codes the rule, reads it from config, or leaves it to the server.
- **Check the trigger in the UI.** Who calls it, and at which moment (the first time the message is visible, the first tap on it)? Check that each UI SDK (React, React Native) can tell that moment apart and can avoid sending the request twice. A UI SDK that can't is a U item.
- **Compare with the app the user knows.** Walk your case in the reference app too ("the author reads her own message on her second phone in a WhatsApp group: is it read?").
- **Leave room for the announced future work.** Split each extension the design doc or the ticket announces into the changes it states (a change you infer is "assumed"), and check each change on its own: would an item hard-code something it changes (a yes/no setting that will become a count, as a poll's one vote per user versus up to `max_votes_allowed`; a field that will gain a state; a final value that will become retryable; a list returned whole that will become paginated; a new endpoint that will create the same data)? Would an "Already works" line stop holding (one that relies on content being new, for an extension that acts on older content)? Where an "Already works" line would stop holding, it says "relies on Dn" (a "not now" decision for the extension) or becomes an item. Where an item would hard-code a change, state the change once, in the Why of the item that must leave room for it, and have other items refer to that item's id; the item leaves room for it (the UI reads the value through one LLC function instead of comparing it with `true`). Compare each change with the other chat apps (an extension is often the model they already use: who triggers it, who sees the result); a difference that changes what an item must leave room for, or what the UI shows until the extension ships, goes where "Where a finding goes" puts another app's behaviour. A change no item could hard-code goes in the closing line with that reason.

## 5. Write the open questions

One question per decision the SDK needs, not per cause. When several causes lead to the same thing the SDK can't tell apart (a reminder that never comes due because the channel was deleted, the user lost access, or the job failed), they are the cases of one question. Each question:

- **is asked in one sentence**, on its title line, and asks one thing, with no proposed server change in it;
- **starts from what the SDK already has.** When the SDK already receives a related signal, the Case line names it first, with the concrete case where it gives the wrong answer; the question asks for the gap. A question that ignores a signal the SDK has gets answered by pointing to that signal, and the real gap goes unasked;
- **names a concrete case** a user of a UI SDK would hit, on its own "Case:" line of at most three sentences, not a category. "If the user deletes the reminder on message X and then sets a new one, does the create return a new reminder or the deleted one with its old time?" Not "What about id reuse?";
- is answerable by the other team in their own terms, and cites the server code it is based on, if any, in one line;
- says, in one sentence per possible answer, **what the SDK does with the answer**: the items it settles (L2, U1), the work another answer than the assumed one would add, or the LLC state that depends on it when no item exists yet, and what the user would see if the assumed answer is wrong ("If a delete clears `message.reminder`, L2 isn't needed. If it doesn't and L2 isn't built, a deleted reminder returns when its channel is opened."). Each sentence starts with the answer it covers;
- says what the user sees if nobody answers, under the answer the SDK assumes, with its items built ("a reminder the user deleted stays gone when its channel is opened again"). This line describes only the screen: no id, no server or spec fact, never "no change";
- may propose a server change, with the option the SDK prefers, on its "Proposed change" line;
- is marked **blocking** when the answer is needed before release, which is when either holds:
  - a wrong assumed answer would lose or duplicate user data, or show the user something that shouldn't happen (a wrong count, a lost message, content that moderation should hide);
  - the assumed answer drops part of what the spec or the design doc tells apps to do or expects them to show, stated or implied (the spec tells UIs to show when a reminder is due, and the assumed answer shows no time). The "If nobody answers, the user sees" line then says what is dropped.

  Judge by what a wrong answer costs, not by how likely it is or whether an item changes; a glitch the user undoes with one tap is not blocking. The test-app question is never blocking and has no "If nobody answers" line. Everything else is **non-blocking**.

When the SDK's safe answer is the same whatever the server says (sort the reminders list locally whether or not the server sorts it), it is an item, not a question, even when the fact behind it is assumed (the item says "assumed"); ask only if some answer would remove the item. When a question has parts whose answers change different items, split it. A request that only asks the other team to document something and changes nothing for the SDK is a docs-issue line under "Where the sources disagree", not a question.

Don't ask what `src/gen` or the server's API definitions already answer; cite them instead. Merge questions only when one answer settles all of them. List the blocking ones first; within each group, order them by area (lifecycle, events, listing, gating, …) so the other team can answer them in one pass. Number them in the order they appear; a question may refer to a later one by its id.

How the SDK builds what the user sees under the assumed answer is a decision for the SDK team.

## 6. Output template

```markdown
# <Feature>

Sources: <spec; design doc; ticket; linked docs; src/gen; server repo; UI SDK checkouts; other chat apps; Stream's setup; each external source linked or marked "(no URL)"; what built URLs were built from, unopened>

## In short
<who asked and why; what changes for the user; where the data lands; how much work; blocking questions>

## What the user sees
<the main scenario, as steps in the UI, with each risk and its id>

### Who can do what
<per entity or field a client can write:>
| Actor | Create | Read | Update | Delete | <special action> |

<per setting a client can set:>
| Actor | Set | Read |

<per setting no client can set:>
<setting>: set by <who>, through <endpoint>; a client user: <no | assumed no (Qn)>; the client reads it from <where>

- <field> is **read-only**: <where it arrives>; <each path: what the server does> (<id>); <what a read returns for a value an app stored under that name> (<id>); <who can correct or hide a wrong value, or Qn>

### When it goes wrong
- <trigger>: <what the user sees> (<id>)

### States
| State | What the SDK receives | What the UI shows | Can the SDK tell it apart? | Covered by |

## Errors
| Id | Error and its cause | How the SDK learns of it | Final or retryable | Who learns of it | What the SDK does today, and why | What the user should see | Covered by (or "none needed") |

## Offline
| Question | stream-chat-react (no offline DB) | stream-chat-react-native (offline DB) |
| Kept for a cold start | <what happens> (<id>) | <what happens> (<id>) |
| Shown before the network answers | … | … |
| Kept current by events | … | … |
| Missed while offline | … | … |
| The user acts while offline | … | … |

## What the SDK must do
### In the LLC
- **L1. <the change>**
  - Why: <the reasoning>
  - Where: <file / method>
  - Depends on: <Qn / Dn / Ln / Un, or "none">
  - Evidence: <sources>

### In the UI SDKs
- **U1. <the change>**
  - Why: …
  - Where: <stream-chat-react | stream-chat-react-native | both: component / hook>
  - Depends on: …
  - Evidence: …

### Already works, don't rebuild
- **A1.** <what works>: <the existing service that covers it, and why>[; relies on Qn]

## Questions for the <team>
- **[blocking | non-blocking] Q1. <the question>**
  - Case: <…>
  - What the SDK does with the answer: <…>
  - If nobody answers, the user sees: <…>
  - Proposed change (if any): <…>
  - Evidence: <…>
  - Answer: <only once the team answers; written by `llc-feature-design`, never by the intake>

## Where the sources disagree
- <topic>: asked in Qn
- <source A says …> vs <source B says …>; "settled by the code: <path>". Evidence: <paths>
- Docs issue: <what to document or fix, in which doc>. Evidence: <paths>

## Decisions for the SDK team
- **D1. Prerequisite: <task>**
  - Needed before: <Ln / Un>
- **D2. <options>**
  - Affects: <ids, or "the behaviour in the title" for a fix-or-file decision>[. <how another app does it, marked documented or observed>]
  - Proposed default: <what the user sees, or the option for a fix-or-file decision>
- **D3. Not now: <out-of-scope work or announced extension>**
  - Settled by: <the out-of-scope entry or the announcement>
  - Affects: <Un>[. <how another app does it, marked documented or observed>]
  - What the user sees meanwhile: <what the user sees only>

Checked, nothing for the SDK: <checklist item: reason>; <out-of-scope entry: reason>; …
```

## 7. Check before you hand over

Run each search on the intake parts only (everything above `## Design`, when the file has one) and fix what it finds:

- **Ids.** For each id (`grep -oE '\b[LUAEQD][0-9]+\b'`): it is defined once. Outside its own line and the questions, it appears only after a verdict, a scenario risk, a step's new UI, a "When it goes wrong" line, a States cell, the read-only bullet, a "not needed (<id>)" mark, the In short's list of blocking questions, or in a Depends on, Affects, Needed before, Covered by, "relies on" or "asked in" field, with no reason or mechanism next to it.
- **Pointers.** Grep `(^|[(;,.:—] *)[Ss]ee |row [0-9]|above|below`: no pointer names a part or a row.
- **Flag.** Grep `\bchat\.` and `flag`, and read every Case, state, cause and proposed change for whether Stream has turned the feature on for an app, in any wording: each is in the Sources line or the test-app question.
- **Scenario.** Grep the scenario for `stay`, `nothing happens` and `no .* appears`, and rewrite each as a "must". Each event or response type is told at one step per arrival. No risk sits after the step where its threat arrived. At each arrival, the response and event of the user's own action included, check each field that a key or lookup id on the path is built from (named in the re-render line; section 4, "Follow the new data to the screen") against that arrival's server path: a field it changes is a risk at that step, whether an A line or a U item covers it.
- **When it goes wrong.** Each line ends with the id that covers it, in parentheses.
- **Errors.** Grep `gave up` and cut the server's reasons after it. No Errors cell is `—`, empty or a bare "depends on Qn". Each "today" cell on a path an item changes or an A line walks has only the ending as it is before any item is built, and the id ("nothing shows (U1)").
- **Offline.** Every cell ends with an id or `n/a:`.
- **Items and questions.** Each `**L` and `**U` has `Why:`, `Where:`, `Depends on:` and `Evidence:`, and one about existing behaviour that normal use of the feature hits (part 5), such as a comparator, handler, key or listener that drops or resets the new data, starts its Why with "Existing:"; each `**Q` has `Case:` and, except the test-app question, `If nobody answers`. No "If nobody answers" line contains an id.
- **Listeners.** Grep `src/` and each UI SDK checkout for each event type the feature sends, quoted (`'reminder.updated'`), and for its prefix (`startsWith('reminder`): every listener of it, including one that resets or reloads state, has a verdict: an item, an "Already works" line, or a run-notes line saying why it doesn't touch the feature's data.
- **Names.** Grep every backticked method, component and file the document names, in the checkout you read (for LLC code, `origin/master`).
- **"Already works".** Re-open the code each line names. Each line about UI names code in each UI SDK whose checkout you read, or is marked assumed. Each re-render line names, in each UI SDK, the drawing component and every comparator on the way, each with what it compares. Each line on a path from row 7's replace-without-comparing list names what covers an older copy. Each line that says a component keeps its state names its key's fields and the server code that keeps them, for every arrival in the main scenario that brings the entity (section 4, "Follow the new data to the screen").
- **Server terms.** Grep for server function and column names outside evidence lines. Each backend name of a state, job or setting left in is defined in plain words at first use.
- **Other apps.** Grep each app name: outside the questions it is stated once, and every mention carries `documented` or `observed` as a link.
- **Links.** Run `grep -nE 'PR #?[0-9]+|[A-Z]{2,}-[0-9]+|https?://|notion\.|linear\.|github\.com|server `?[0-9a-f]{7,}' <file>`: each hit is inside `[text](url)` or names a source the Sources line marks "(no URL)", and no URL stands bare. Then grep each source's plain names (`grep -niE 'design doc|RFC|ticket|spec\b'`, plus the doc's and the ticket's titles) and each UI SDK or server file named in a Where or Evidence line: each mention is a link, or its source is marked "(no URL)" in the Sources line; "(no URL)" appears nowhere else except on an `Answer:` line (the **Links** rule).
- **Disagreements.** Each line naming a Qn reads only "<topic>: asked in Qn"; every other line has both statements, evidence and what settles it, or is a docs issue.
- **Decisions.** Each `**D` has `Needed before:`, or `Affects:` with `Proposed default:` or `What the user sees meanwhile:`.
- **Out of scope.** Grep each out-of-scope entry from your run notes: it is in exactly one place (section 4, "Account for every out-of-scope entry"); one cited elsewhere is not in the closing line.
- **Run notes.** These hold the word count, the server repo's branch, every out-of-scope entry with where it landed, every caller of background work, with whether it starts the work for content created before the feature and for content whose retries ran out (row 6), every change an announced extension brings with the item or closing-line reason that covers it, and every file or function you call missing, with the grep you ran.

**Review by a fresh agent.** The searches above miss what the writer believes is right, so after them a new agent reviews the file. Give it the file and the sources you gathered in section 1, but not your run notes or reasoning. Ask it to report, without editing the file, three kinds of problem: parts that contradict each other, statements the sources or the code don't support, and sources mentioned without a link. Fix each finding that the sources confirm. For a finding you don't fix, add a run-notes line saying why the statement stands. When you can't start an agent, say so in the run notes.

If your brief asks only for the intake, stop here. Otherwise run `llc-feature-design` on this file.
