import { createHash } from "node:crypto";
import { NodeClient } from "./nodeClient";
import { Signer } from "./signer";
import { makeCallContract, makeCreateContract, signTx } from "./transactions";

export interface DocumentRecord {
  hash: string;
  name: string;
  owner: string;
  registeredAt: number;
}

export interface VerifyResult {
  registered: boolean;
  record?: DocumentRecord;
}

const KEY_PREFIX = "doc_";

export function sha256Hex(content: Buffer | string): string {
  return createHash("sha256").update(content).digest("hex");
}

/**
 * Business layer: document registry on top of a Waves Enterprise
 * Docker contract. Contract state is a key-value store:
 *   doc_<sha256hex> -> JSON DocumentRecord
 */
export class DocumentService {
  constructor(
    private readonly node: NodeClient,
    private readonly signer: Signer,
    private readonly contractId: string
  ) {}

  /** Deploy the registry contract. Returns the tx id (= future contractId). */
  static async deployRegistry(
    node: NodeClient,
    signer: Signer,
    image = "registry.example.com/doc-registry:1.0",
    imageHash = ""
  ): Promise<string> {
    const tx = await signTx(
      makeCreateContract(signer.publicKey(), image, imageHash, "document-registry"),
      signer
    );
    const { id } = await node.broadcast(tx);
    return id;
  }

  /** Register document content on chain. Returns the record and tx id. */
  async registerDocument(
    content: Buffer | string,
    name: string
  ): Promise<{ record: DocumentRecord; txId: string }> {
    const hash = sha256Hex(content);
    const existing = await this.node.getContractKey(this.contractId, KEY_PREFIX + hash);
    if (existing) {
      throw new Error(`Document already registered: ${hash}`);
    }
    const record: DocumentRecord = {
      hash,
      name,
      owner: this.signer.publicKey(),
      registeredAt: Date.now(),
    };
    const txId = await this.call(record);
    return { record, txId };
  }

  /** Check whether content is registered and unmodified. */
  async verifyDocument(content: Buffer | string): Promise<VerifyResult> {
    const hash = sha256Hex(content);
    const entry = await this.node.getContractKey(this.contractId, KEY_PREFIX + hash);
    if (!entry) return { registered: false };
    return { registered: true, record: JSON.parse(entry.value) as DocumentRecord };
  }

  /** Transfer ownership of a registered document. Only the current owner can. */
  async transferOwnership(hash: string, newOwner: string): Promise<{ record: DocumentRecord; txId: string }> {
    const entry = await this.node.getContractKey(this.contractId, KEY_PREFIX + hash);
    if (!entry) throw new Error(`Document not registered: ${hash}`);
    const record = JSON.parse(entry.value) as DocumentRecord;
    if (record.owner !== this.signer.publicKey()) {
      throw new Error("Only the current owner can transfer the document");
    }
    const updated: DocumentRecord = { ...record, owner: newOwner };
    const txId = await this.call(updated);
    return { record: updated, txId };
  }

  private async call(record: DocumentRecord): Promise<string> {
    const tx = await signTx(
      makeCallContract(this.signer.publicKey(), this.contractId, [
        { key: KEY_PREFIX + record.hash, type: "string", value: JSON.stringify(record) },
      ]),
      this.signer
    );
    const { id } = await this.node.broadcast(tx);
    return id;
  }
}
