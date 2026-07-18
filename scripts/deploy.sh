#!/usr/bin/env bash
# Builds the splitter and deploys it to testnet under the "splitter" alias.
set -euo pipefail
cd "$(dirname "$0")/.."

source="${1:-deployer}"

cargo build --release --target wasm32v1-none -p tributary-splitter

# Optimize the wasm binary before deploying
if command -v wasm-opt &>/dev/null; then
  echo "Original size:"
  ls -lh target/wasm32v1-none/release/tributary_splitter.wasm
  echo "Running wasm-opt -Oz..."
  wasm-opt -Oz \
    -o target/wasm32v1-none/release/tributary_splitter.wasm \
    target/wasm32v1-none/release/tributary_splitter.wasm
  echo "Optimized size:"
  ls -lh target/wasm32v1-none/release/tributary_splitter.wasm
else
  echo "wasm-opt not found (install binaryen). Skipping optimization."
fi

stellar contract deploy \
  --wasm target/wasm32v1-none/release/tributary_splitter.wasm \
  --source "$source" \
  --network testnet \
  --alias splitter

echo
echo "Deployed. Now regenerate the sdk bindings and update the readme:"
echo "  stellar contract bindings typescript --contract-id <id> --network testnet --output-dir sdk --overwrite"
