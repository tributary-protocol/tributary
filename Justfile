# Justfile for Tributary project
# This Justfile provides discoverable shortcuts for common development tasks.

# Build the contract wasm (release)
build:
	@echo "Building contract..."
	cargo build --release --target wasm32v1-none -p tributary-splitter

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
