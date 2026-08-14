import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { parseArgs, type ParseArgsOptionsConfig } from 'node:util';

const options = {
  input: {
    type: 'string',
    short: 'i',
  },
} satisfies ParseArgsOptionsConfig;

/**
 * Maps generated interface names in `src/gen/models` to the corresponding
 * module-augmentation interface in `src/custom_types.ts`. Entries here cause
 * `custom: Record<string, any>` fields inside the interface body to be
 * rewritten to the mapped type. Interfaces missing from this map are left
 * untouched and reported to stderr.
 *
 * Additionally, every `channel_custom?: Record<string, any>` field is
 * unconditionally rewritten to `CustomChannelData` regardless of the
 * enclosing interface.
 */
const CUSTOM_DATA_MAPPING: Record<string, string> = {
  // CustomAttachmentData
  Attachment: 'CustomAttachmentData',
  GetOGResponse: 'CustomAttachmentData',

  // CustomChannelData
  ChannelInput: 'CustomChannelData',
  ChannelInputRequest: 'CustomChannelData',
  ChannelMetadata: 'CustomChannelData',
  ChannelResponse: 'CustomChannelData',

  // CustomMemberData
  ChannelMemberPartialResponse: 'CustomMemberData',
  ChannelMemberRequest: 'CustomMemberData',
  ChannelMemberResponse: 'CustomMemberData',

  // CustomMessageData
  ChatDraftPayloadResponse: 'CustomMessageData',
  ChatMessageResponse: 'CustomMessageData',
  DraftPayloadResponse: 'CustomMessageData',
  MessageRequest: 'CustomMessageData',
  MessageResponse: 'CustomMessageData',
  MessageWithChannelResponse: 'CustomMessageData',
  SearchResultMessage: 'CustomMessageData',

  // CustomReactionData
  ChatReactionResponse: 'CustomReactionData',
  ReactionRequest: 'CustomReactionData',
  ReactionResponse: 'CustomReactionData',

  // CustomThreadData
  ThreadParticipant: 'CustomThreadData',
  ThreadResponse: 'CustomThreadData',
  ThreadStateResponse: 'CustomThreadData',

  // CustomUserData
  ConnectUserDetailsRequest: 'CustomUserData',
  EntityCreatorResponse: 'CustomUserData',
  FullUserResponse: 'CustomUserData',
  OwnUserResponse: 'CustomUserData',
  UserRequest: 'CustomUserData',
  UserResponse: 'CustomUserData',
  UserResponseCommonFields: 'CustomUserData',
  UserResponsePrivacyFields: 'CustomUserData',

  // CustomPollData
  CreatePollRequest: 'CustomPollData',
  PollResponseData: 'CustomPollData',
  UpdatePollRequest: 'CustomPollData',

  // CustomPollOptionData
  CreatePollOptionRequest: 'CustomPollOptionData',
  PollOptionInput: 'CustomPollOptionData',
  PollOptionRequest: 'CustomPollOptionData',
  PollOptionResponseData: 'CustomPollOptionData',
  UpdatePollOptionRequest: 'CustomPollOptionData',

  // CustomEventData — every *Event interface + explicit event carriers
  AIIndicatorClearEvent: 'CustomEventData',
  AIIndicatorStopEvent: 'CustomEventData',
  AIIndicatorUpdateEvent: 'CustomEventData',
  AppUpdatedEvent: 'CustomEventData',
  ChannelCreatedEvent: 'CustomEventData',
  ChannelDeletedEvent: 'CustomEventData',
  ChannelFrozenEvent: 'CustomEventData',
  ChannelHiddenEvent: 'CustomEventData',
  ChannelKickedEvent: 'CustomEventData',
  ChannelTruncatedEvent: 'CustomEventData',
  ChannelUnFrozenEvent: 'CustomEventData',
  ChannelUpdatedEvent: 'CustomEventData',
  ChannelVisibleEvent: 'CustomEventData',
  CustomEvent: 'CustomEventData',
  DraftDeletedEvent: 'CustomEventData',
  DraftUpdatedEvent: 'CustomEventData',
  EventRequest: 'CustomEventData',
  HealthCheckEvent: 'CustomEventData',
  MaxStreakChangedEvent: 'CustomEventData',
  MemberAddedEvent: 'CustomEventData',
  MemberRemovedEvent: 'CustomEventData',
  MemberUpdatedEvent: 'CustomEventData',
  MessageDeletedEvent: 'CustomEventData',
  MessageDeliveredEvent: 'CustomEventData',
  MessageNewEvent: 'CustomEventData',
  MessageReadEvent: 'CustomEventData',
  MessageUndeletedEvent: 'CustomEventData',
  MessageUpdatedEvent: 'CustomEventData',
  ModerationCustomActionEvent: 'CustomEventData',
  ModerationFlaggedEvent: 'CustomEventData',
  ModerationMarkReviewedEvent: 'CustomEventData',
  NotificationAddedToChannelEvent: 'CustomEventData',
  NotificationChannelDeletedEvent: 'CustomEventData',
  NotificationChannelMutesUpdatedEvent: 'CustomEventData',
  NotificationChannelTruncatedEvent: 'CustomEventData',
  NotificationInviteAcceptedEvent: 'CustomEventData',
  NotificationInviteRejectedEvent: 'CustomEventData',
  NotificationInvitedEvent: 'CustomEventData',
  NotificationMarkReadEvent: 'CustomEventData',
  NotificationMarkUnreadEvent: 'CustomEventData',
  NotificationMutesUpdatedEvent: 'CustomEventData',
  NotificationNewMessageEvent: 'CustomEventData',
  NotificationRemovedFromChannelEvent: 'CustomEventData',
  NotificationThreadMessageNewEvent: 'CustomEventData',
  PendingMessageEvent: 'CustomEventData',
  PollClosedEvent: 'CustomEventData',
  PollDeletedEvent: 'CustomEventData',
  PollUpdatedEvent: 'CustomEventData',
  PollVoteCastedEvent: 'CustomEventData',
  PollVoteChangedEvent: 'CustomEventData',
  PollVoteRemovedEvent: 'CustomEventData',
  ReactionDeletedEvent: 'CustomEventData',
  ReactionNewEvent: 'CustomEventData',
  ReactionUpdatedEvent: 'CustomEventData',
  ReminderCreatedEvent: 'CustomEventData',
  ReminderDeletedEvent: 'CustomEventData',
  ReminderNotificationEvent: 'CustomEventData',
  ReminderUpdatedEvent: 'CustomEventData',
  ThreadUpdatedEvent: 'CustomEventData',
  TypingStartEvent: 'CustomEventData',
  TypingStopEvent: 'CustomEventData',
  UserBannedEvent: 'CustomEventData',
  UserDeactivatedEvent: 'CustomEventData',
  UserDeletedEvent: 'CustomEventData',
  UserGroupCreatedEvent: 'CustomEventData',
  UserGroupDeletedEvent: 'CustomEventData',
  UserGroupMemberAddedEvent: 'CustomEventData',
  UserGroupMemberRemovedEvent: 'CustomEventData',
  UserGroupUpdatedEvent: 'CustomEventData',
  UserMessagesDeletedEvent: 'CustomEventData',
  UserMutedEvent: 'CustomEventData',
  UserPresenceChangedEvent: 'CustomEventData',
  UserReactivatedEvent: 'CustomEventData',
  UserUnbannedEvent: 'CustomEventData',
  UserUpdatedEvent: 'CustomEventData',
  UserWatchingStartEvent: 'CustomEventData',
  UserWatchingStopEvent: 'CustomEventData',
};

const CHANNEL_CUSTOM_TYPE = 'CustomChannelData';
const CUSTOM_TYPES_MODULE_PATH = 'src/custom_types.ts';

/**
 * Maps a `Filters<{ ..., custom: { type: Record<string, any>; ... } }>`
 * occurrence to the corresponding `CustomXData` interface. Keyed by
 * `${enclosingInterface}.${filterField}` because a single interface can carry
 * multiple filter blocks (e.g. `SearchPayload.filter_conditions` vs
 * `SearchPayload.message_filter_conditions`).
 */
const FILTER_CUSTOM_MAPPING: Record<string, string> = {
  'QueryChannelsRequest.filter_conditions': 'CustomChannelData',
  'QueryMembersPayload.filter_conditions': 'CustomMemberData',
  'QueryPollsRequest.filter': 'CustomPollData',
  'QueryThreadsRequest.filter': 'CustomThreadData',
  'QueryUsersPayload.filter_conditions': 'CustomUserData',
  'SearchPayload.filter_conditions': 'CustomChannelData',
  'SearchPayload.message_filter_conditions': 'CustomMessageData',
};

const { values } = parseArgs({
  args: process.argv.slice(2),
  options,
  allowPositionals: false,
  tokens: false,
});

const inputPath = values.input;

if (!inputPath) {
  console.error(
    'Usage: node scripts/apply-custom-data-types.mts -i <path-to-file>',
  );
  process.exit(1);
}

const absoluteInputPath = resolve(process.cwd(), inputPath);
const source = readFileSync(absoluteInputPath, 'utf8');

const CUSTOM_FIELD_RE = /^(\s*)custom(\??):\s*Record<string,\s*any>;\s*$/;
const CHANNEL_CUSTOM_FIELD_RE =
  /^(\s*)channel_custom(\??):\s*Record<string,\s*any>;\s*$/;
const INTERFACE_OPEN_RE = /^export interface (\w+)\s*(?:extends [^{]+)?\{\s*$/;
const INTERFACE_CLOSE_RE = /^\}\s*$/;
const FILTER_OPEN_RE = /^\s*(\w+)\??:\s*Filters<\{\s*$/;
const CUSTOM_ENTRY_OPEN_RE = /^\s*custom:\s*\{\s*$/;
const CUSTOM_ENTRY_TYPE_RE = /^(\s*)type:\s*Record<string,\s*any>;\s*$/;

const lines = source.split('\n');
const rewritten: string[] = [];
const usedCustomTypes = new Set<string>();

let currentInterface: string | null = null;
let currentInterfaceHadCustom = false;
let currentInterfaceHadMappedCustom = false;
let rewrittenCustomCount = 0;
let rewrittenChannelCustomCount = 0;
let rewrittenFilterCustomCount = 0;
const skippedInterfaces = new Set<string>();
const skippedFilterKeys = new Set<string>();

// Tracks the currently-open `Filters<{ ... }>` block, if any. `key` is the
// `${enclosingInterface}.${fieldName}` compound used to look up
// FILTER_CUSTOM_MAPPING; `braceDepth` follows `{` / `}` inside the block
// (starts at 1 for the `Filters<{` itself); `inCustomEntry` tracks whether
// we're currently inside the `custom: { ... }` sub-block that carries the
// rewritable `type: Record<string, any>;` line.
let filterContext:
  | { key: string; braceDepth: number; inCustomEntry: boolean }
  | null = null;

const countBraces = (line: string) => {
  let opens = 0;
  let closes = 0;
  for (const ch of line) {
    if (ch === '{') opens += 1;
    else if (ch === '}') closes += 1;
  }
  return { opens, closes };
};

for (const line of lines) {
  const openMatch = line.match(INTERFACE_OPEN_RE);
  if (openMatch) {
    currentInterface = openMatch[1];
    currentInterfaceHadCustom = false;
    currentInterfaceHadMappedCustom = false;
    filterContext = null;
    rewritten.push(line);
    continue;
  }

  if (currentInterface && INTERFACE_CLOSE_RE.test(line)) {
    if (currentInterfaceHadCustom && !currentInterfaceHadMappedCustom) {
      skippedInterfaces.add(currentInterface);
    }
    currentInterface = null;
    currentInterfaceHadCustom = false;
    currentInterfaceHadMappedCustom = false;
    filterContext = null;
    rewritten.push(line);
    continue;
  }

  // Enter a Filters<{ ... }> block (only recognized inside an interface).
  if (currentInterface && !filterContext) {
    const filterOpen = line.match(FILTER_OPEN_RE);
    if (filterOpen) {
      filterContext = {
        key: `${currentInterface}.${filterOpen[1]}`,
        braceDepth: 1,
        inCustomEntry: false,
      };
      rewritten.push(line);
      continue;
    }
  }

  if (filterContext) {
    // Rewrite `type: Record<string, any>;` inside `custom: { ... }`.
    if (filterContext.inCustomEntry) {
      const typeMatch = line.match(CUSTOM_ENTRY_TYPE_RE);
      if (typeMatch) {
        const mappedType = FILTER_CUSTOM_MAPPING[filterContext.key];
        if (mappedType) {
          rewritten.push(`${typeMatch[1]}type: ${mappedType};`);
          usedCustomTypes.add(mappedType);
          rewrittenFilterCustomCount += 1;
        } else {
          skippedFilterKeys.add(filterContext.key);
          rewritten.push(line);
        }
        const { opens, closes } = countBraces(line);
        filterContext.braceDepth += opens - closes;
        if (filterContext.braceDepth <= 0) filterContext = null;
        continue;
      }
    }

    if (!filterContext.inCustomEntry && CUSTOM_ENTRY_OPEN_RE.test(line)) {
      filterContext.inCustomEntry = true;
    }

    const { opens, closes } = countBraces(line);
    filterContext.braceDepth += opens - closes;
    if (filterContext.braceDepth <= 0) {
      filterContext = null;
    } else if (filterContext.inCustomEntry && closes > opens) {
      // Closed out of the `custom: { ... }` sub-block back into the filter body.
      filterContext.inCustomEntry = false;
    }

    rewritten.push(line);
    continue;
  }

  const channelCustomMatch = line.match(CHANNEL_CUSTOM_FIELD_RE);
  if (channelCustomMatch) {
    const [, indent, optional] = channelCustomMatch;
    rewritten.push(`${indent}channel_custom${optional}: ${CHANNEL_CUSTOM_TYPE};`);
    usedCustomTypes.add(CHANNEL_CUSTOM_TYPE);
    rewrittenChannelCustomCount += 1;
    continue;
  }

  const customMatch = line.match(CUSTOM_FIELD_RE);
  if (customMatch && currentInterface) {
    currentInterfaceHadCustom = true;
    const mappedType = CUSTOM_DATA_MAPPING[currentInterface];
    if (mappedType) {
      const [, indent, optional] = customMatch;
      rewritten.push(`${indent}custom${optional}: ${mappedType};`);
      usedCustomTypes.add(mappedType);
      currentInterfaceHadMappedCustom = true;
      rewrittenCustomCount += 1;
      continue;
    }
  }

  rewritten.push(line);
}

if (usedCustomTypes.size > 0) {
  const importSpecifier = computeImportSpecifier(
    absoluteInputPath,
    CUSTOM_TYPES_MODULE_PATH,
  );
  applyImport(rewritten, [...usedCustomTypes].sort(), importSpecifier);
}

writeFileSync(absoluteInputPath, rewritten.join('\n'));

for (const name of [...skippedInterfaces].sort()) {
  console.warn(`Skipped ${name}.custom — no mapping`);
}

for (const key of [...skippedFilterKeys].sort()) {
  console.warn(`Skipped ${key} filter custom — no mapping`);
}

console.log(
  `Rewrote ${rewrittenCustomCount} custom + ${rewrittenChannelCustomCount} channel_custom` +
    ` + ${rewrittenFilterCustomCount} filter custom fields; ` +
    `skipped ${skippedInterfaces.size} interfaces and ${skippedFilterKeys.size} filter blocks.`,
);

/**
 * Compute the ES-module specifier (POSIX, no `.ts` extension) that resolves
 * from the target file's directory to the shared custom_types module.
 */
function computeImportSpecifier(fromFileAbs: string, toRepoRelative: string) {
  const toAbs = resolve(process.cwd(), toRepoRelative);
  let specifier = relative(dirname(fromFileAbs), toAbs).replace(/\\/g, '/');
  specifier = specifier.replace(/\.ts$/, '');
  if (!specifier.startsWith('.')) specifier = `./${specifier}`;
  return specifier;
}

/**
 * Idempotently ensure an `import type { ... } from '<specifier>'` exists at
 * the top of the file, merging into an existing import from the same module
 * (deduped and sorted).
 */
function applyImport(
  fileLines: string[],
  identifiers: string[],
  specifier: string,
) {
  const importRe = new RegExp(
    `^import\\s+type\\s+\\{([^}]*)\\}\\s+from\\s+['"]${escapeRegex(specifier)}['"];?\\s*$`,
  );
  const multilineOpenRe = new RegExp(`^import\\s+type\\s+\\{\\s*$`);
  const multilineCloseRe = new RegExp(
    `^\\}\\s+from\\s+['"]${escapeRegex(specifier)}['"];?\\s*$`,
  );

  for (let i = 0; i < fileLines.length; i += 1) {
    const line = fileLines[i];
    const single = line.match(importRe);
    if (single) {
      const existing = single[1]
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const merged = [...new Set([...existing, ...identifiers])].sort();
      fileLines.splice(i, 1, buildImport(merged, specifier));
      return;
    }
    if (multilineOpenRe.test(line)) {
      let end = -1;
      for (let j = i + 1; j < fileLines.length; j += 1) {
        if (multilineCloseRe.test(fileLines[j])) {
          end = j;
          break;
        }
      }
      if (end !== -1) {
        const existing = fileLines
          .slice(i + 1, end)
          .join(',')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        const merged = [...new Set([...existing, ...identifiers])].sort();
        fileLines.splice(i, end - i + 1, buildImport(merged, specifier));
        return;
      }
    }
  }

  fileLines.unshift('', buildImport(identifiers, specifier));
}

function buildImport(identifiers: string[], specifier: string) {
  return `import type { ${identifiers.join(', ')} } from '${specifier}';`;
}

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
