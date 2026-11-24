/**
 * Pure helpers: config validation, state management, event deduplication,
 * and cursor safety.  No RPC dependency — importable by tests without
 * @stellar/stellar-sdk.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const DEFAULT_RPC_URL = "https://soroban-testnet.stellar.org";
const DEFAULT_CONTRACT_ID =
  "CCZXVZUQIZT673QF6ZGLI5AJLEPWUFWVYOPIOJNLNIOO5NI27V4JGJUU";

export function validateConfig(env = process.env) {
  const errors = [];
  const RPC_URL = (env.RPC_URL ?? DEFAULT_RPC_URL).trim();
  const CONTRACT_ID = (env.CONTRACT_ID ?? DEFAULT_CONTRACT_ID).trim();

  if (!RPC_URL) errors.push("RPC_URL is required");
  if (!CONTRACT_ID) errors.push("CONTRACT_ID is required");

  if (errors.length > 0) {
    return {
      ok: false,
      error: `Invalid indexer configuration:\n- ${errors.join("\n- ")}`,
    };
  }

  return { ok: true, value: { RPC_URL, CONTRACT_ID } };
}

// ---------------------------------------------------------------------------
// State persistence
// ---------------------------------------------------------------------------

/**
 * Load persisted state from the given file.
 * Returns { cursor, seenIds } where seenIds is a Set<string>.
 * Tolerates missing files and legacy state.json files that have no seenIds.
 */
export function loadState(statePath) {
  if (!existsSync(statePath)) return { cursor: null, seenIds: new Set() };
  try {
    const raw = JSON.parse(readFileSync(statePath, "utf8"));
    return {
      cursor: raw.cursor ?? null,
      seenIds: new Set(Array.isArray(raw.seenIds) ? raw.seenIds : []),
    };
  } catch {
    return { cursor: null, seenIds: new Set() };
  }
}

/**
 * Persist cursor and the current seenIds set to the given file.
 * seenIds is stored as a sorted array so the file is deterministic.
 */
export function saveState(cursor, seenIds, statePath) {
  writeFileSync(
    statePath,
    JSON.stringify({ cursor, seenIds: [...seenIds].sort() }),
  );
}

// ---------------------------------------------------------------------------
// Cursor helpers
// ---------------------------------------------------------------------------

/**
 * Return the ledger sequence encoded in a cursor string.
 * Cursor format: "<ledger_seq_shifted_left_32bits>-<tx_index>-<event_index>"
 */
export function cursorLedger(cursor) {
  return Number(BigInt(cursor.split("-")[0]) >> 32n);
}

/**
 * Decide whether it is safe to advance the persisted cursor to `candidateCursor`.
 *
 * We hold back the cursor when the ledger it points at is within reorgDepth
 * ledgers of the current chain tip. That guarantees events from those ledgers
 * are re-fetched next poll, so a small reorg can never cause a permanent gap.
 *
 * @param {string} candidateCursor  - cursor returned by the RPC for this page
 * @param {number} latestLedger     - current chain tip from the same response
 * @param {number} reorgDepth       - number of ledgers to hold back
 * @returns {boolean}
 */
export function isCursorSafeToCommit(candidateCursor, latestLedger, reorgDepth) {
  return cursorLedger(candidateCursor) <= latestLedger - reorgDepth;
}

// ---------------------------------------------------------------------------
// Event deduplication
// ---------------------------------------------------------------------------

/**
 * Filter a raw event array down to events that have not been seen before,
 * add their ids to seenIds, and return the new records (still raw — decoding
 * is done by the caller so this module stays free of RPC types).
 *
 * Mutates seenIds in place so the caller's Set stays up to date.
 *
 * @param {object[]}    events  - raw RPC event objects (must have an `id` field)
 * @param {Set<string>} seenIds - mutable set of already-persisted event ids
 * @returns {object[]}            events that were not in seenIds
 */
export function deduplicateEvents(events, seenIds) {
  const fresh = [];
  for (const ev of events) {
    if (seenIds.has(ev.id)) continue;
    seenIds.add(ev.id);
    fresh.push(ev);
  }
  return fresh;
}
