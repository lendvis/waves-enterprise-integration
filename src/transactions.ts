import { createHash } from "node:crypto";
import { base58Encode } from "./base58";
import { Signer } from "./signer";

/** Docker contract data entry (Waves Enterprise DataEntry). */
export interface DataEntry {
  key: string;
  type: "string" | "integer" | "boolean" | "binary";
  value: string | number | boolean;
}

/** Transfer transaction (type 4). */
export interface TransferTx {
  type: 4;
  version: 2;
  senderPublicKey: string;
  recipient: string;
  amount: number;
  fee: number;
  assetId: string | null;
  attachment: string;
  timestamp: number;
}

/** CreateContract transaction (type 103) — deploys a Docker contract. */
export interface CreateContractTx {
  type: 103;
  version: 2;
  senderPublicKey: string;
  image: string;
  imageHash: string;
  contractName: string;
  params: DataEntry[];
  fee: number;
  timestamp: number;
}

/** CallContract transaction (type 104) — invokes a deployed contract. */
export interface CallContractTx {
  type: 104;
  version: 2;
  senderPublicKey: string;
  contractId: string;
  contractVersion: number;
  params: DataEntry[];
  fee: number;
  timestamp: number;
}

export type Tx = TransferTx | CreateContractTx | CallContractTx;

export type SignedTx<T extends Tx = Tx> = T & { id: string; proofs: string[] };

/**
 * Canonical bytes of a transaction: UTF-8 of JSON with sorted keys.
 * ponytail: real WE nodes verify signatures over binary tx serialization;
 * in production swap this for the official SDK's serializer.
 */
export function txBytes(tx: Tx): Uint8Array {
  const sorted = Object.fromEntries(
    Object.entries(tx).sort(([a], [b]) => a.localeCompare(b))
  );
  return Buffer.from(JSON.stringify(sorted), "utf8");
}

export function txId(tx: Tx): string {
  return base58Encode(createHash("sha256").update(txBytes(tx)).digest());
}

export async function signTx<T extends Tx>(tx: T, signer: Signer): Promise<SignedTx<T>> {
  const proof = await signer.sign(txBytes(tx));
  return { ...tx, id: txId(tx), proofs: [proof] };
}

export function makeTransfer(
  senderPublicKey: string,
  recipient: string,
  amount: number,
  opts: { fee?: number; attachment?: string; assetId?: string | null; timestamp?: number } = {}
): TransferTx {
  if (amount <= 0) throw new Error("amount must be positive");
  return {
    type: 4,
    version: 2,
    senderPublicKey,
    recipient,
    amount,
    fee: opts.fee ?? 100_000,
    assetId: opts.assetId ?? null,
    attachment: opts.attachment ?? "",
    timestamp: opts.timestamp ?? Date.now(),
  };
}

export function makeCreateContract(
  senderPublicKey: string,
  image: string,
  imageHash: string,
  contractName: string,
  params: DataEntry[] = [],
  opts: { fee?: number; timestamp?: number } = {}
): CreateContractTx {
  return {
    type: 103,
    version: 2,
    senderPublicKey,
    image,
    imageHash,
    contractName,
    params,
    fee: opts.fee ?? 1_000_000,
    timestamp: opts.timestamp ?? Date.now(),
  };
}

export function makeCallContract(
  senderPublicKey: string,
  contractId: string,
  params: DataEntry[],
  opts: { contractVersion?: number; fee?: number; timestamp?: number } = {}
): CallContractTx {
  if (params.length === 0) throw new Error("params must not be empty");
  return {
    type: 104,
    version: 2,
    senderPublicKey,
    contractId,
    contractVersion: opts.contractVersion ?? 1,
    params,
    fee: opts.fee ?? 100_000,
    timestamp: opts.timestamp ?? Date.now(),
  };
}
