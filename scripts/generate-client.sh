#!/bin/bash
set -euo pipefail

OUTPUT_DIR="../stream-chat-js/src/gen"
CHAT_DIR="../chat"

rm -rf $OUTPUT_DIR

( cd $CHAT_DIR ; make openapi ; make -C tools/openapi build ; ./build/openapi generate-client --language ts --spec releases/v2/chat-clientside-api.yaml --output $OUTPUT_DIR --opt typed_filters=true --opt with_request_options=true --opt response_dates_as_number=true --opt separate_path_params=true)

# apply-custom-data-types matches `export interface` / `}` anchored to column 0.
# The generator emits them there already; formatting first keeps that true.
yarn exec prettier --write $OUTPUT_DIR/models/index.ts

node ./scripts/apply-custom-data-types.mts -i $OUTPUT_DIR/models/index.ts

# The API classes import every model, and unused-imports removes only every other
# unused name per fix pass (neighbouring fixes share a comma), so the cleanup needs
# more than ESLint's 10 passes per run. This first run lets the one in lint-fix finish;
# `|| true` because it exits non-zero while warnings remain.
yarn exec eslint --fix $OUTPUT_DIR > /dev/null || true

yarn lint-fix