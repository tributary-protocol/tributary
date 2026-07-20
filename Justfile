# Justfile for Tributary project
# This Justfile provides discoverable shortcuts for common development tasks.

# Build the contract wasm (release)
build:
	@echo "Building contract..."
	cargo build --release --target wasm32v1-none -p tributary-splitter

# Build and optimize the contract wasm with wasm-opt (in-place)
build-optimized:
	@echo "Building contract..."
	cargo build --release --target wasm32v1-none -p tributary-splitter
	@echo "Original size:"
	ls -lh target/wasm32v1-none/release/tributary_splitter.wasm
	@echo "Running wasm-opt -Oz..."
	wasm-opt -Oz \
	  -o target/wasm32v1-none/release/tributary_splitter.wasm \
	  target/wasm32v1-none/release/tributary_splitter.wasm
	@echo "Optimized size:"
	ls -lh target/wasm32v1-none/release/tributary_splitter.wasm

# Run all tests
test:
	@echo "Running tests..."
	cargo test

# Deploy the contract (uses provided script)
deploy:
	@echo "Deploying contract..."
	sh ./scripts/deploy.sh

# Demo the contract end-to-end (uses provided script)
demo:
	@echo "Running demo..."
	sh ./scripts/demo.sh

# Run the standalone Node create-and-pay example against testnet
node-example:
	@echo "Running node-create-and-pay example..."
	cd sdk && npm install && npm run build
	cd examples/node-create-and-pay && npm install && npm start
