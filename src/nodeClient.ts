import { SignedTx } from "./transactions";

export interface BroadcastResult {
  id: string;
}

export interface ContractKeyValue {
  key: string;
  type: string;
  value: string;
}

/**
 * Minimal Waves Enterprise node REST client surface used by the business layer.
 * Tests provide an in-memory mock; HttpNodeClient talks to a real node.
 */
export interface NodeClient {
  broadcast(tx: SignedTx): Promise<BroadcastResult>;
  /** Read one key from a Docker contract state; null if absent. */
  getContractKey(contractId: string, key: string): Promise<ContractKeyValue | null>;
}

export class HttpNodeClient implements NodeClient {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey?: string
  ) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { "Content-Type": "application/json" };
    if (this.apiKey) h["X-API-Key"] = this.apiKey;
    return h;
  }

  async broadcast(tx: SignedTx): Promise<BroadcastResult> {
    const res = await fetch(`${this.baseUrl}/transactions/broadcast`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(tx),
    });
    if (!res.ok) {
      throw new Error(`Broadcast failed: HTTP ${res.status} ${await res.text()}`);
    }
    return (await res.json()) as BroadcastResult;
  }

  async getContractKey(contractId: string, key: string): Promise<ContractKeyValue | null> {
    const res = await fetch(
      `${this.baseUrl}/contracts/${contractId}/${encodeURIComponent(key)}`,
      { headers: this.headers() }
    );
    if (res.status === 404) return null;
    if (!res.ok) {
      throw new Error(`Contract key read failed: HTTP ${res.status}`);
    }
    return (await res.json()) as ContractKeyValue;
  }
}
