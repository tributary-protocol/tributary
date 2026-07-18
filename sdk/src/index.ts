import { Buffer } from "buffer";
import { Address } from "@stellar/stellar-sdk";
import {
  AssembledTransaction,
  Client as ContractClient,
  ClientOptions as ContractClientOptions,
  MethodOptions,
  Result,
  Spec as ContractSpec,
} from "@stellar/stellar-sdk/contract";
import type {
  u32,
  i32,
  u64,
  i64,
  u128,
  i128,
  u256,
  i256,
  Option,
  Timepoint,
  Duration,
} from "@stellar/stellar-sdk/contract";
import { Server as RpcServer, Api } from "@stellar/stellar-sdk/rpc";
export * from "@stellar/stellar-sdk";
export * as contract from "@stellar/stellar-sdk/contract";
export * as rpc from "@stellar/stellar-sdk/rpc";

if (typeof window !== "undefined") {
  //@ts-ignore Buffer exists
  window.Buffer = window.Buffer || Buffer;
}


export const networks = {
  testnet: {
    networkPassphrase: "Test SDF Network ; September 2015",
    contractId: "CCZXVZUQIZT673QF6ZGLI5AJLEPWUFWVYOPIOJNLNIOO5NI27V4JGJUU",
  }
} as const



export const Errors = {
  /**
   * Code 1. The recipient list is empty.
   * Raised by `create_split`, `update_split` (via `validate`), and
   * `pay_many` (empty `ids` list).
   */
  1: {message:"NoRecipients"},
  /**
   * Code 2. The `recipients` and `shares` vectors have different lengths.
   * Raised by `create_split`, `update_split` (via `validate`), and
   * `pay_many` (mismatched `ids`/`amounts`).
   */
  2: {message:"LengthMismatch"},
  /**
   * Code 3. A share value is `0`.
   * Raised by `create_split` and `update_split` (via `validate`).
   */
  3: {message:"ZeroShare"},
  /**
   * Code 4. Shares do not sum to `TOTAL_SHARES` (10_000), or the sum
   * overflows `u32`.
   * Raised by `create_split` and `update_split` (via `validate`).
   */
  4: {message:"BadShareTotal"},
  /**
   * Code 5. The split `id` does not exist in storage.
   * Raised by `pay`, `pay_many`, `update_split`, `transfer_control`,
   * `distribute`, `preview_payout`, and `get_split` (all via `load`).
   */
  5: {message:"SplitNotFound"},
  /**
   * Code 6. An edit was attempted on a split with `controller == None`.
   * Raised by `update_split` and `transfer_control`.
   */
  6: {message:"SplitImmutable"},
  /**
   * Code 7. The payment amount is zero or negative.
   * Raised by `pay`, `pay_many`, `deposit`, and `preview_payout`.
   */
  7: {message:"InvalidAmount"},
  /**
   * Code 8. `distribute` was called on a split/token with an empty
   * escrow balance.
   * Raised by `distribute`.
   */
  8: {message:"NothingToDistribute"},
  /**
   * Code 9. More than `MAX_RECIPIENTS` (32) recipients were supplied.
   * Raised by `create_split` and `update_split` (via `validate`).
   */
  9: {message:"TooManyRecipients"},
  /**
   * Code 10. A `Recipient::Split(child)` reference is unknown, or a split
   * references itself (directly or as its own update target).
   * Raised by `create_split` and `update_split` (via `validate`).
   */
  10: {message:"BadChildSplit"},
  /**
   * An arithmetic path produced a value that does not fit the i128 the
   * contract stores. Can only happen if a share exceeds TOTAL_SHARES, which
   * `validate` forbids, but we surface it as a typed error rather than panic.
   */
  11: {message:"ArithmeticOverflow"},
  12: {message:"SplitHasBalance"}
}


export interface Split {
  controller: Option<string>;
  recipients: Array<Recipient>;
  shares: Array<u32>;
}

export type Recipient = {tag: "Account", values: readonly [string]} | {tag: "Split", values: readonly [u64]};








export interface Client {
  /**
   * Construct and simulate a pay transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Moves `amount` of `token` from the payer to every recipient of the
   * split in one call. Rounding dust goes to the last recipient.
   */
  pay: ({from, id, token, amount, reference}: {from: string, id: u64, token: string, amount: i128, reference: Option<Buffer>}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a balance transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  balance: ({id, token}: {id: u64, token: string}, options?: MethodOptions) => Promise<AssembledTransaction<i128>>

  /**
   * Construct and simulate a deposit transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Moves funds into the contract and credits them to the split without
   * paying anyone yet. Useful when money arrives before a distribution
   * should happen.
   * 
   * Credits the amount the vault's balance actually increased by rather
   * than the requested `amount`, so fee-on-transfer tokens that deliver
   * less than requested cannot over-credit the split.
   */
  deposit: ({from, id, token, amount}: {from: string, id: u64, token: string, amount: i128}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a pay_many transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Pays several splits from one signer in a single transaction.
   * `ids` and `amounts` pair up positionally; any failure reverts all.
   * 
   * `references` optionally tags each split's payment for reconciliation
   * and pairs up positionally too. An empty `references` vec means "no
   * reference for any split"; otherwise it must match `ids.len()` exactly.
   */
  pay_many: ({from, ids, amounts, token, references}: {from: string, ids: Array<u64>, amounts: Array<i128>, token: string, references: Array<Option<Buffer>>}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a get_split transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_split: ({id}: {id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<Result<Split>>>

  /**
   * Construct and simulate a splits_of transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  splits_of: ({creator}: {creator: string}, options?: MethodOptions) => Promise<AssembledTransaction<Array<u64>>>

  /**
   * Construct and simulate a distribute transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Pays out everything credited to the split for the given token.
   * Anyone can call this; the routing table decides where funds go.
   */
  distribute: ({id, token}: {id: u64, token: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<i128>>>

  /**
   * Construct and simulate a close_split transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Closes a split and reclaims its storage. Only the controller can do this,
   * and only if the split holds no balances.
   */
  close_split: ({id}: {id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a held_tokens transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  held_tokens: ({id}: {id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<Array<string>>>

  /**
   * Construct and simulate a split_count transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  split_count: (options?: MethodOptions) => Promise<AssembledTransaction<u64>>

  /**
   * Construct and simulate a create_split transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Registers a new split and returns its id. Shares are basis points
   * and must sum to exactly 10_000. Passing a controller makes the
   * split mutable by that address; passing None locks it forever.
   */
  create_split: ({creator, recipients, shares, controller}: {creator: string, recipients: Array<Recipient>, shares: Array<u32>, controller: Option<string>}, options?: MethodOptions) => Promise<AssembledTransaction<Result<u64>>>

  /**
   * Construct and simulate a update_split transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Replaces the recipients and shares of a mutable split.
   */
  update_split: ({id, recipients, shares}: {id: u64, recipients: Array<Recipient>, shares: Array<u32>}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a pay_many_multi transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Pays several splits from one signer in a single transaction, each
   * with its own token. `ids`, `amounts`, and `tokens` pair up
   * positionally; any failure reverts all.
   * 
   * `references` optionally tags each split's payment for reconciliation
   * and pairs up positionally too. An empty `references` vec means "no
   * reference for any split"; otherwise it must match `ids.len()` exactly.
   */
  pay_many_multi: ({from, ids, amounts, tokens, references}: {from: string, ids: Array<u64>, amounts: Array<i128>, tokens: Array<string>, references: Array<Option<Buffer>>}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a preview_payout transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Returns the exact per-recipient amounts a payment of `amount` would
   * produce, without moving any funds.
   */
  preview_payout: ({id, amount}: {id: u64, amount: i128}, options?: MethodOptions) => Promise<AssembledTransaction<Result<Array<i128>>>>

  /**
   * Construct and simulate a splits_of_count transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  splits_of_count: ({creator}: {creator: string}, options?: MethodOptions) => Promise<AssembledTransaction<u32>>

  /**
   * Construct and simulate a splits_of_paged transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  splits_of_paged: ({creator, start, limit}: {creator: string, start: u32, limit: u32}, options?: MethodOptions) => Promise<AssembledTransaction<Array<u64>>>

  /**
   * Construct and simulate a transfer_control transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Hands control of a mutable split to another address, or locks it
   * forever when the new controller is None.
   */
  transfer_control: ({id, new_controller}: {id: u64, new_controller: Option<string>}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

}
export class Client extends ContractClient {
  static async deploy<T = Client>(
    /** Options for initializing a Client as well as for calling a method, with extras specific to deploying. */
    options: MethodOptions &
      Omit<ContractClientOptions, "contractId"> & {
        /** The hash of the Wasm blob, which must already be installed on-chain. */
        wasmHash: Buffer | string;
        /** Salt used to generate the contract's ID. Passed through to {@link Operation.createCustomContract}. Default: random. */
        salt?: Buffer | Uint8Array;
        /** The format used to decode `wasmHash`, if it's provided as a string. */
        format?: "hex" | "base64";
      }
  ): Promise<AssembledTransaction<T>> {
    return ContractClient.deploy(null, options)
  }
  constructor(public readonly options: ContractClientOptions) {
    super(
      new ContractSpec([ "AAAABAAAAAAAAAAAAAAABUVycm9yAAAAAAAADAAAAIJDb2RlIDEuIFRoZSByZWNpcGllbnQgbGlzdCBpcyBlbXB0eS4KUmFpc2VkIGJ5IGBjcmVhdGVfc3BsaXRgLCBgdXBkYXRlX3NwbGl0YCAodmlhIGB2YWxpZGF0ZWApLCBhbmQKYHBheV9tYW55YCAoZW1wdHkgYGlkc2AgbGlzdCkuAAAAAAAMTm9SZWNpcGllbnRzAAAAAQAAAK1Db2RlIDIuIFRoZSBgcmVjaXBpZW50c2AgYW5kIGBzaGFyZXNgIHZlY3RvcnMgaGF2ZSBkaWZmZXJlbnQgbGVuZ3Rocy4KUmFpc2VkIGJ5IGBjcmVhdGVfc3BsaXRgLCBgdXBkYXRlX3NwbGl0YCAodmlhIGB2YWxpZGF0ZWApLCBhbmQKYHBheV9tYW55YCAobWlzbWF0Y2hlZCBgaWRzYC9gYW1vdW50c2ApLgAAAAAAAA5MZW5ndGhNaXNtYXRjaAAAAAAAAgAAAFtDb2RlIDMuIEEgc2hhcmUgdmFsdWUgaXMgYDBgLgpSYWlzZWQgYnkgYGNyZWF0ZV9zcGxpdGAgYW5kIGB1cGRhdGVfc3BsaXRgICh2aWEgYHZhbGlkYXRlYCkuAAAAAAlaZXJvU2hhcmUAAAAAAAADAAAAj0NvZGUgNC4gU2hhcmVzIGRvIG5vdCBzdW0gdG8gYFRPVEFMX1NIQVJFU2AgKDEwXzAwMCksIG9yIHRoZSBzdW0Kb3ZlcmZsb3dzIGB1MzJgLgpSYWlzZWQgYnkgYGNyZWF0ZV9zcGxpdGAgYW5kIGB1cGRhdGVfc3BsaXRgICh2aWEgYHZhbGlkYXRlYCkuAAAAAA1CYWRTaGFyZVRvdGFsAAAAAAAABAAAALRDb2RlIDUuIFRoZSBzcGxpdCBgaWRgIGRvZXMgbm90IGV4aXN0IGluIHN0b3JhZ2UuClJhaXNlZCBieSBgcGF5YCwgYHBheV9tYW55YCwgYHVwZGF0ZV9zcGxpdGAsIGB0cmFuc2Zlcl9jb250cm9sYCwKYGRpc3RyaWJ1dGVgLCBgcHJldmlld19wYXlvdXRgLCBhbmQgYGdldF9zcGxpdGAgKGFsbCB2aWEgYGxvYWRgKS4AAAANU3BsaXROb3RGb3VuZAAAAAAAAAUAAAB0Q29kZSA2LiBBbiBlZGl0IHdhcyBhdHRlbXB0ZWQgb24gYSBzcGxpdCB3aXRoIGBjb250cm9sbGVyID09IE5vbmVgLgpSYWlzZWQgYnkgYHVwZGF0ZV9zcGxpdGAgYW5kIGB0cmFuc2Zlcl9jb250cm9sYC4AAAAOU3BsaXRJbW11dGFibGUAAAAAAAYAAABtQ29kZSA3LiBUaGUgcGF5bWVudCBhbW91bnQgaXMgemVybyBvciBuZWdhdGl2ZS4KUmFpc2VkIGJ5IGBwYXlgLCBgcGF5X21hbnlgLCBgZGVwb3NpdGAsIGFuZCBgcHJldmlld19wYXlvdXRgLgAAAAAAAA1JbnZhbGlkQW1vdW50AAAAAAAABwAAAGZDb2RlIDguIGBkaXN0cmlidXRlYCB3YXMgY2FsbGVkIG9uIGEgc3BsaXQvdG9rZW4gd2l0aCBhbiBlbXB0eQplc2Nyb3cgYmFsYW5jZS4KUmFpc2VkIGJ5IGBkaXN0cmlidXRlYC4AAAAAABNOb3RoaW5nVG9EaXN0cmlidXRlAAAAAAgAAAB/Q29kZSA5LiBNb3JlIHRoYW4gYE1BWF9SRUNJUElFTlRTYCAoMzIpIHJlY2lwaWVudHMgd2VyZSBzdXBwbGllZC4KUmFpc2VkIGJ5IGBjcmVhdGVfc3BsaXRgIGFuZCBgdXBkYXRlX3NwbGl0YCAodmlhIGB2YWxpZGF0ZWApLgAAAAARVG9vTWFueVJlY2lwaWVudHMAAAAAAAAJAAAAvUNvZGUgMTAuIEEgYFJlY2lwaWVudDo6U3BsaXQoY2hpbGQpYCByZWZlcmVuY2UgaXMgdW5rbm93biwgb3IgYSBzcGxpdApyZWZlcmVuY2VzIGl0c2VsZiAoZGlyZWN0bHkgb3IgYXMgaXRzIG93biB1cGRhdGUgdGFyZ2V0KS4KUmFpc2VkIGJ5IGBjcmVhdGVfc3BsaXRgIGFuZCBgdXBkYXRlX3NwbGl0YCAodmlhIGB2YWxpZGF0ZWApLgAAAAAAAA1CYWRDaGlsZFNwbGl0AAAAAAAACgAAANRBbiBhcml0aG1ldGljIHBhdGggcHJvZHVjZWQgYSB2YWx1ZSB0aGF0IGRvZXMgbm90IGZpdCB0aGUgaTEyOCB0aGUKY29udHJhY3Qgc3RvcmVzLiBDYW4gb25seSBoYXBwZW4gaWYgYSBzaGFyZSBleGNlZWRzIFRPVEFMX1NIQVJFUywgd2hpY2gKYHZhbGlkYXRlYCBmb3JiaWRzLCBidXQgd2Ugc3VyZmFjZSBpdCBhcyBhIHR5cGVkIGVycm9yIHJhdGhlciB0aGFuIHBhbmljLgAAABJBcml0aG1ldGljT3ZlcmZsb3cAAAAAAAsAAAAAAAAAD1NwbGl0SGFzQmFsYW5jZQAAAAAM",
        "AAAAAQAAAAAAAAAAAAAABVNwbGl0AAAAAAAAAwAAAAAAAAAKY29udHJvbGxlcgAAAAAD6AAAABMAAAAAAAAACnJlY2lwaWVudHMAAAAAA+oAAAfQAAAACVJlY2lwaWVudAAAAAAAAAAAAAAGc2hhcmVzAAAAAAPqAAAABA==",
        "AAAAAgAAAAAAAAAAAAAACVJlY2lwaWVudAAAAAAAAAIAAAABAAAAAAAAAAdBY2NvdW50AAAAAAEAAAATAAAAAQAAAAAAAAAFU3BsaXQAAAAAAAABAAAABg==",
        "AAAABQAAAAAAAAAAAAAACURlcG9zaXRlZAAAAAAAAAEAAAAJZGVwb3NpdGVkAAAAAAAAAwAAAAAAAAACaWQAAAAAAAYAAAABAAAAAAAAAAV0b2tlbgAAAAAAABMAAAAAAAAAAAAAAAZhbW91bnQAAAAAAAsAAAAAAAAAAg==",
        "AAAABQAAAAAAAAAAAAAACVNwbGl0UGFpZAAAAAAAAAEAAAAKc3BsaXRfcGFpZAAAAAAABAAAAAAAAAACaWQAAAAAAAYAAAABAAAAAAAAAAV0b2tlbgAAAAAAABMAAAAAAAAAAAAAAAZhbW91bnQAAAAAAAsAAAAAAAAAvk9wdGlvbmFsIGNhbGxlci1zdXBwbGllZCB0YWcgKGUuZy4gYW4gb3JkZXIgb3IgaW52b2ljZSBpZCkgc28KaW50ZWdyYXRvcnMgY2FuIHJlY29uY2lsZSBhIHBheW1lbnQgYWdhaW5zdCB0aGVpciBvd24gcmVjb3Jkcy4KTm90IGEgdG9waWM6IGl0IHJpZGVzIGFsb25nIGFzIGRhdGEgYW5kIG5ldmVyIGNvc3RzIGEgdG9waWMgc2xvdC4AAAAAAAlyZWZlcmVuY2UAAAAAAAPoAAAD7gAAACAAAAAAAAAAAg==",
        "AAAABQAAAAAAAAAAAAAAC0Rpc3RyaWJ1dGVkAAAAAAEAAAALZGlzdHJpYnV0ZWQAAAAAAwAAAAAAAAACaWQAAAAAAAYAAAABAAAAAAAAAAV0b2tlbgAAAAAAABMAAAAAAAAAAAAAAAZhbW91bnQAAAAAAAsAAAAAAAAAAg==",
        "AAAABQAAAAAAAAAAAAAAC1NwbGl0Q2xvc2VkAAAAAAEAAAAMc3BsaXRfY2xvc2VkAAAAAQAAAAAAAAACaWQAAAAAAAYAAAABAAAAAg==",
        "AAAABQAAAAAAAAAAAAAADFNwbGl0Q3JlYXRlZAAAAAEAAAANc3BsaXRfY3JlYXRlZAAAAAAAAAIAAAAAAAAAAmlkAAAAAAAGAAAAAQAAAAAAAAAHY3JlYXRvcgAAAAATAAAAAAAAAAI=",
        "AAAABQAAAAAAAAAAAAAADFNwbGl0VXBkYXRlZAAAAAEAAAANc3BsaXRfdXBkYXRlZAAAAAAAAAEAAAAAAAAAAmlkAAAAAAAGAAAAAQAAAAI=",
        "AAAABQAAAAAAAAAAAAAAEkNvbnRyb2xUcmFuc2ZlcnJlZAAAAAAAAQAAABNjb250cm9sX3RyYW5zZmVycmVkAAAAAAIAAAAAAAAAAmlkAAAAAAAGAAAAAQAAAAAAAAAObmV3X2NvbnRyb2xsZXIAAAAAA+gAAAATAAAAAAAAAAI=",
        "AAAAAAAAAH9Nb3ZlcyBgYW1vdW50YCBvZiBgdG9rZW5gIGZyb20gdGhlIHBheWVyIHRvIGV2ZXJ5IHJlY2lwaWVudCBvZiB0aGUKc3BsaXQgaW4gb25lIGNhbGwuIFJvdW5kaW5nIGR1c3QgZ29lcyB0byB0aGUgbGFzdCByZWNpcGllbnQuAAAAAANwYXkAAAAABQAAAAAAAAAEZnJvbQAAABMAAAAAAAAAAmlkAAAAAAAGAAAAAAAAAAV0b2tlbgAAAAAAABMAAAAAAAAABmFtb3VudAAAAAAACwAAAAAAAAAJcmVmZXJlbmNlAAAAAAAD6AAAA+4AAAAgAAAAAQAAA+kAAAACAAAAAw==",
        "AAAAAAAAAAAAAAAHYmFsYW5jZQAAAAACAAAAAAAAAAJpZAAAAAAABgAAAAAAAAAFdG9rZW4AAAAAAAATAAAAAQAAAAs=",
        "AAAAAAAAAVBNb3ZlcyBmdW5kcyBpbnRvIHRoZSBjb250cmFjdCBhbmQgY3JlZGl0cyB0aGVtIHRvIHRoZSBzcGxpdCB3aXRob3V0CnBheWluZyBhbnlvbmUgeWV0LiBVc2VmdWwgd2hlbiBtb25leSBhcnJpdmVzIGJlZm9yZSBhIGRpc3RyaWJ1dGlvbgpzaG91bGQgaGFwcGVuLgoKQ3JlZGl0cyB0aGUgYW1vdW50IHRoZSB2YXVsdCdzIGJhbGFuY2UgYWN0dWFsbHkgaW5jcmVhc2VkIGJ5IHJhdGhlcgp0aGFuIHRoZSByZXF1ZXN0ZWQgYGFtb3VudGAsIHNvIGZlZS1vbi10cmFuc2ZlciB0b2tlbnMgdGhhdCBkZWxpdmVyCmxlc3MgdGhhbiByZXF1ZXN0ZWQgY2Fubm90IG92ZXItY3JlZGl0IHRoZSBzcGxpdC4AAAAHZGVwb3NpdAAAAAAEAAAAAAAAAARmcm9tAAAAEwAAAAAAAAACaWQAAAAAAAYAAAAAAAAABXRva2VuAAAAAAAAEwAAAAAAAAAGYW1vdW50AAAAAAALAAAAAQAAA+kAAAACAAAAAw==",
        "AAAAAAAAAU9QYXlzIHNldmVyYWwgc3BsaXRzIGZyb20gb25lIHNpZ25lciBpbiBhIHNpbmdsZSB0cmFuc2FjdGlvbi4KYGlkc2AgYW5kIGBhbW91bnRzYCBwYWlyIHVwIHBvc2l0aW9uYWxseTsgYW55IGZhaWx1cmUgcmV2ZXJ0cyBhbGwuCgpgcmVmZXJlbmNlc2Agb3B0aW9uYWxseSB0YWdzIGVhY2ggc3BsaXQncyBwYXltZW50IGZvciByZWNvbmNpbGlhdGlvbgphbmQgcGFpcnMgdXAgcG9zaXRpb25hbGx5IHRvby4gQW4gZW1wdHkgYHJlZmVyZW5jZXNgIHZlYyBtZWFucyAibm8KcmVmZXJlbmNlIGZvciBhbnkgc3BsaXQiOyBvdGhlcndpc2UgaXQgbXVzdCBtYXRjaCBgaWRzLmxlbigpYCBleGFjdGx5LgAAAAAIcGF5X21hbnkAAAAFAAAAAAAAAARmcm9tAAAAEwAAAAAAAAADaWRzAAAAA+oAAAAGAAAAAAAAAAdhbW91bnRzAAAAA+oAAAALAAAAAAAAAAV0b2tlbgAAAAAAABMAAAAAAAAACnJlZmVyZW5jZXMAAAAAA+oAAAPoAAAD7gAAACAAAAABAAAD6QAAAAIAAAAD",
        "AAAAAAAAAAAAAAAJZ2V0X3NwbGl0AAAAAAAAAQAAAAAAAAACaWQAAAAAAAYAAAABAAAD6QAAB9AAAAAFU3BsaXQAAAAAAAAD",
        "AAAAAAAAAAAAAAAJc3BsaXRzX29mAAAAAAAAAQAAAAAAAAAHY3JlYXRvcgAAAAATAAAAAQAAA+oAAAAG",
        "AAAAAAAAAH5QYXlzIG91dCBldmVyeXRoaW5nIGNyZWRpdGVkIHRvIHRoZSBzcGxpdCBmb3IgdGhlIGdpdmVuIHRva2VuLgpBbnlvbmUgY2FuIGNhbGwgdGhpczsgdGhlIHJvdXRpbmcgdGFibGUgZGVjaWRlcyB3aGVyZSBmdW5kcyBnby4AAAAAAApkaXN0cmlidXRlAAAAAAACAAAAAAAAAAJpZAAAAAAABgAAAAAAAAAFdG9rZW4AAAAAAAATAAAAAQAAA+kAAAALAAAAAw==",
        "AAAAAAAAAHJDbG9zZXMgYSBzcGxpdCBhbmQgcmVjbGFpbXMgaXRzIHN0b3JhZ2UuIE9ubHkgdGhlIGNvbnRyb2xsZXIgY2FuIGRvIHRoaXMsCmFuZCBvbmx5IGlmIHRoZSBzcGxpdCBob2xkcyBubyBiYWxhbmNlcy4AAAAAAAtjbG9zZV9zcGxpdAAAAAABAAAAAAAAAAJpZAAAAAAABgAAAAEAAAPpAAAAAgAAAAM=",
        "AAAAAAAAAAAAAAALaGVsZF90b2tlbnMAAAAAAQAAAAAAAAACaWQAAAAAAAYAAAABAAAD6gAAABM=",
        "AAAAAAAAAAAAAAALc3BsaXRfY291bnQAAAAAAAAAAAEAAAAG",
        "AAAAAAAAAL5SZWdpc3RlcnMgYSBuZXcgc3BsaXQgYW5kIHJldHVybnMgaXRzIGlkLiBTaGFyZXMgYXJlIGJhc2lzIHBvaW50cwphbmQgbXVzdCBzdW0gdG8gZXhhY3RseSAxMF8wMDAuIFBhc3NpbmcgYSBjb250cm9sbGVyIG1ha2VzIHRoZQpzcGxpdCBtdXRhYmxlIGJ5IHRoYXQgYWRkcmVzczsgcGFzc2luZyBOb25lIGxvY2tzIGl0IGZvcmV2ZXIuAAAAAAAMY3JlYXRlX3NwbGl0AAAABAAAAAAAAAAHY3JlYXRvcgAAAAATAAAAAAAAAApyZWNpcGllbnRzAAAAAAPqAAAH0AAAAAlSZWNpcGllbnQAAAAAAAAAAAAABnNoYXJlcwAAAAAD6gAAAAQAAAAAAAAACmNvbnRyb2xsZXIAAAAAA+gAAAATAAAAAQAAA+kAAAAGAAAAAw==",
        "AAAAAAAAADZSZXBsYWNlcyB0aGUgcmVjaXBpZW50cyBhbmQgc2hhcmVzIG9mIGEgbXV0YWJsZSBzcGxpdC4AAAAAAAx1cGRhdGVfc3BsaXQAAAADAAAAAAAAAAJpZAAAAAAABgAAAAAAAAAKcmVjaXBpZW50cwAAAAAD6gAAB9AAAAAJUmVjaXBpZW50AAAAAAAAAAAAAAZzaGFyZXMAAAAAA+oAAAAEAAAAAQAAA+kAAAACAAAAAw==",
        "AAAAAAAAAXNQYXlzIHNldmVyYWwgc3BsaXRzIGZyb20gb25lIHNpZ25lciBpbiBhIHNpbmdsZSB0cmFuc2FjdGlvbiwgZWFjaAp3aXRoIGl0cyBvd24gdG9rZW4uIGBpZHNgLCBgYW1vdW50c2AsIGFuZCBgdG9rZW5zYCBwYWlyIHVwCnBvc2l0aW9uYWxseTsgYW55IGZhaWx1cmUgcmV2ZXJ0cyBhbGwuCgpgcmVmZXJlbmNlc2Agb3B0aW9uYWxseSB0YWdzIGVhY2ggc3BsaXQncyBwYXltZW50IGZvciByZWNvbmNpbGlhdGlvbgphbmQgcGFpcnMgdXAgcG9zaXRpb25hbGx5IHRvby4gQW4gZW1wdHkgYHJlZmVyZW5jZXNgIHZlYyBtZWFucyAibm8KcmVmZXJlbmNlIGZvciBhbnkgc3BsaXQiOyBvdGhlcndpc2UgaXQgbXVzdCBtYXRjaCBgaWRzLmxlbigpYCBleGFjdGx5LgAAAAAOcGF5X21hbnlfbXVsdGkAAAAAAAUAAAAAAAAABGZyb20AAAATAAAAAAAAAANpZHMAAAAD6gAAAAYAAAAAAAAAB2Ftb3VudHMAAAAD6gAAAAsAAAAAAAAABnRva2VucwAAAAAD6gAAABMAAAAAAAAACnJlZmVyZW5jZXMAAAAAA+oAAAPoAAAD7gAAACAAAAABAAAD6QAAAAIAAAAD",
        "AAAAAAAAAGZSZXR1cm5zIHRoZSBleGFjdCBwZXItcmVjaXBpZW50IGFtb3VudHMgYSBwYXltZW50IG9mIGBhbW91bnRgIHdvdWxkCnByb2R1Y2UsIHdpdGhvdXQgbW92aW5nIGFueSBmdW5kcy4AAAAAAA5wcmV2aWV3X3BheW91dAAAAAAAAgAAAAAAAAACaWQAAAAAAAYAAAAAAAAABmFtb3VudAAAAAAACwAAAAEAAAPpAAAD6gAAAAsAAAAD",
        "AAAAAAAAAAAAAAAPc3BsaXRzX29mX2NvdW50AAAAAAEAAAAAAAAAB2NyZWF0b3IAAAAAEwAAAAEAAAAE",
        "AAAAAAAAAAAAAAAPc3BsaXRzX29mX3BhZ2VkAAAAAAMAAAAAAAAAB2NyZWF0b3IAAAAAEwAAAAAAAAAFc3RhcnQAAAAAAAAEAAAAAAAAAAVsaW1pdAAAAAAAAAQAAAABAAAD6gAAAAY=",
        "AAAAAAAAAGlIYW5kcyBjb250cm9sIG9mIGEgbXV0YWJsZSBzcGxpdCB0byBhbm90aGVyIGFkZHJlc3MsIG9yIGxvY2tzIGl0CmZvcmV2ZXIgd2hlbiB0aGUgbmV3IGNvbnRyb2xsZXIgaXMgTm9uZS4AAAAAAAAQdHJhbnNmZXJfY29udHJvbAAAAAIAAAAAAAAAAmlkAAAAAAAGAAAAAAAAAA5uZXdfY29udHJvbGxlcgAAAAAD6AAAABMAAAABAAAD6QAAAAIAAAAD" ]),
      options
    )
  }
  public readonly fromJSON = {
    pay: this.txFromJSON<Result<void>>,
        balance: this.txFromJSON<i128>,
        deposit: this.txFromJSON<Result<void>>,
        pay_many: this.txFromJSON<Result<void>>,
        get_split: this.txFromJSON<Result<Split>>,
        splits_of: this.txFromJSON<Array<u64>>,
        distribute: this.txFromJSON<Result<i128>>,
        close_split: this.txFromJSON<Result<void>>,
        held_tokens: this.txFromJSON<Array<string>>,
        split_count: this.txFromJSON<u64>,
        create_split: this.txFromJSON<Result<u64>>,
        update_split: this.txFromJSON<Result<void>>,
        pay_many_multi: this.txFromJSON<Result<void>>,
        preview_payout: this.txFromJSON<Result<Array<i128>>>,
        splits_of_count: this.txFromJSON<u32>,
        splits_of_paged: this.txFromJSON<Array<u64>>,
        transfer_control: this.txFromJSON<Result<void>>
  }
}
/**
 * Polls for a transaction to be confirmed or fail, with a timeout.
 *
 * @param txHash - Hex-encoded hash of the transaction to wait for.
 * @param options - Optional configuration.
 * @param options.rpcUrl - RPC server URL. Defaults to Soroban testnet.
 * @param options.timeout - Max wait time in ms. Default 30_000.
 * @param options.pollInterval - Time between polls in ms. Default 1_000.
 * @returns The successful or failed transaction response.
 * @throws If the transaction is not confirmed within the timeout.
 */
export async function waitForConfirmation(
  txHash: string,
  options?: {
    rpcUrl?: string;
    timeout?: number;
    pollInterval?: number;
  },
): Promise<Api.GetSuccessfulTransactionResponse | Api.GetFailedTransactionResponse> {
  const rpcUrl = options?.rpcUrl ?? "https://soroban-testnet.stellar.org";
  const timeout = options?.timeout ?? 30_000;
  const pollInterval = options?.pollInterval ?? 1_000;
  const server = new RpcServer(rpcUrl);
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    const response = await server.getTransaction(txHash);
    if (response.status === Api.GetTransactionStatus.SUCCESS) {
      return response as Api.GetSuccessfulTransactionResponse;
    }
    if (response.status === Api.GetTransactionStatus.FAILED) {
      return response as Api.GetFailedTransactionResponse;
    }
    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }

  throw new Error(
    `Transaction ${txHash} was not confirmed within ${timeout / 1_000}s`,
  );
}
