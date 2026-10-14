import { describe, expect, it } from "vitest";
import type { ScriptEditorHost } from "@sudobility/writing_ui";
import { matchRanges } from "../src/util/find-replace";
import { compareOrder } from "../src/util/search/types";
import { createProviders, type FindNav } from "../src/util/search/providers";

const noopNav: FindNav = { showScript() {}, showEntity() {}, showStoryboard() {}, openTitlePanel() {} };

/** A minimal host: just the read model + an `execute` that records the commands it is handed. */
function fakeHost() {
  const calls: { id: string; params: unknown }[] = [];
  const elements = [{ id: "el1", text: { plain: "Bob runs.", embeds: [] as { at: number }[] } }];
  const entities = [
    { id: "ent1", kind: "character", name: "Bobby", aliases: [], description: { plain: "" }, attributes: { "character.skeleton": { age: "40", appearance: "a tall Bob" } }, fields: {} },
    { id: "loc1", kind: "location", name: "Lobby", aliases: [], description: { plain: "A grand bob of marble." }, attributes: {}, fields: {} },
  ];
  const titlePage = { fields: { title: { text: "Bob's Story" }, author: { text: "" }, basedOn: { text: "" }, contact: { text: "" }, draftDate: { text: "" }, copyright: { text: "" }, notes: { text: "" } } };
  const host = {
    model: {
      elements: () => elements,
      element: (id: string) => elements.find(e => e.id === id),
      indexOf: (id: string) => elements.findIndex(e => e.id === id),
      scenes: () => [],
      entities: () => entities,
      entity: (id: string) => entities.find(e => e.id === id),
      titlePage: () => titlePage,
    },
    execute: (cmds: { id: string; params: unknown }[]) => {
      calls.push(...cmds);
      return { ok: true as const, results: [], effects: { inserted: [], removed: [], changed: [], hashes: {} } };
    },
    subscribe: () => () => {},
  } as unknown as ScriptEditorHost;
  return { host, calls };
}

const opts = { caseSensitive: false, wholeWord: false };

describe("project search providers", () => {
  it("finds matches across every surface and orders them title page → script → entities", () => {
    const { host } = fakeHost();
    const hits = createProviders(host, noopNav)
      .flatMap(p => p.find("bob", opts))
      .sort((a, b) => compareOrder(a.order, b.order));
    expect(hits.map(h => h.surface)).toEqual([
      "Title page · Title",
      "Script",
      "Bobby · Name",
      "Bobby · Appearance",
      "Lobby · Description",
    ]);
    expect(hits.map(h => h.providerId)).toEqual(["titlePage", "script", "entity", "entity", "entity"]);
    // Characters expose their skeleton, not a plain description; locations expose a description.
    expect(hits.some(h => h.surface === "Bobby · Description")).toBe(false);
  });

  it("replaces an entity name through entity.update with the spliced text", () => {
    const { host, calls } = fakeHost();
    const entity = createProviders(host, noopNav).find(p => p.id === "entity")!;
    const nameHit = entity.find("bob", opts).find(h => h.surface === "Bobby · Name")!;
    expect(entity.replace(nameHit, "Rob")).toBe(true);
    expect(calls).toEqual([{ id: "entity.update", params: { entityId: "ent1", patch: { name: "Robby" } } }]);
  });

  it("replaces a script match through text.replaceRange over the matched offsets", () => {
    const { host, calls } = fakeHost();
    const script = createProviders(host, noopNav).find(p => p.id === "script")!;
    const hit = script.find("bob", opts)[0];
    expect(script.replace(hit, "Sue")).toBe(true);
    expect(calls).toEqual([
      { id: "text.replaceRange", params: { range: { anchor: { elementId: "el1", offset: 0 }, head: { elementId: "el1", offset: 3 } }, text: "Sue" } },
    ]);
  });

  it("replaces a title-page match through title.setField", () => {
    const { host, calls } = fakeHost();
    const title = createProviders(host, noopNav).find(p => p.id === "titlePage")!;
    const hit = title.find("bob", opts)[0];
    expect(title.replace(hit, "Rob")).toBe(true);
    expect(calls).toEqual([{ id: "title.setField", params: { field: "title", text: "Rob's Story" } }]);
  });
});

/** A richer host exercising the off-script surfaces: synopsis, aliases, visual-sheet appearance, captions. */
function richHost() {
  const calls: { id: string; params: unknown }[] = [];
  const scenes = [{ id: "sc1", synopsis: { plain: "Bob enters." }, headingText: "INT. HOUSE" }];
  const entities = [
    { id: "ent1", kind: "character", name: "Bobby", aliases: ["Bob the Great"], description: { plain: "" }, attributes: { "character.skeleton": {} }, fields: { characterSheet: { description: "a Bob in a hat", looksImageId: null, selectedLook: null, sheetImageId: null } } },
    { id: "w1", kind: "wardrobe", name: "Coat", aliases: [], description: { plain: "" }, attributes: {}, fields: { productionImages: [{ id: "img1", description: "a bob-tailed coat", styleId: "s1" }] } },
    { id: "story1", kind: "misc", name: "Story", aliases: [], description: { plain: "" }, attributes: { "story.reserved": true, "story.theme": "bob theme" }, fields: { storyboards: { sc1: [{ id: "sb1", description: "bob in frame" }] } } },
  ];
  const host = {
    model: {
      elements: () => [],
      element: () => undefined,
      indexOf: () => -1,
      scenes: () => scenes,
      entities: () => entities,
      entity: (id: string) => entities.find(e => e.id === id),
      titlePage: () => ({ fields: {} }),
    },
    execute: (cmds: { id: string; params: unknown }[]) => {
      calls.push(...cmds);
      return { ok: true as const, results: [], effects: { inserted: [], removed: [], changed: [], hashes: {} } };
    },
    subscribe: () => () => {},
  } as unknown as ScriptEditorHost;
  return { host, calls };
}

describe("project search providers — all surfaces", () => {
  it("finds every off-script surface", () => {
    const { host } = richHost();
    const surfaces = createProviders(host, noopNav)
      .flatMap(p => p.find("bob", opts))
      .map(h => h.surface)
      .sort();
    expect(surfaces).toEqual([
      "Bobby · Alias",
      "Bobby · Appearance",
      "Bobby · Name",
      "Coat · Image caption",
      "Story · Theme",
      "Storyboard caption",
      "Synopsis · INT. HOUSE",
    ]);
  });

  it("replaces an alias by removing the old and adding the spliced one", () => {
    const { host, calls } = richHost();
    const entity = createProviders(host, noopNav).find(p => p.id === "entity")!;
    const hit = entity.find("bob", opts).find(h => h.surface === "Bobby · Alias")!;
    expect(entity.replace(hit, "Rob")).toBe(true);
    expect(calls).toEqual([
      { id: "entity.removeAlias", params: { entityId: "ent1", alias: "Bob the Great" } },
      { id: "entity.addAlias", params: { entityId: "ent1", alias: "Rob the Great" } },
    ]);
  });

  it("replaces visual-sheet appearance, keeping the rest of the sheet state", () => {
    const { host, calls } = richHost();
    const entity = createProviders(host, noopNav).find(p => p.id === "entity")!;
    const hit = entity.find("bob", opts).find(h => h.surface === "Bobby · Appearance")!;
    expect(entity.replace(hit, "Rob")).toBe(true);
    expect(calls).toEqual([
      { id: "entity.update", params: { entityId: "ent1", patch: { fields: { characterSheet: { description: "a Rob in a hat", looksImageId: null, selectedLook: null, sheetImageId: null } } } } },
    ]);
  });

  it("replaces a production-image caption inside the images array", () => {
    const { host, calls } = richHost();
    const entity = createProviders(host, noopNav).find(p => p.id === "entity")!;
    const hit = entity.find("bob", opts).find(h => h.surface === "Coat · Image caption")!;
    expect(entity.replace(hit, "Rob")).toBe(true);
    expect(calls).toEqual([
      { id: "entity.update", params: { entityId: "w1", patch: { fields: { productionImages: [{ id: "img1", description: "a Rob-tailed coat", styleId: "s1" }] } } } },
    ]);
  });

  it("replaces a storyboard caption inside the per-scene array on the story entity", () => {
    const { host, calls } = richHost();
    const entity = createProviders(host, noopNav).find(p => p.id === "entity")!;
    const hit = entity.find("bob", opts).find(h => h.surface === "Storyboard caption")!;
    expect(entity.replace(hit, "Rob")).toBe(true);
    expect(calls).toEqual([
      { id: "entity.update", params: { entityId: "story1", patch: { fields: { storyboards: { sc1: [{ id: "sb1", description: "Rob in frame" }] } } } } },
    ]);
  });
});

describe("matchRanges", () => {
  it("honours case sensitivity and whole-word", () => {
    expect(matchRanges("Bob and bob", "bob", { caseSensitive: false, wholeWord: false })).toEqual([{ start: 0, end: 3 }, { start: 8, end: 11 }]);
    expect(matchRanges("Bob and bob", "bob", { caseSensitive: true, wholeWord: false })).toEqual([{ start: 8, end: 11 }]);
    expect(matchRanges("bobby bob", "bob", { caseSensitive: false, wholeWord: true })).toEqual([{ start: 6, end: 9 }]);
  });
});

describe("compareOrder", () => {
  it("compares global order vectors lexicographically, shorter-first on a shared prefix", () => {
    expect(compareOrder([0, 1], [0, 2])).toBeLessThan(0);
    expect(compareOrder([2, 0, 14], [2, 1, 5])).toBeLessThan(0);
    expect(compareOrder([1], [1, 0])).toBeLessThan(0);
    expect(compareOrder([1, 5], [1, 5])).toBe(0);
  });
});
