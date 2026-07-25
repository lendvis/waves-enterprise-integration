import { createPrivateKey, createPublicKey, generateKeyPairSync, KeyObject, sign, verify } from "node:crypto";
import { base58Encode } from "./base58";

/**
 * Abstraction over transaction signing.
 *
 * In production this interface is implemented on top of the official
 * Waves Enterprise SDK (@wavesenterprise/signature-generator), which uses
 * Curve25519 and the exact binary serialization expected by the node.
 * DemoSigner below is a self-contained stand-in for local development
 * and unit tests.
 */
export interface Signer {
  /** Base58-encoded public key of the account. */
  publicKey(): string;
  /** Sign arbitrary bytes, return base58-encoded signature. */
  sign(bytes: Uint8Array): Promise<string>;
}

export class DemoSigner implements Signer {
  private readonly priv: KeyObject;
  private readonly pub: KeyObject;
  private readonly pubBase58: string;

  constructor() {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    this.priv = privateKey;
    this.pub = publicKey;
    // raw 32-byte public key = last 32 bytes of the SPKI DER encoding
    const der = publicKey.export({ type: "spki", format: "der" });
    this.pubBase58 = base58Encode(der.subarray(der.length - 32));
  }

  publicKey(): string {
    return this.pubBase58;
  }

  async sign(bytes: Uint8Array): Promise<string> {
    return base58Encode(sign(null, bytes, this.priv));
  }

  /** Verify a raw (non-base58) signature. Used in tests. */
  verify(bytes: Uint8Array, signature: Uint8Array): boolean {
    return verify(null, bytes, this.pub, signature);
  }
}
