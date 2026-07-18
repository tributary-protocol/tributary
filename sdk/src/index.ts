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
export * from "./shares.js";

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
  1: {message:"NoRecipients"},
  2: {message:"LengthMismatch"},
  3: {message:"ZeroShare"},
  4: {message:"BadShareTotal"},
  5: {message:"SplitNotFound"},
  6: {message:"SplitImmutable"},
  7: {message:"InvalidAmount"},
  8: {message:"NothingToDistribute"},
  9: {message:"TooManyRecipients"},
  10: {message:"BadChildSplit"},
  11: {message:"ArithmeticOverflow"},
  12: {message:"SplitHasBalance"},
  13: {message:"NoPendingTransfer"},
}

export function decode(code: number): string | undefined {
  return (Errors as Record<number, { message: string }>)[code]?.message;
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
  pay: ({from, id, token, amount}: {from: string, id: u64, token: string, amount: i128}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a balance transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  balance: ({id, token}: {id: u64, token: string}, options?: MethodOptions) => Promise<AssembledTransaction<i128>>

  /**
   * Construct and simulate a deposit transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Moves funds into the contract and credits them to the split without
   * paying anyone yet. Useful when money arrives before a distribution
   * should happen.
   */
  deposit: ({from, id, token, amount}: {from: string, id: u64, token: string, amount: i128}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a pay_many transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Pays several splits from one signer in a single transaction.
   * `ids` and `amounts` pair up positionally; any failure reverts all.
   */
  pay_many: ({from, ids, amounts, token}: {from: string, ids: Array<u64>, amounts: Array<i128>, token: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

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
   * Construct and simulate a preview_payout transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Returns the exact per-recipient amounts a payment of `amount` would
   * produce, without moving any funds.
   */
  preview_payout: ({id, amount}: {id: u64, amount: i128}, options?: MethodOptions) => Promise<AssembledTransaction<Result<Array<i128>>>>

  /**
   * Construct and simulate a transfer_control transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Proposes transferring control to a new address (two-step), or locks the
   * split forever when `new_controller` is `None`.
   */
  transfer_control: ({id, new_controller}: {id: u64, new_controller: Option<string>}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a accept_control transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Accepts a pending control transfer. Only the proposed controller may
   * call this, after which they become the split's controller.
   */
  accept_control: ({id}: {id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a cancel_transfer transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Cancels a pending control transfer. Only the current controller may
   * call this. Does nothing if no transfer is pending.
   */
  cancel_transfer: ({id}: {id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

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
   * Construct and simulate a pending_controller transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  pending_controller: ({id}: {id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<Option<string>>>
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
      new ContractSpec([ "AAAABAAAAAAAAAAAAAAABUVycm9yAAAAAAAADQAAAAAAAAAMTm9SZWNpcGllbnRzAAAAAQAAAAAAAAAOTGVuZ3RoTWlzbWF0Y2gAAAAAAAIAAAAAAAAACVplcm9TaGFyZQAAAAAAAAMAAAAAAAAADUJhZFNoYXJlVG90YWwAAAAAAAAEAAAAAAAAAA1TcGxpdE5vdEZvdW5kAAAAAAAABQAAAAAAAAAOU3BsaXRJbW11dGFibGUAAAAAAAYAAAAAAAAADUludmFsaWRBbW91bnQAAAAAAAAHAAAAAAAAABNOb3RoaW5nVG9EaXN0cmlidXRlAAAAAAgAAAAAAAAAEVRvb01hbnlSZWNpcGllbnRzAAAAAAAACQAAAAAAAAANQmFkQ2hpbGRTcGxpdAAAAAAAAAoAAADUQW4gYXJpdGhtZXRpYyBwYXRoIHByb2R1Y2VkIGEgdmFsdWUgdGhhdCBkb2VzIG5vdCBmaXQgdGhlIGkxMjggdGhlCmNvbnRyYWN0IHN0b3Jlcy4gQ2FuIG9ubHkgaGFwcGVuIGlmIGEgc2hhcmUgZXhjZWVkcyBUT1RBTF9TSEFSRVMsIHdoaWNoCmB2YWxpZGF0ZWAgZm9yYmlkcywgYnV0IHdlIHN1cmZhY2UgaXQgYXMgYSB0eXBlZCBlcnJvciByYXRoZXIgdGhhbiBwYW5pYy4AAAASQXJpdGhtZXRpY092ZXJmbG93AAAAAAALAAAAAAAAAA9TcGxpdEhhc0JhbGFuY2UAAAAADAAAAEFDYWxsaW5nIGBhY2NlcHRfY29udHJvbGAgb24gYSBzcGxpdCB0aGF0IGhhcyBubyBwZW5kaW5nIHRyYW5zZmVyLgAAAAAAABFOb1BlbmRpbmdUcmFuc2ZlcgAAAAAAAA0=",
        "AAAAAQAAAAAAAAAAAAAABVNwbGl0AAAAAAAAAwAAAAAAAAAKY29udHJvbGxlcgAAAAAD6AAAABMAAAAAAAAACnJlY2lwaWVudHMAAAAAA+oAAAfQAAAACVJlY2lwaWVudAAAAAAAAAAAAAAGc2hhcmVzAAAAAAPqAAAABA==",
        "AAAAAgAAAAAAAAAAAAAACVJlY2lwaWVudAAAAAAAAAIAAAABAAAAAAAAAAdBY2NvdW50AAAAAAEAAAATAAAAAQAAAAAAAAAFU3BsaXQAAAAAAAABAAAABg==",
        "AAAABQAAAAAAAAAAAAAACURlcG9zaXRlZAAAAAAAAAEAAAAJZGVwb3NpdGVkAAAAAAAAAwAAAAAAAAACaWQAAAAAAAYAAAABAAAAAAAAAAV0b2tlbgAAAAAAABMAAAAAAAAAAAAAAAZhbW91bnQAAAAAAAsAAAAAAAAAAg==",
        "AAAABQAAAAAAAAAAAAAACVNwbGl0UGFpZAAAAAAAAAEAAAAKc3BsaXRfcGFpZAAAAAAAAwAAAAAAAAACaWQAAAAAAAYAAAABAAAAAAAAAAV0b2tlbgAAAAAAABMAAAAAAAAAAAAAAAZhbW91bnQAAAAAAAsAAAAAAAAAAg==",
        "AAAABQAAAAAAAAAAAAAAC0Rpc3RyaWJ1dGVkAAAAAAEAAAALZGlzdHJpYnV0ZWQAAAAAAwAAAAAAAAACaWQAAAAAAAYAAAABAAAAAAAAAAV0b2tlbgAAAAAAABMAAAAAAAAAAAAAAAZhbW91bnQAAAAAAAsAAAAAAAAAAg==",
        "AAAABQAAAAAAAAAAAAAAC1NwbGl0Q2xvc2VkAAAAAAEAAAAMc3BsaXRfY2xvc2VkAAAAAQAAAAAAAAACaWQAAAAAAAYAAAABAAAAAg==",
        "AAAABQAAAAAAAAAAAAAADFNwbGl0Q3JlYXRlZAAAAAEAAAANc3BsaXRfY3JlYXRlZAAAAAAAAAIAAAAAAAAAAmlkAAAAAAAGAAAAAQAAAAAAAAAHY3JlYXRvcgAAAAATAAAAAAAAAAI=",
        "AAAABQAAAAAAAAAAAAAADFNwbGl0VXBkYXRlZAAAAAEAAAANc3BsaXRfdXBkYXRlZAAAAAAAAAEAAAAAAAAAAmlkAAAAAAAGAAAAAQAAAAI=",
        "AAAABQAAAAAAAAAAAAAAEkNvbnRyb2xUcmFuc2ZlcnJlZAAAAAAAAQAAABNjb250cm9sX3RyYW5zZmVycmVkAAAAAAIAAAAAAAAAAmlkAAAAAAAGAAAAAQAAAAAAAAAObmV3X2NvbnRyb2xsZXIAAAAAA+gAAAATAAAAAAAAAAI=",
        "AAAABQAAAAAAAAAAAAAAF0NvbnRyb2xUcmFuc2ZlclByb3Bvc2VkAAAAAAEAAAAZY29udHJvbF90cmFuc2Zlcl9wcm9wb3NlZAAAAAAAAAIAAAAAAAAAAmlkAAAAAAAGAAAAAQAAAAAAAAAObmV3X2NvbnRyb2xsZXIAAAAAABMAAAAAAAAAAg==",
        "AAAAAAAAAH9Nb3ZlcyBgYW1vdW50YCBvZiBgdG9rZW5gIGZyb20gdGhlIHBheWVyIHRvIGV2ZXJ5IHJlY2lwaWVudCBvZiB0aGUKc3BsaXQgaW4gb25lIGNhbGwuIFJvdW5kaW5nIGR1c3QgZ29lcyB0byB0aGUgbGFzdCByZWNpcGllbnQuAAAAAANwYXkAAAAABAAAAAAAAAAEZnJvbQAAABMAAAAAAAAAAmlkAAAAAAAGAAAAAAAAAAV0b2tlbgAAAAAAABMAAAAAAAAABmFtb3VudAAAAAAACwAAAAEAAAPpAAAAAgAAAAM=",
        "AAAAAAAAAAAAAAAHYmFsYW5jZQAAAAACAAAAAAAAAAJpZAAAAAAABgAAAAAAAAAFdG9rZW4AAAAAAAATAAAAAQAAAAs=",
        "AAAAAAAAAVBNb3ZlcyBmdW5kcyBpbnRvIHRoZSBjb250cmFjdCBhbmQgY3JlZGl0cyB0aGVtIHRvIHRoZSBzcGxpdCB3aXRob3V0CnBheWluZyBhbnlvbmUgeWV0LiBVc2VmdWwgd2hlbiBtb25leSBhcnJpdmVzIGJlZm9yZSBhIGRpc3RyaWJ1dGlvbgpzaG91bGQgaGFwcGVuLgoKQ3JlZGl0cyB0aGUgYW1vdW50IHRoZSB2YXVsdCdzIGJhbGFuY2UgYWN0dWFsbHkgaW5jcmVhc2VkIGJ5IHJhdGhlcgp0aGFuIHRoZSByZXF1ZXN0ZWQgYGFtb3VudGAsIHNvIGZlZS1vbi10cmFuc2ZlciB0b2tlbnMgdGhhdCBkZWxpdmVyCmxlc3MgdGhhbiByZXF1ZXN0ZWQgY2Fubm90IG92ZXItY3JlZGl0IHRoZSBzcGxpdC4AAAAHZGVwb3NpdAAAAAAEAAAAAAAAAARmcm9tAAAAEwAAAAAAAAACaWQAAAAAAAYAAAAAAAAABXRva2VuAAAAAAAAEwAAAAAAAAAGYW1vdW50AAAAAAALAAAAAQAAA+kAAAACAAAAAw==",
        "AAAAAAAAAH9QYXlzIHNldmVyYWwgc3BsaXRzIGZyb20gb25lIHNpZ25lciBpbiBhIHNpbmdsZSB0cmFuc2FjdGlvbi4KYGlkc2AgYW5kIGBhbW91bnRzYCBwYWlyIHVwIHBvc2l0aW9uYWxseTsgYW55IGZhaWx1cmUgcmV2ZXJ0cyBhbGwuAAAAAAhwYXlfbWFueQAAAAQAAAAAAAAABGZyb20AAAATAAAAAAAAAANpZHMAAAAD6gAAAAYAAAAAAAAAB2Ftb3VudHMAAAAD6gAAAAsAAAAAAAAABXRva2VuAAAAAAAAEwAAAAEAAAPpAAAAAgAAAAM=",
        "AAAAAAAAAAAAAAAJZ2V0X3NwbGl0AAAAAAAAAQAAAAAAAAACaWQAAAAAAAYAAAABAAAD6QAAB9AAAAAFU3BsaXQAAAAAAAAD",
        "AAAAAAAAAAAAAAAJc3BsaXRzX29mAAAAAAAAAQAAAAAAAAAHY3JlYXRvcgAAAAATAAAAAQAAA+oAAAAG",
        "AAAAAAAAAH5QYXlzIG91dCBldmVyeXRoaW5nIGNyZWRpdGVkIHRvIHRoZSBzcGxpdCBmb3IgdGhlIGdpdmVuIHRva2VuLgpBbnlvbmUgY2FuIGNhbGwgdGhpczsgdGhlIHJvdXRpbmcgdGFibGUgZGVjaWRlcyB3aGVyZSBmdW5kcyBnby4AAAAAAApkaXN0cmlidXRlAAAAAAACAAAAAAAAAAJpZAAAAAAABgAAAAAAAAAFdG9rZW4AAAAAAAATAAAAAQAAA+kAAAALAAAAAw==",
        "AAAAAAAAAHJDbG9zZXMgYSBzcGxpdCBhbmQgcmVjbGFpbXMgaXRzIHN0b3JhZ2UuIE9ubHkgdGhlIGNvbnRyb2xsZXIgY2FuIGRvIHRoaXMsCmFuZCBvbmx5IGlmIHRoZSBzcGxpdCBob2xkcyBubyBiYWxhbmNlcy4AAAAAAAtjbG9zZV9zcGxpdAAAAAABAAAAAAAAAAJpZAAAAAAABgAAAAEAAAPpAAAAAgAAAAM=",
        "AAAAAAAAAAAAAAALaGVsZF90b2tlbnMAAAAAAQAAAAAAAAACaWQAAAAAAAYAAAABAAAD6gAAABM=",
        "AAAAAAAAAAAAAAALc3BsaXRfY291bnQAAAAAAAAAAAEAAAAG",
        "AAAAAAAAAL5SZWdpc3RlcnMgYSBuZXcgc3BsaXQgYW5kIHJldHVybnMgaXRzIGlkLiBTaGFyZXMgYXJlIGJhc2lzIHBvaW50cwphbmQgbXVzdCBzdW0gdG8gZXhhY3RseSAxMF8wMDAuIFBhc3NpbmcgYSBjb250cm9sbGVyIG1ha2VzIHRoZQpzcGxpdCBtdXRhYmxlIGJ5IHRoYXQgYWRkcmVzczsgcGFzc2luZyBOb25lIGxvY2tzIGl0IGZvcmV2ZXIuAAAAAAAMY3JlYXRlX3NwbGl0AAAABAAAAAAAAAAHY3JlYXRvcgAAAAATAAAAAAAAAApyZWNpcGllbnRzAAAAAAPqAAAH0AAAAAlSZWNpcGllbnQAAAAAAAAAAAAABnNoYXJlcwAAAAAD6gAAAAQAAAAAAAAACmNvbnRyb2xsZXIAAAAAA+gAAAATAAAAAQAAA+kAAAAGAAAAAw==",
        "AAAAAAAAADZSZXBsYWNlcyB0aGUgcmVjaXBpZW50cyBhbmQgc2hhcmVzIG9mIGEgbXV0YWJsZSBzcGxpdC4AAAAAAAx1cGRhdGVfc3BsaXQAAAADAAAAAAAAAAJpZAAAAAAABgAAAAAAAAAKcmVjaXBpZW50cwAAAAAD6gAAB9AAAAAJUmVjaXBpZW50AAAAAAAAAAAAAAZzaGFyZXMAAAAAA+oAAAAEAAAAAQAAA+kAAAACAAAAAw==",
        "AAAAAAAAAH9BY2NlcHRzIGEgcGVuZGluZyBjb250cm9sIHRyYW5zZmVyLiBPbmx5IHRoZSBwcm9wb3NlZCBjb250cm9sbGVyIG1heQpjYWxsIHRoaXMsIGFmdGVyIHdoaWNoIHRoZXkgYmVjb21lIHRoZSBzcGxpdCdzIGNvbnRyb2xsZXIuAAAAAA5hY2NlcHRfY29udHJvbAAAAAAAAQAAAAAAAAACaWQAAAAAAAYAAAABAAAD6QAAAAIAAAAD",
        "AAAAAAAAAGZSZXR1cm5zIHRoZSBleGFjdCBwZXItcmVjaXBpZW50IGFtb3VudHMgYSBwYXltZW50IG9mIGBhbW91bnRgIHdvdWxkCnByb2R1Y2UsIHdpdGhvdXQgbW92aW5nIGFueSBmdW5kcy4AAAAAAA5wcmV2aWV3X3BheW91dAAAAAAAAgAAAAAAAAACaWQAAAAAAAYAAAAAAAAABmFtb3VudAAAAAAACwAAAAEAAAPpAAAD6gAAAAsAAAAD",
        "AAAAAAAAAHZDYW5jZWxzIGEgcGVuZGluZyBjb250cm9sIHRyYW5zZmVyLiBPbmx5IHRoZSBjdXJyZW50IGNvbnRyb2xsZXIgbWF5CmNhbGwgdGhpcy4gRG9lcyBub3RoaW5nIGlmIG5vIHRyYW5zZmVyIGlzIHBlbmRpbmcuAAAAAAAPY2FuY2VsX3RyYW5zZmVyAAAAAAEAAAAAAAAAAmlkAAAAAAAGAAAAAQAAA+kAAAACAAAAAw==",
        "AAAAAAAAAYFQcm9wb3NlcyB0cmFuc2ZlcnJpbmcgY29udHJvbCB0byBhIG5ldyBhZGRyZXNzICh0d28tc3RlcCksIG9yIGxvY2tzIHRoZQpzcGxpdCBmb3JldmVyIHdoZW4gYG5ld19jb250cm9sbGVyYCBpcyBgTm9uZWAuCgpXaGVuIGBTb21lKGFkZHIpYCwgYSBwZW5kaW5nIGNvbnRyb2xsZXIgaXMgcmVjb3JkZWQgYW5kIGBhY2NlcHRfY29udHJvbGAKbXVzdCBiZSBjYWxsZWQgYnkgdGhhdCBhZGRyZXNzIHRvIGZpbmFsaXNlIHRoZSBoYW5kb3Zlci4gVGhlIGN1cnJlbnQKY29udHJvbGxlciBjYW4gY2FuY2VsIHRoZSBwcm9wb3NhbCB3aXRoIGBjYW5jZWxfdHJhbnNmZXJgLgoKV2hlbiBgTm9uZWAsIGNvbnRyb2wgaXMgcmVub3VuY2VkIGltbWVkaWF0ZWx5IGFuZCBpcnJldmVyc2libHkuAAAAAAAAEHRyYW5zZmVyX2NvbnRyb2wAAAACAAAAAAAAAAJpZAAAAAAABgAAAAAAAAAObmV3X2NvbnRyb2xsZXIAAAAAA+gAAAATAAAAAQAAA+kAAAACAAAAAw==",
        "AAAAAAAAAAAAAAAScGVuZGluZ19jb250cm9sbGVyAAAAAAABAAAAAAAAAAJpZAAAAAAABgAAAAEAAAPoAAAAEw==" ]),
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
        accept_control: this.txFromJSON<Result<void>>,
        preview_payout: this.txFromJSON<Result<Array<i128>>>,
        cancel_transfer: this.txFromJSON<Result<void>>,
        transfer_control: this.txFromJSON<Result<void>>,
        pending_controller: this.txFromJSON<Option<string>>
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