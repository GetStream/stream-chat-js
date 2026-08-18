#!/bin/bash
set -euo pipefail

OUTPUT_DIR="../stream-chat-js/src/gen"
CHAT_DIR="../chat"

rm -rf $OUTPUT_DIR

( cd $CHAT_DIR ; make openapi ; make -C projects/chat-manager build; build/chat-manager openapi generate-client --language ts --spec releases/v2/chat-clientside-api.yaml --output $OUTPUT_DIR --opt typed_filters=true --opt with_request_options=true)

# apply-custom-data-types matches `export interface` / `}` anchored to column 0,
# but the generator emits them indented — format first so it can track which
# interface each `custom` field belongs to.
yarn exec prettier --write $OUTPUT_DIR/models/index.ts

node ./scripts/apply-custom-data-types.mts -i $OUTPUT_DIR/models/index.ts

yarn lint-fix