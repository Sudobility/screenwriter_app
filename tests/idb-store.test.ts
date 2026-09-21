import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";
import { IndexedDbOfflineDocStore } from "../src/offline/idb-store";

describe("IndexedDbOfflineDocStore", () => {
  it("round-trips a record and returns null for a missing key", async () => {
    const store = new IndexedDbOfflineDocStore("t1", new IDBFactory());
    expect(await store.load("doc_a")).toBeNull();
    await store.save("doc_a", { epoch: 2, state: new Uint8Array([1, 2, 3]) });
    const r = await store.load("doc_a");
    expect(r?.epoch).toBe(2);
    expect([...(r?.state ?? [])]).toEqual([1, 2, 3]);
    expect(r?.state).toBeInstanceOf(Uint8Array);
  });

  it("overwrites, deletes, and survives a reopen of the same database", async () => {
    const factory = new IDBFactory();
    const a = new IndexedDbOfflineDocStore("t2", factory);
    await a.save("doc_a", { epoch: 0, state: new Uint8Array([9]) });
    await a.save("doc_a", { epoch: 1, state: new Uint8Array([7, 7]) });
    const b = new IndexedDbOfflineDocStore("t2", factory); // a new instance = a new page load
    expect((await b.load("doc_a"))?.epoch).toBe(1);
    await b.save("doc_a#lost@1@5", { epoch: 0, state: new Uint8Array([1]) });
    await b.delete("doc_a");
    expect(await b.load("doc_a")).toBeNull();
    expect(await b.load("doc_a#lost@1@5")).not.toBeNull();
  });
});
