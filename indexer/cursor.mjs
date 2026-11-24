/**
 * Stellar RPC event cursor helpers.
 *
 * A cursor string has the format "<u64_be_hex_decimal>-<tx_order>" where the
 * upper 32 bits of the leading u64 encode the ledger sequence number. The RPC
 * spec calls this the "toid" (transaction order id).
 *
 * See https://developers.stellar.org/network/horizon/api-reference/aggregations/trade-aggregations/object
 * for the binary layout (same scheme used by Soroban RPC).
 */

/**
 * Extract the ledger sequence number embedded in a Soroban RPC cursor string.
 *
 * @param {string} cursor  e.g. "549755813888-1"  (ledger 128 << 32 ... = 128)
 * @returns {number}
 */
export function cursorLedger(cursor) {
  return Number(BigInt(cursor.split("-")[0]) >> 32n);
}

/**
 * Return true when the poll loop should stop paging and wait for the next
 * tick.  This happens once there are fewer events than the page limit AND the
 * cursor has caught up to (or passed) the chain head.
 *
 * @param {object} params
 * @param {number}  params.eventCount      Number of events returned in this page.
 * @param {number}  params.pageLimit       The limit sent with the request.
 * @param {string}  params.cursor          The cursor returned by the RPC call.
 * @param {number}  params.latestLedger    `res.latestLedger` from the RPC call.
 * @returns {boolean}
 */
export function isCaughtUp({ eventCount, pageLimit, cursor, latestLedger }) {
  return eventCount < pageLimit && cursorLedger(cursor) >= latestLedger;
}
