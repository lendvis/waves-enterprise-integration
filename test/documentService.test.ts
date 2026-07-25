import {
  DemoSigner,
  DocumentService,
  NodeClient,
  SignedTx,
  ContractKeyValue,
  sha256Hex,
  txBytes,
  makeTransfer,
  signTx,
  base58Decode,
} from "../src";

/** In-memory node mock: applies CallContract params straight to contract state. */
class MockNode implements NodeClient {
  state = new Map<string, ContractKeyValue>();
  broadcasted: SignedTx[] = [];

  async broadcast(tx: SignedTx) {
    this.broadcasted.push(tx);
    if (tx.type === 104) {
      for (const p of tx.params) {
        this.state.set(`${tx.contractId}:${p.key}`, {
          key: p.key,
          type: p.type,
          value: String(p.value),
        });
      }
    }
    return { id: tx.id };
  }

  async getContractKey(contractId: string, key: string) {
    return this.state.get(`${contractId}:${key}`) ?? null;
  }
}

const CONTRACT_ID = "9sQkYcH6mAqXbGqcqXbGqcqXbGqcqXbGqcqXbGqcqXbG";

function setup() {
  const node = new MockNode();
  const signer = new DemoSigner();
  const service = new DocumentService(node, signer, CONTRACT_ID);
  return { node, signer, service };
}

describe("DocumentService", () => {
  test("registers a document and stores its record on chain", async () => {
    const { node, signer, service } = setup();
    const { record, txId } = await service.registerDocument("contract text v1", "contract.pdf");

    expect(record.hash).toBe(sha256Hex("contract text v1"));
    expect(record.owner).toBe(signer.publicKey());
    expect(txId).toBeTruthy();
    expect(node.broadcasted).toHaveLength(1);
    expect(node.broadcasted[0].type).toBe(104);
  });

  test("rejects duplicate registration", async () => {
    const { service } = setup();
    await service.registerDocument("same content", "a.pdf");
    await expect(service.registerDocument("same content", "b.pdf")).rejects.toThrow(
      /already registered/
    );
  });

  test("verifies registered content and detects tampering", async () => {
    const { service } = setup();
    await service.registerDocument("original", "doc.txt");

    const ok = await service.verifyDocument("original");
    expect(ok.registered).toBe(true);
    expect(ok.record!.name).toBe("doc.txt");

    const tampered = await service.verifyDocument("original + edit");
    expect(tampered.registered).toBe(false);
  });

  test("transfers ownership by current owner", async () => {
    const { service, signer } = setup();
    const { record } = await service.registerDocument("deed", "deed.pdf");

    const newOwner = new DemoSigner().publicKey();
    const { record: updated } = await service.transferOwnership(record.hash, newOwner);
    expect(updated.owner).toBe(newOwner);
    expect(updated.owner).not.toBe(signer.publicKey());

    const check = await service.verifyDocument("deed");
    expect(check.record!.owner).toBe(newOwner);
  });

  test("forbids transfer by non-owner", async () => {
    const { node, service } = setup();
    const { record } = await service.registerDocument("secret", "s.txt");

    const stranger = new DocumentService(node, new DemoSigner(), CONTRACT_ID);
    await expect(stranger.transferOwnership(record.hash, "whoever")).rejects.toThrow(
      /current owner/
    );
  });

  test("rejects transfer of unknown document", async () => {
    const { service } = setup();
    await expect(service.transferOwnership("deadbeef", "x")).rejects.toThrow(/not registered/);
  });
});

describe("transactions", () => {
  test("signed transfer tx carries a valid signature over canonical bytes", async () => {
    const signer = new DemoSigner();
    const tx = makeTransfer(signer.publicKey(), "3NBVqYXrapgJP9atQccdBPAgJPwHDKkh6A8", 500, {
      timestamp: 1700000000000,
    });
    const signed = await signTx(tx, signer);

    expect(signed.id).toBeTruthy();
    expect(signed.proofs).toHaveLength(1);
    expect(signer.verify(txBytes(tx), base58Decode(signed.proofs[0]))).toBe(true);
  });

  test("tx id is deterministic for identical transactions", async () => {
    const signer = new DemoSigner();
    const a = makeTransfer(signer.publicKey(), "addr", 10, { timestamp: 42 });
    const b = makeTransfer(signer.publicKey(), "addr", 10, { timestamp: 42 });
    expect((await signTx(a, signer)).id).toBe((await signTx(b, signer)).id);
  });

  test("rejects non-positive transfer amount", () => {
    expect(() => makeTransfer("pk", "addr", 0)).toThrow(/positive/);
  });
});
