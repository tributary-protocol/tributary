# tributary-indexer

Small poller that follows the splitter contract's events and appends them to a newline-delimited JSON file. Useful for payment history, accounting exports or webhooks without standing up real infrastructure.

## Run

```
cd indexer
npm install
npm start
```

Each event becomes one line in `events.ndjson`:

```json
{"ledger":581235,"txHash":"d6fc…","type":"split_paid","split":"1","token":"CDLZ…","amount":"10000000","at":"2026-07-04T00:00:00Z"}
```

The RPC cursor is persisted to `state.json`, so restarts continue where they left off instead of re-indexing.

## Configuration

Copy `.env.example` to `.env` and override any values you need:

```bash
cp .env.example .env
```

Environment variables, all optional:


| Variable | Default | Meaning |
| --- | --- | --- |
| `RPC_URL` | testnet RPC | Soroban RPC endpoint |
| `CONTRACT_ID` | current testnet splitter | contract to follow |
| `OUT` | `events.ndjson` | output file |
| `STATE` | `state.json` | cursor file |
| `POLL_MS` | `10000` | poll interval |
| `BACKOFF_INITIAL_MS` | `1000` | initial delay after an RPC rate-limit response |
| `BACKOFF_MAX_MS` | `60000` | maximum exponential backoff delay |
| `LOG_LEVEL` | `info` | log verbosity (`debug`, `info`, `warn`, `error`) |

## Docker

You can run the indexer inside a Docker container. This is the recommended way for deployment as it simplifies setup and ensures the process runs in isolation.

### Build the Image

Run the following command from the repository root:

```bash
docker build -t tributary-indexer -f indexer/Dockerfile .
```

Or from the `indexer` directory:

```bash
docker build -t tributary-indexer .
```

### Run the Container

To ensure the indexer doesn't lose its cursor (state) and successfully records events, mount a local directory to the container's `/app/data` volume:

```bash
docker run -d \
  --name tributary-indexer \
  -v $(pwd)/data:/app/data \
  -e CONTRACT_ID="YOUR_CONTRACT_ID" \
  tributary-indexer
```

By default, the Docker image is configured to write to `/app/data/events.ndjson` and `/app/data/state.json`. You can customize these and other configuration options using environment variables:

| Variable | Default inside Container | Description |
| --- | --- | --- |
| `RPC_URL` | `https://soroban-testnet.stellar.org` | Soroban RPC endpoint |
| `CONTRACT_ID` | `CCZXVZUQIZT673QF6ZGLI5AJLEPWUFWVYOPIOJNLNIOO5NI27V4JGJUU` | Contract ID to follow |
| `OUT` | `/app/data/events.ndjson` | Output events file path |
| `STATE` | `/app/data/state.json` | Cursor state file path |
| `POLL_MS` | `10000` | Polling interval in milliseconds |
| `BACKOFF_INITIAL_MS` | `1000` | Initial rate-limit backoff delay in milliseconds |
| `BACKOFF_MAX_MS` | `60000` | Maximum rate-limit backoff delay in milliseconds |
| `LOG_LEVEL` | `info` | Log verbosity (`debug`, `info`, `warn`, `error`) |

## CSV export

For spreadsheets or accounting, convert the log to CSV:

```
node export-csv.mjs > events.csv
```

Note that public RPC only retains about a week of events. For a full history from genesis, run against your own RPC with extended retention, or start the indexer early and keep it running.
