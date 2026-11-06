# Decisions — Offline migration

## D-OFF-1 — Enhancement tranche (offline older-page pagination)

**Status:** OPEN

**Question:** Do we add the cursor-aware `AbstractOfflineDB.getChannelMessages` read +
`MessagePaginator.preloadFirstPageFromOfflineDb` (Task O7), enabling paginating older messages while
offline — or ship parity only (O1–O6)?

**Trade-off:** O7 adds a new **abstract** method to the injection interface, which **breaks every
concrete offline DB implementation (RN/mobile) until they implement it** and must be released in
coordination with those SDKs. Parity (O1–O6) adds **no** abstract method and is safe for existing
implementers; it preserves today's behavior (offline shows the last-known latest page via channel
hydration; older-page loads need the network).

**Recommendation:** **Ship parity (O1–O6) first**; schedule O7 as a follow-up with the RN/mobile
teams. Rationale: parity unblocks the parent plan's storage deletion without a cross-SDK breaking
change, and legacy offline didn't support older-page pagination either — so O7 is a net-new feature,
not a regression to avoid.

## D-OFF-2 — `hydrateActiveChannels` paginator seed source (verify)

**Status:** OPEN (verification)

**Question:** Does the `hydrateActiveChannels` offline seed read the raw `ChannelAPIResponse.messages`
(the loop variable) or the just-populated `c.state.messages`? Mapping flagged this ambiguously.

**Action:** Confirm by reading `client.ts:2324-2333` before Task O4/parent Task 10. If it reads
`c.state.messages`, O4 must repoint it to the response so removing legacy `_initializeState` message
population doesn't empty the offline seed.

## D-OFF-3 — Persist paginated page loads (`upsertMessages`) now or later

**Status:** OPEN

**Question:** Include the `populateOfflineDbAfterQuery` → `upsertMessages` page-persist in O1, or defer?

**Recommendation:** **Include in O1.** It closes a real gap (older pages fetched online are currently
not persisted for offline) using an existing abstract method (`upsertMessages`) — no interface break —
and makes O7 (offline read of those pages) actually useful later.
