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

# --- Indexer ---

# Build the indexer service
indexer-build:
	@echo "Building indexer..."
	cd indexer && npm run build

# Run the indexer locally with Docker Compose
indexer-up:
	@echo "Starting indexer stack..."
	cd indexer && docker compose up -d --build

# Stop the indexer stack
indexer-down:
	@echo "Stopping indexer stack..."
	cd indexer && docker compose down

# Trigger a projection rebuild
indexer-rebuild:
	@echo "Rebuilding projections..."
	curl -s -X POST http://localhost:3000/admin/rebuild | python -m json.tool

# Trigger reconciliation
indexer-reconcile:
	@echo "Running reconciliation..."
	curl -s -X POST http://localhost:3000/reconcile | python -m json.tool

# Check indexer health
indexer-health:
	@echo "Checking health..."
	curl -s http://localhost:3000/health | python -m json.tool

# Run indexer typecheck
indexer-typecheck:
	@echo "Typechecking indexer..."
	cd indexer && npm run typecheck

# Run indexer tests
indexer-test:
	@echo "Running indexer tests..."
	cd indexer && npm test

# Run migrations locally (requires DATABASE_URL)
indexer-migrate:
	@echo "Running migrations..."
	cd indexer && npm run migrate
