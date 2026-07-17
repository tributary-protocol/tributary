FROM node:22-alpine

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm ci

# Copy application source code
COPY index.mjs export-csv.mjs ./

# Create data directory and set ownership to node user
RUN mkdir -p /app/data && chown -R node:node /app

# Switch to non-root user
USER node

# Default environment variables optimized for containerized usage
ENV RPC_URL="https://soroban-testnet.stellar.org" \
    CONTRACT_ID="CCZXVZUQIZT673QF6ZGLI5AJLEPWUFWVYOPIOJNLNIOO5NI27V4JGJUU" \
    OUT="/app/data/events.ndjson" \
    STATE="/app/data/state.json" \
    POLL_MS="10000"

# Volume for persisted state and output files
VOLUME ["/app/data"]

CMD ["node", "index.mjs"]
