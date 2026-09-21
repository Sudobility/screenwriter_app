import type { OfflineDocRecord, OfflineDocStore } from "@sudobility/screenwriter_lib";

const STORE = "docs";

/**
 * `OfflineDocStore` over IndexedDB (raw API): one record `{epoch, state}` per key. The lib also stores
 * preserved "lost edits" copies under `<docId>#lost@...` keys, so keys are opaque strings.
 */
export class IndexedDbOfflineDocStore implements OfflineDocStore {
  private dbPromise: Promise<IDBDatabase> | null = null;

  constructor(
    private readonly dbName = "screenwriter-offline",
    private readonly factory: IDBFactory = indexedDB
  ) {}

  private db(): Promise<IDBDatabase> {
    this.dbPromise ??= new Promise<IDBDatabase>((resolve, reject) => {
      const req = this.factory.open(this.dbName, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error("IndexedDB open failed"));
    });
    return this.dbPromise;
  }

  private async run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await this.db();
    return new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      let result: T;
      req.onsuccess = () => {
        result = req.result;
      };
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error ?? req.error);
      tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"));
    });
  }

  async load(documentId: string): Promise<OfflineDocRecord | null> {
    const r = await this.run<OfflineDocRecord | undefined>("readonly", s => s.get(documentId));
    return r ? { epoch: r.epoch, state: new Uint8Array(r.state) } : null;
  }

  async save(documentId: string, record: OfflineDocRecord): Promise<void> {
    await this.run("readwrite", s => s.put({ epoch: record.epoch, state: record.state.slice() }, documentId));
  }

  async delete(documentId: string): Promise<void> {
    await this.run("readwrite", s => s.delete(documentId));
  }
}
