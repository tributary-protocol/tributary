FROM mcr.microsoft.com/devcontainers/rust:1-1-bookworm

# Install additional packages
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    git \
    && rm -rf /var/lib/apt/lists/*

# Install Stellar CLI using the official installer script
RUN curl -fsSL https://github.com/stellar/stellar-cli/raw/main/install.sh | sh
