import { describe, expect, it } from "vitest";
import { commandHarness } from "../../writing_core/src/commands/test-harness";
import type { ScriptEditorHost } from "@sudobility/writing_ui";
import { insertRows, pastedRows, scriptRows } from "../src/util/ai-script";
import { getOwnSkeleton, getStages } from "../src/util/character-skeleton";
import { fromPasteEvent, htmlToStructuredText, pickClipboardText, tidyPlainText } from "../src/util/clipboard-text";
import { ageKey, applyCharacters, applyPlots, findCharacter, planCharacters, planPlots } from "../src/util/smart-paste";
import { ensureStoryEntity, findStoryEntity, getPlotMain, getSubplots, getTheme, setPlotMain, setSubplotField, setTheme, addSubplot } from "../src/util/story-info";

/** A real headless document behind the `ScriptEditorHost` shape (no session, no network). */
function makeHost(rows: [string, string][] = []) {
  const h = commandHarness();
  if (rows.length) h.replaceBody(rows);
  const host = {
    get model() {
      return h.model;
    },
    execute: (cmds: readonly { id: string; params: unknown }[]) => {
      let last: ReturnType<typeof h.run> | undefined;
      for (const c of cmds) {
        last = h.run(c.id, c.params);
        if (!last.ok) return last;
      }
      return last!;
    },
    undo: () => false,
    redo: () => false,
    subscribe: () => () => {},
    remoteCursors: new Map(),
    setLocalCursor: () => {},
  } as unknown as ScriptEditorHost;
  return { h, host };
}

const LAB: [string, string][] = [
  ["st_scene_heading", "INT. LAB - DAY"],
  ["st_action", "Dust floats in the light."],
  ["st_character", "VOSS"],
  ["st_dialogue", "It should not be running."],
  ["st_scene_heading", "EXT. ROOF - NIGHT"],
  ["st_action", "Voss climbs out into the wind."],
];
const texts = (h: ReturnType<typeof makeHost>["h"]) => h.body().map(e => e.text);
const character = (host: ScriptEditorHost, name: string) => host.model.entities({ kind: "character" }).find(e => e.name === name)!;

describe("clipboard text", () => {
  it("keeps paragraphs, line breaks, headings, lists, and whole-paragraph bold and centring", () => {
    const html = `<html><head><style>p{color:red}</style></head><body><!--StartFragment-->
      <h1>Characters</h1>
      <p>Rain hammers   the glass.<br>TOMAS winds the
         mechanism.</p>
      <p align="center"><b>TOMAS</b></p>
      <p style="text-align: center">It has outlasted better storms.</p>
      <ul><li>first</li><li>second <b>bold</b> word</li></ul>
      <p>Half <strong>bold</strong> stays plain.</p><!--EndFragment--></body></html>`;
    expect(htmlToStructuredText(html)).toBe(
      [
        "# Characters",
        "Rain hammers the glass.\nTOMAS winds the mechanism.",
        "[center] **TOMAS**",
        "[center] It has outlasted better storms.",
        "- first",
        "- second bold word",
        "Half bold stays plain.",
      ].join("\n\n")
    );
  });

  it("Google Docs' font-weight:normal wrapper is not bold; a bold span is", () => {
    const html = `<b style="font-weight:normal;" id="docs-internal-guid-1"><p><span style="font-weight:400">Plain line.</span></p><p><span style="font-weight:700">VOSS</span></p></b>`;
    expect(htmlToStructuredText(html)).toBe("Plain line.\n\n**VOSS**");
  });

  it("prefers the styled flavour, falls back to plain, and tidies plain text", () => {
    expect(pickClipboardText("<p>One</p><p>Two</p>", "One Two")).toEqual({ text: "One\n\nTwo", styled: true });
    expect(pickClipboardText("<p> </p>", "Only plain\r\n\r\n\r\n\r\nhere  ")).toEqual({ text: "Only plain\n\nhere", styled: false });
    expect(pickClipboardText(null, null)).toEqual({ text: "", styled: false });
    expect(tidyPlainText("a  \r\nb\n\n\n\nc")).toBe("a\nb\n\nc");
    const data = { getData: (t: string) => (t === "text/html" ? "" : "from a paste") } as unknown as DataTransfer;
    expect(fromPasteEvent(data)).toEqual({ text: "from a paste", styled: false });
  });
});

describe("characters", () => {
  it("creates a new character with its skeleton and aliases; several ages become life stages", () => {
    const { host } = makeHost(LAB);
    const pasted = [
      { name: "Mara Lind", aliases: ["Mouse"], stages: [{ age: "34", health: "tired" }] },
      { name: "Tom", aliases: [], stages: [{ age: "12", health: "frail" }, { age: "61" }] },
    ];
    expect(planCharacters(host, pasted).map(p => [p.name, p.entityId, p.changes, p.stages.map(s => s.kind)])).toEqual([
      ["Mara Lind", null, true, ["new"]],
      ["Tom", null, true, ["new", "new"]],
    ]);
    const r = applyCharacters(host, pasted);
    expect(r.created).toEqual(["Mara Lind", "Tom"]);
    const mara = character(host, "Mara Lind");
    expect(getOwnSkeleton(mara)).toEqual({ age: "34", health: "tired" });
    expect(mara.aliases).toEqual(["Mouse"]);
    expect(getStages(mara)).toEqual([]);
    expect(getStages(character(host, "Tom")).map(s => s.skeleton)).toEqual([{ age: "12", health: "frail" }, { age: "61" }]);
    expect(r.firstEntityId).toBe(String(mara.id));
  });

  it("an existing character keeps what the writer wrote: only blanks are filled", () => {
    const { h, host } = makeHost(LAB);
    h.run("entity.rebuild", {});
    const voss = character(host, "VOSS");
    h.run("entity.update", { entityId: voss.id, patch: { attributes: { "character.skeleton": { age: "52", health: "mine" } } } });
    const pasted = [{ name: "Voss", aliases: ["The Doctor"], stages: [{ age: "50", health: "theirs", secret: "she falsified a result" }] }];

    const [plan] = planCharacters(host, pasted);
    expect(plan).toMatchObject({ entityId: String(voss.id), existingName: "VOSS", newAliases: ["The Doctor"], changes: true });
    expect(plan!.stages).toEqual([{ age: "52", kind: "fill", filled: ["secret"] }]);
    // planning changed nothing
    expect(getOwnSkeleton(character(host, "VOSS"))).toEqual({ age: "52", health: "mine" });

    const r = applyCharacters(host, pasted);
    expect(r).toMatchObject({ created: [], updated: ["VOSS"] });
    expect(getOwnSkeleton(character(host, "VOSS"))).toEqual({ age: "52", health: "mine", secret: "she falsified a result" });
    expect(character(host, "VOSS").aliases).toEqual(["The Doctor"]);
    expect(host.model.entities({ kind: "character" }).filter(e => /voss/i.test(e.name))).toHaveLength(1);

    // pasting the same again finds nothing to do
    expect(planCharacters(host, pasted)[0]!.changes).toBe(false);
    expect(applyCharacters(host, pasted)).toMatchObject({ updated: [], unchanged: ["VOSS"] });
  });

  it("matches by alias, and the pasted name becomes an alias of the existing character", () => {
    const { h, host } = makeHost();
    h.run("entity.create", { kind: "character", name: "Tomas Varga", aliases: ["Old Tom"] });
    expect(findCharacter(host, { name: "old tom", aliases: [] })?.name).toBe("Tomas Varga");
    const [plan] = planCharacters(host, [{ name: "Keeper", aliases: ["Old  Tom"], stages: [{ age: "61" }] }]);
    expect(plan).toMatchObject({ existingName: "Tomas Varga", newAliases: ["Keeper"] });
  });

  it("several ages onto an un-staged character: what was written becomes a stage, matched by age", () => {
    const { h, host } = makeHost();
    h.run("entity.create", { kind: "character", name: "Tom", attributes: { "character.skeleton": { age: "61 years old", money: "poor" } } });
    const pasted = [{ name: "Tom", aliases: [], stages: [{ age: "12", health: "frail" }, { age: "61", money: "rich", health: "bad knee" }] }];
    expect(planCharacters(host, pasted)[0]!.stages).toEqual([
      { age: "12", kind: "new", filled: ["age", "health"] },
      { age: "61 years old", kind: "fill", filled: ["health"] },
    ]);
    applyCharacters(host, pasted);
    const tom = character(host, "Tom");
    expect(getOwnSkeleton(tom)).toEqual({});
    expect(getStages(tom).map(s => s.skeleton)).toEqual([
      { age: "61 years old", money: "poor", health: "bad knee" },
      { age: "12", health: "frail" },
    ]);
  });

  it("a staged character: the matching age is filled, an unknown age is added; ids of existing stages are kept", () => {
    const { h, host } = makeHost();
    h.run("entity.create", {
      kind: "character",
      name: "Tom",
      attributes: { "character.stages": [{ id: "stg_a", skeleton: { age: "12" } }, { id: "stg_b", skeleton: { age: "61", money: "poor" } }] },
    });
    applyCharacters(host, [{ name: "Tom", aliases: [], stages: [{ age: "about 61", money: "rich", secret: "the door" }, { age: "30", health: "strong" }] }]);
    const stages = getStages(character(host, "Tom"));
    expect(stages.map(s => s.skeleton)).toEqual([{ age: "12" }, { age: "61", money: "poor", secret: "the door" }, { age: "30", health: "strong" }]);
    expect(stages.slice(0, 2).map(s => s.id)).toEqual(["stg_a", "stg_b"]);
  });

  it("an un-staged character with an empty skeleton takes the first pasted age instead of gaining a blank stage", () => {
    const { h, host } = makeHost(LAB);
    h.run("entity.rebuild", {});
    applyCharacters(host, [{ name: "VOSS", aliases: [], stages: [{ age: "20" }, { age: "52" }] }]);
    expect(getStages(character(host, "VOSS")).map(s => s.skeleton)).toEqual([{ age: "20" }, { age: "52" }]);
  });

  it("ageKey compares the number, or the words when there is none", () => {
    expect(ageKey("61 years old")).toBe(ageKey("about 61"));
    expect(ageKey("Early Thirties")).toBe("early thirties");
    expect(ageKey(undefined)).toBe("");
  });
});

describe("plots", () => {
  const PASTED = { mainPlot: "A keeper finds a door.", subplots: [{ name: "The Debt", text: "Ilse owes money." }, { name: "The priest", text: "He writes letters." }] };

  it("fills an empty story: main plot and subplots; theme is not touched", () => {
    const { host } = makeHost();
    expect(planPlots(host, PASTED).map(c => [c.name, c.kind])).toEqual([
      ["Main plot", "fill"],
      ["The Debt", "new"],
      ["The priest", "new"],
    ]);
    expect(findStoryEntity(host)).toBeNull(); // planning creates nothing
    applyPlots(host, PASTED);
    const story = findStoryEntity(host)!;
    expect(getPlotMain(story)).toBe("A keeper finds a door.");
    expect(getSubplots(story).map(s => [s.name, s.text])).toEqual([
      ["The Debt", "Ilse owes money."],
      ["The priest", "He writes letters."],
    ]);
    expect(getTheme(story)).toBe("");
    expect(host.model.entities({ kind: "misc" })).toHaveLength(1);
  });

  it("keeps the writer's main plot and written subplots; fills a named but empty subplot; adds new ones", () => {
    const { host } = makeHost();
    ensureStoryEntity(host);
    setTheme(host, findStoryEntity(host)!, "Grief");
    setPlotMain(host, findStoryEntity(host)!, "Mine.");
    const a = addSubplot(host, findStoryEntity(host)!);
    setSubplotField(host, findStoryEntity(host)!, a, { name: "the debt", text: "" });
    const b = addSubplot(host, findStoryEntity(host)!);
    setSubplotField(host, findStoryEntity(host)!, b, { name: "The Priest", text: "My own words." });

    const changes = applyPlots(host, { ...PASTED, subplots: [...PASTED.subplots, { name: "The storm", text: "It comes." }] });
    expect(changes.map(c => [c.name, c.kind])).toEqual([
      ["Main plot", "kept"],
      ["the debt", "fill"],
      ["The Priest", "kept"],
      ["The storm", "new"],
    ]);
    const story = findStoryEntity(host)!;
    expect(getPlotMain(story)).toBe("Mine.");
    expect(getTheme(story)).toBe("Grief");
    expect(getSubplots(story).map(s => [s.id === a || s.id === b, s.name, s.text])).toEqual([
      [true, "the debt", "Ilse owes money."],
      [true, "The Priest", "My own words."],
      [false, "The storm", "It comes."],
    ]);
  });

  it("nothing found changes nothing", () => {
    const { host } = makeHost();
    expect(applyPlots(host, { subplots: [] })).toEqual([]);
    expect(getSubplots(findStoryEntity(host)!)).toEqual([]);
  });
});

describe("script rows", () => {
  const SCENES = [
    { heading: null, elements: [{ type: "action" as const, text: "He waits." }] },
    { heading: "INT. CELLAR - NIGHT", elements: [{ type: "character" as const, text: "VOSS" }, { type: "dialogue" as const, text: "Who is there?" }] },
  ];

  it("a null heading contributes no heading row; a generated script formats its structured headings", () => {
    expect(pastedRows(SCENES)).toEqual([
      { role: "action", text: "He waits." },
      { role: "sceneHeading", text: "INT. CELLAR - NIGHT" },
      { role: "character", text: "VOSS" },
      { role: "dialogue", text: "Who is there?" },
    ]);
    expect(scriptRows({ title: null, scenes: [{ heading: { setting: "ext", location: "roof", time: "night" }, elements: [{ type: "action", text: "Wind." }] }] })).toEqual([
      { role: "sceneHeading", text: "EXT. ROOF - NIGHT" },
      { role: "action", text: "Wind." },
    ]);
  });

  it("inserts after the current scene, so the scene is not split and the next one follows", () => {
    const { h, host } = makeHost(LAB);
    const first = String(host.model.scenes()[0]!.id);
    const r = insertRows(host, pastedRows(SCENES), first);
    expect(r).toMatchObject({ written: 4, skipped: 0 });
    expect(texts(h)).toEqual([
      "INT. LAB - DAY",
      "Dust floats in the light.",
      "VOSS",
      "It should not be running.",
      "He waits.",
      "INT. CELLAR - NIGHT",
      "VOSS",
      "Who is there?",
      "EXT. ROOF - NIGHT",
      "Voss climbs out into the wind.",
    ]);
    expect(h.body().find(e => e.id === r.firstId)?.text).toBe("He waits.");
    expect(h.body().slice(4, 8).map(e => e.style)).toEqual(["st_action", "st_scene_heading", "st_character", "st_dialogue"]);
  });

  it("with no scene (or one that is gone) the rows go to the end; a new document's starter is reused", () => {
    const { h, host } = makeHost(LAB);
    insertRows(host, [{ role: "action", text: "The end." }], "el_gone");
    expect(texts(h).at(-1)).toBe("The end.");
    insertRows(host, [{ role: "action", text: "After the end." }]);
    expect(texts(h).at(-1)).toBe("After the end.");

    const blank = makeHost();
    const n = blank.h.body().length;
    const r = insertRows(blank.host, pastedRows(SCENES.slice(1)), null);
    expect(r.written).toBe(3);
    expect(texts(blank.h)).toEqual(["INT. CELLAR - NIGHT", "VOSS", "Who is there?"]);
    expect(n).toBe(1);
  });
});
