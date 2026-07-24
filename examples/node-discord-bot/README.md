# node-discord-bot

Consume indexer events from `events.ndjson` and post them to a Discord channel
via webhook. Each event type gets its own embed color and icon so you can
spot contract activity at a glance.

## Setup

### 1. Create a Discord webhook

1. Open your Discord server settings → **Integrations** → **Webhooks**.
2. Click **New Webhook**, give it a name like "Tributary Indexer", and pick the
   channel where events should appear.
3. Copy the **Webhook URL** — it looks like:
   `https://discord.com/api/webhooks/1234567890/abcdef...`

### 2. Run the indexer

The bot reads from the same `events.ndjson` file the indexer writes to. Start
the indexer first (from the repo root or `indexer/` directory):

```
cd indexer
npm install
npm start
```

### 3. Install and run the bot

```
cd examples/node-discord-bot
npm install
DISCORD_WEBHOOK_URL="https://discord.com/api/webhooks/..." npm start
```

The bot polls `events.ndjson` for new lines and posts any new events to
Discord as rich embeds. The byte offset it has already sent is persisted in
`discord-bot-state.json` so restarts don't re-post old events.

## Environment variables

| Variable | Default | Description |
| --- | --- | --- |
| `DISCORD_WEBHOOK_URL` | *(required)* | Discord channel webhook URL |
| `EVENTS_PATH` | `events.ndjson` | Indexer output file to watch |
| `STATE_PATH` | `discord-bot-state.json` | Cursor state for deduplication across restarts |
| `POLL_MS` | `15000` | How often to check for new events (ms) |

## What it looks like

Each event becomes a Discord embed with a colored sidebar:

- **Split Created** (blue) — new split registered
- **Split Paid** (green) — payment routed through a split
- **Split Updated** (yellow) — split configuration changed
- **Split Closed** (red) — split deactivated
- **Deposited** (pink) — funds deposited into a split
- **Distributed** (purple) — funds distributed to recipients
- **Control Transfer Proposed** (orange) — controller change requested
- **Control Transferred** (teal) — controller change accepted

## Tests

```
npm test
```

Unit tests cover event formatting, amount conversion, and embed construction
without touching the network.
