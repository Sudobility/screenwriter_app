import { describe, expect, it, vi } from "vitest";
import type { DocumentSession } from "@sudobility/screenwriter_lib";
import { sessionToHost } from "../src/adapter/session-host";

function fakeSession() {
  const s = {
    model: { tag: "m1" },
    remoteCursors: new Map(),
    execute: vi.fn(() => ({ ok: true })),
    undo: vi.fn(() => true),
    redo: vi.fn(() => false),
    subscribe: vi.fn(() => () => {}),
    setLocalCursor: vi.fn(),
    noteCaret: vi.fn(),
    on: vi.fn(() => () => {}),
  };
  return s;
}

describe("sessionToHost", () => {
  it("forwards calls to the session", () => {
    const s = fakeSession();
    const host = sessionToHost(s as unknown as DocumentSession);
    host.execute([{ id: "text.insert", params: {} } as never], { kind: "local-typing", groupKey: "k" });
    expect(s.execute).toHaveBeenCalledWith([{ id: "text.insert", params: {} }], { kind: "local-typing", groupKey: "k" });
    expect(host.undo()).toBe(true);
    expect(host.redo()).toBe(false);
    host.setLocalCursor({ a: 1 });
    expect(s.setLocalCursor).toHaveBeenCalledWith({ a: 1 });
    host.noteCaret?.("el_1");
    expect(s.noteCaret).toHaveBeenCalledWith("el_1");
  });

  it("reads model and remoteCursors lazily, so a rebased session's new model is seen", () => {
    const s = fakeSession();
    const host = sessionToHost(s as unknown as DocumentSession);
    expect((host.model as unknown as { tag: string }).tag).toBe("m1");
    s.model = { tag: "m2" };
    expect((host.model as unknown as { tag: string }).tag).toBe("m2");
    const cursors = new Map([[1, { clientId: 1, user: null, cursor: null }]]);
    s.remoteCursors = cursors as never;
    expect(host.remoteCursors).toBe(cursors);
  });

  it("maps presence subscription and change subscription", () => {
    const s = fakeSession();
    const host = sessionToHost(s as unknown as DocumentSession);
    const fn = vi.fn();
    host.on?.("presence", fn);
    expect(s.on).toHaveBeenCalledWith("presence", fn);
    host.subscribe(fn);
    expect(s.subscribe).toHaveBeenCalledWith(fn);
  });
});
