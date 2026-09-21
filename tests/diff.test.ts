// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { diffWords } from "../src/util/diff";

const rebuild = (parts: ReturnType<typeof diffWords>, keep: "del" | "add") =>
  parts.filter(p => p.op === "same" || p.op === keep).map(p => p.text).join("");

describe("diffWords", () => {
  it("marks only the changed words and reconstructs both sides", () => {
    const before = "It should not be running.";
    const after = "It really should not still be running.";
    const parts = diffWords(before, after);
    expect(rebuild(parts, "del")).toBe(before);
    expect(rebuild(parts, "add")).toBe(after);
    expect(parts.filter(p => p.op === "add").map(p => p.text.trim())).toEqual(expect.arrayContaining(["really"]));
    expect(parts.some(p => p.op === "del")).toBe(false);
  });

  it("handles identical, empty and fully replaced text", () => {
    expect(diffWords("same", "same")).toEqual([{ op: "same", text: "same" }]);
    expect(diffWords("", "new")).toEqual([{ op: "add", text: "new" }]);
    const parts = diffWords("alpha beta", "gamma");
    expect(rebuild(parts, "del")).toBe("alpha beta");
    expect(rebuild(parts, "add")).toBe("gamma");
  });

  it("renders into the DOM as del/add marks (jsdom)", () => {
    const div = document.createElement("div");
    for (const p of diffWords("keep old words", "keep new words")) {
      const el = document.createElement(p.op === "same" ? "span" : p.op === "del" ? "del" : "ins");
      el.textContent = p.text;
      div.append(el);
    }
    expect(div.querySelector("del")?.textContent).toBe("old");
    expect(div.querySelector("ins")?.textContent).toBe("new");
  });
});
