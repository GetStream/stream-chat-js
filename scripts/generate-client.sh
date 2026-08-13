#!/bin/bash
set -euo pipefail

OUTPUT_DIR="../stream-chat-js/src/gen"
CHAT_DIR="../chat"

rm -rf $OUTPUT_DIR

( cd $CHAT_DIR ; make openapi ; make -C projects/chat-manager build; build/chat-manager openapi generate-client --language ts --spec releases/v2/chat-clientside-api.yaml --output $OUTPUT_DIR --opt typed_filters=true)

# apply-custom-data-types matches `export interface` / `}` anchored to column 0,
# but the generator emits them indented — format first so it can track which
# interface each `custom` field belongs to.
yarn exec prettier --write $OUTPUT_DIR/models/index.ts

node ./scripts/apply-custom-data-types.mts -i $OUTPUT_DIR/models/index.ts

yarn lint-fix

# TODO: temp solution until we figure out how to treat custom data
# New models can carry a `custom` field with no entry in the codemod's mapping, in
# which case they stay `Record<string, any>`. Let Claude audit the diff and add the
# missing entries; see .claude/skills/check-custom-data-mapping/SKILL.md.
if command -v claude >/dev/null 2>&1; then
  claude -p "/check-custom-data-mapping" --permission-mode acceptEdits
else
  echo "claude CLI not found — run 'claude -p \"/check-custom-data-mapping\"' before committing." >&2
fi