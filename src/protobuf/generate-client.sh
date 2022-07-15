#!/bin/bash
set -o pipefail
set -o nounset
set -ex

PROTO_DIR="./"
OUT_DIR="../protobuf_gen"

echo "Begin generating protobuf client"
rm -rf $OUT_DIR && mkdir -p $OUT_DIR

# for the full list of available opts, see: https://github.com/timostamm/protobuf-ts/blob/master/MANUAL.md
npx protoc \
  --ts_out $OUT_DIR \
  --ts_opt long_type_string \
  --ts_opt generate_dependencies \
  --ts_opt client_generic \
  --ts_opt server_none \
  --proto_path $PROTO_DIR \
  $PROTO_DIR/chat/v2/client_rpc/clientside.proto

echo "Finished generating protobuf client"