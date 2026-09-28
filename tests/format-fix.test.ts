import { describe, expect, it } from "vitest";
import { commandHarness } from "../../writing_core/src/commands/test-harness";
import type { ScriptEditorHost } from "@sudobility/writing_ui";
import { describeFix, findFormatIssues, fixFormatting, removeElement, shownText } from "../src/util/format-fix";
import { applyFix, fixEdits, noteFixContext } from "../src/util/note-fix";
import { addNote, isNote, listNotes, nextNoteTitle } from "../src/util/notes";
import { DEFAULT_PRINT_FONT, hasParagraphs, printableFor, renderPrintDoc, scriptFont } from "../src/util/print-item";
import { ensureStoryEntity, findStoryEntity, setPlotMain, setSynopsis, setTheme, addSubplot, setSubplotField } from "../src/util/story-info";
import { checkSceneReview } from "../src/util/review-scope";
import { insertTechnique, placeholdersIn, techniqueById, TECHNIQUES } from "../src/util/techniques";

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
const rows = (h: ReturnType<typeof makeHost>["h"]) => h.body().map(e => [e.style, e.text]);

const MESSY: [string, string][] = [
  ["st_scene_heading", "int. St. Brigid's church - next to the confession booth"],
  ["st_action", "  Xavier waits. "],
  ["st_action", ""],
  ["st_character", "Xavier Wilsh"],
  ["st_dialogue", "Bless me, Father."],
  ["st_character", "KING"],
  ["st_dialogue", "   "],
  ["st_dialogue", "Go on."],
  ["st_transition", "cut to:"],
  ["st_scene_heading", "EXT. STREET - NIGHT"],
  ["st_action", "Rain."],
];

describe("formatting", () => {
  it("finds what the writer cannot see: stored case, empty lines, stray spaces", () => {
    const { h, host } = makeHost(MESSY);
    const ids = h.body().map(e => e.id);
    const issues = findFormatIssues(host);
    expect(issues.caseIds).toEqual([ids[0], ids[3], ids[8]]);
    expect(issues.emptyIds).toEqual([ids[2], ids[6]]);
    expect(issues.spaceIds).toEqual([ids[1]]);
    expect(issues.total).toBe(6);
    expect(shownText(host, ids[3]!)).toBe("XAVIER WILSH");
    expect(shownText(host, ids[4]!)).toBe("Bless me, Father.");
  });

  it("fixes all of it in one go and leaves everything else as it was", () => {
    const { h, host } = makeHost(MESSY);
    const kept = h.body().filter(e => e.text.trim()).map(e => e.id);
    const r = fixFormatting(host);
    expect(r).toEqual({ cased: 3, removed: 2, tidied: 1 });
    expect(describeFix(r)).toBe("3 headings or cues put in capitals, 2 empty lines removed, 1 line trimmed.");
    expect(rows(h)).toEqual([
      ["st_scene_heading", "INT. ST. BRIGID'S CHURCH - NEXT TO THE CONFESSION BOOTH"],
      ["st_action", "Xavier waits."],
      ["st_character", "XAVIER WILSH"],
      ["st_dialogue", "Bless me, Father."],
      ["st_character", "KING"],
      ["st_dialogue", "Go on."],
      ["st_transition", "CUT TO:"],
      ["st_scene_heading", "EXT. STREET - NIGHT"],
      ["st_action", "Rain."],
    ]);
    expect(h.body().map(e => e.id)).toEqual(kept); // the same elements, not new ones
    expect(findFormatIssues(host).total).toBe(0);
    expect(describeFix(fixFormatting(host))).toBe("Nothing to fix.");
  });

  it("an empty scene heading is not removed; a new, empty document is left alone", () => {
    const { host } = makeHost([
      ["st_scene_heading", ""],
      ["st_action", "Rain."],
    ]);
    expect(findFormatIssues(host).total).toBe(0);
    expect(findFormatIssues(makeHost().host).total).toBe(0);
  });

  it("removes an empty first element: the next one keeps its text and its style", () => {
    const { h, host } = makeHost([
      ["st_action", ""],
      ["st_character", "VOSS"],
      ["st_dialogue", "Hello."],
    ]);
    expect(fixFormatting(host).removed).toBe(1);
    expect(rows(h)).toEqual([
      ["st_character", "VOSS"],
      ["st_dialogue", "Hello."],
    ]);
  });

  it("removeElement refuses the only element", () => {
    const { h, host } = makeHost();
    expect(removeElement(host, h.body()[0]!.id)).toBe(false);
  });
});

describe("fixes for a review note", () => {
  const SCENE: [string, string][] = [
    ["st_scene_heading", "int. office - day"],
    ["st_action", "Charlotte puts a photograph on the desk."],
    ["st_character", "adam"],
    ["st_dialogue", "You think his wife is cheating on him."],
    ["st_action", ""],
    ["st_character", "CHARLOTTE"],
    ["st_dialogue", "He has been dead for eleven years."],
    ["st_scene_heading", "EXT. STREET - NIGHT"],
    ["st_action", "Rain."],
  ];
  const note = (h: ReturnType<typeof makeHost>["h"], elementId?: string) => ({
    title: "Confusing beat",
    body: "Adam's first line muddies the premise.",
    category: "clarity" as const,
    anchors: [{ sceneId: h.body()[0]!.id, ...(elementId ? { elementId } : {}), contentHash: "v1:x" }],
  });

  it("sends the scene as the writer sees it, with ids, without its heading or empty lines", () => {
    const { h, host } = makeHost(SCENE);
    const ids = h.body().map(e => e.id);
    const ctx = noteFixContext(host, note(h, ids[3]))!;
    expect(ctx.request.scene.heading).toBe("INT. OFFICE - DAY");
    expect(ctx.request.scene.elements).toEqual([
      { id: ids[1], type: "action", text: "Charlotte puts a photograph on the desk." },
      { id: ids[2], type: "character", text: "ADAM" },
      { id: ids[3], type: "dialogue", text: "You think his wife is cheating on him." },
      { id: ids[5], type: "character", text: "CHARLOTTE" },
      { id: ids[6], type: "dialogue", text: "He has been dead for eleven years." },
    ]);
    expect(ctx.request.focusIds).toEqual([ids[3]]);
    expect(ctx.request.note).toEqual({ title: "Confusing beat", body: "Adam's first line muddies the premise.", category: "clarity" });
  });

  it("no scene, no context", () => {
    const { h, host } = makeHost(SCENE);
    expect(noteFixContext(host, { ...note(h), anchors: [] })).toBeNull();
    expect(noteFixContext(host, { ...note(h), anchors: [] }, h.body()[0]!.id)).not.toBeNull();
    expect(noteFixContext(host, { ...note(h), anchors: [{ sceneId: "el_gone", contentHash: "" }] })).toBeNull();
  });

  it("accepting a rewrite replaces the line; accepting a cut removes the line and its cue", () => {
    const a = makeHost(SCENE);
    const ids = a.h.body().map(e => e.id);
    const ctx = noteFixContext(a.host, note(a.h))!;
    const rewrite = { summary: "s", edits: [{ id: ids[3]!, text: "Who is he?" }] };
    expect(fixEdits(ctx, rewrite)).toEqual([{ id: ids[3], type: "dialogue", before: "You think his wife is cheating on him.", after: "Who is he?" }]);
    expect(applyFix(a.host, ctx, rewrite)).toEqual({ applied: 1, stale: 0, firstId: ids[3] });
    expect(a.h.body()[3]!.text).toBe("Who is he?");

    const b = makeHost(SCENE);
    const idsB = b.h.body().map(e => e.id);
    const cut = { summary: "s", edits: [{ id: idsB[3]!, text: null }, { id: idsB[2]!, text: null }] };
    const r = applyFix(b.host, noteFixContext(b.host, note(b.h))!, cut);
    expect(r.applied).toBe(2);
    expect(rows(b.h).slice(0, 4)).toEqual([
      ["st_scene_heading", "int. office - day"],
      ["st_action", "Charlotte puts a photograph on the desk."],
      ["st_action", ""],
      ["st_character", "CHARLOTTE"],
    ]);
  });

  it("a fix is refused as a whole when one of its lines changed since", () => {
    const { h, host } = makeHost(SCENE);
    const ids = h.body().map(e => e.id);
    const ctx = noteFixContext(host, note(h))!;
    const range = { anchor: { elementId: ids[6]!, offset: 0 }, head: { elementId: ids[6]!, offset: 2 } };
    h.run("text.replaceRange", { range, text: "She" });
    const fix = { summary: "s", edits: [{ id: ids[3]!, text: "Who is he?" }, { id: ids[6]!, text: "Dead. Eleven years." }] };
    expect(applyFix(host, ctx, fix)).toEqual({ applied: 0, stale: 1, firstId: null });
    expect(h.body()[3]!.text).toBe("You think his wife is cheating on him.");
  });
});

describe("script techniques", () => {
  const BASE: [string, string][] = [
    ["st_scene_heading", "INT. OFFICE - DAY"],
    ["st_action", "Adam waits."],
    ["st_scene_heading", "EXT. STREET - NIGHT"],
    ["st_action", "Rain."],
  ];

  it("every technique has a name, a use, blanks to fill in, and well-formed speeches", () => {
    expect(new Set(TECHNIQUES.map(t => t.id)).size).toBe(TECHNIQUES.length);
    for (const t of TECHNIQUES) {
      expect(t.label && t.about).toBeTruthy();
      expect(t.rows.flatMap(r => placeholdersIn(r.text)).length).toBeGreaterThan(0);
      t.rows.forEach((r, i) => {
        if (r.role === "dialogue" || r.role === "parenthetical") expect(["character", "parenthetical", "dialogue"]).toContain(t.rows[i - 1]?.role);
        if (r.role === "character") expect(["parenthetical", "dialogue"]).toContain(t.rows[i + 1]?.role);
      });
    }
    expect(placeholdersIn("-- [PLACE] -- [What we see.]")).toEqual(["[PLACE]", "[What we see.]"]);
  });

  it("goes in after the line at the caret, each part in its own type", () => {
    const { h, host } = makeHost(BASE);
    const r = insertTechnique(host, techniqueById("montage")!, h.body()[1]!.id);
    expect(r).toMatchObject({ written: 5, skipped: 0 });
    expect(rows(h)).toEqual([
      ["st_scene_heading", "INT. OFFICE - DAY"],
      ["st_action", "Adam waits."],
      ["st_shot", "MONTAGE - [WHAT IT SHOWS]"],
      ["st_action", "-- [PLACE] -- [What we see.]"],
      ["st_action", "-- [PLACE] -- [What we see.]"],
      ["st_action", "-- [PLACE] -- [What we see.]"],
      ["st_shot", "END MONTAGE"],
      ["st_scene_heading", "EXT. STREET - NIGHT"],
      ["st_action", "Rain."],
    ]);
    expect(h.body().find(e => e.id === r.firstId)?.text).toBe("MONTAGE - [WHAT IT SHOWS]");
    // a montage is not a scene: the script still has its two
    expect(host.model.scenes()).toHaveLength(2);
  });

  it("replaces an empty line at the caret; without a caret it goes to the end", () => {
    const { h, host } = makeHost([...BASE.slice(0, 2), ["st_action", ""], ...BASE.slice(2)]);
    insertTechnique(host, techniqueById("phone-one")!, h.body()[2]!.id);
    expect(rows(h).slice(1, 5)).toEqual([
      ["st_action", "Adam waits."],
      ["st_action", "[CHARACTER] answers the phone."],
      ["st_character", "[CHARACTER]"],
      ["st_parenthetical", "(into phone)"],
    ]);
    expect(rows(h).some(r => r[1] === "")).toBe(false);
    insertTechnique(host, techniqueById("time-lapse")!);
    expect(rows(h).at(-1)).toEqual(["st_shot", "END TIME LAPSE"]);
  });

  it("a technique with scene headings adds scenes", () => {
    const { h, host } = makeHost(BASE);
    insertTechnique(host, techniqueById("intercut")!, h.body()[1]!.id);
    expect(host.model.scenes().map(s => s.headingText)).toEqual([
      "INT. OFFICE - DAY",
      "INT. [PLACE ONE] - [DAY/NIGHT]",
      "INT. [PLACE TWO] - [DAY/NIGHT]",
      "EXT. STREET - NIGHT",
    ]);
  });
});

describe("reviewing one scene", () => {
  const scenes = [
    { id: "a", heading: "INT. A" },
    { id: "b", heading: "INT. B" },
    { id: "c", heading: "INT. C" },
  ];
  const sum = (sceneId: string, source: "review" | "synopsis" | null, current = true) => ({ sceneId, number: null, heading: "", source, current, summary: source ? "x" : null });

  it("needs a summary of every scene before it, and of none after it", () => {
    expect(checkSceneReview(scenes, "c", [sum("a", "review"), sum("b", null), sum("c", null)])).toEqual({
      allowed: false,
      before: 2,
      missing: [{ sceneId: "b", heading: "INT. B", position: 2 }],
      outdated: 0,
    });
    expect(checkSceneReview(scenes, "b", [sum("a", "synopsis"), sum("b", null), sum("c", null)]).allowed).toBe(true);
    expect(checkSceneReview(scenes, "a", []).allowed).toBe(true); // the first scene has nothing before it
  });

  it("a scene the server does not know yet has no summary; an outdated summary still counts", () => {
    expect(checkSceneReview(scenes, "c", [sum("a", "review")]).missing.map(m => m.sceneId)).toEqual(["b"]);
    expect(checkSceneReview(scenes, "c", [sum("a", "review", false), sum("b", "review")])).toMatchObject({ allowed: true, outdated: 1 });
  });

  it("not before the summaries are loaded, and not without a scene", () => {
    expect(checkSceneReview(scenes, "b", null).allowed).toBe(false);
    expect(checkSceneReview(scenes, null, [sum("a", "review")]).allowed).toBe(false);
    expect(checkSceneReview(scenes, "gone", [sum("a", "review")]).allowed).toBe(false);
  });
});

describe("notes", () => {
  it("are kept as marked misc entities, with titles that do not collide", () => {
    const { h, host } = makeHost();
    h.run("entity.create", { kind: "misc", name: "Note 1" }); // a real misc entity that happens to have the name
    const a = addNote(host)!;
    const b = addNote(host)!;
    expect(listNotes(host).map(n => n.name)).toEqual(["Note 2", "Note 3"]);
    expect(a).not.toBe(b);
    expect(nextNoteTitle(host)).toBe("Note 4");
    expect(host.model.entities({ kind: "misc" }).filter(e => !isNote(e)).map(e => e.name)).toEqual(["Note 1"]);
    expect(addNote(host, "Research: lighthouses")).toBeTruthy();
    expect(addNote(host, "Research: lighthouses")).toBeNull(); // a title that is taken
  });
});

describe("printing a Catalog item", () => {
  const COURIER = { family: '"Courier Prime", "Courier New", Courier, monospace', sizePt: 12 };

  it("is set in the script's own font, whatever the template's is", () => {
    const { h, host } = makeHost([["st_action", "Rain."]]);
    expect(scriptFont(host)).toEqual(COURIER);
    expect(DEFAULT_PRINT_FONT).toEqual(COURIER);
    const id = addNote(host, "Research")!;
    h.run("entity.update", { entityId: id, patch: { description: "Lamps." } });
    const el = renderPrintDoc(printableFor(host, id, null)!);
    expect(el.style.fontFamily).toContain("Courier Prime");
    expect(el.style.fontSize).toBe("12pt");
    // nothing inside it names another font
    expect([...el.querySelectorAll<HTMLElement>("*")].every(n => !n.style.fontFamily)).toBe(true);
    // a script set in something else prints its items in that
    const other = renderPrintDoc({ ...printableFor(host, id, null)!, font: { family: "Arial, Helvetica, sans-serif", sizePt: 11 } });
    expect(other.style.fontFamily).toBe("Arial, Helvetica, sans-serif");
    expect(other.style.fontSize).toBe("11pt");
  });

  const texts = (el: HTMLElement) => [...el.querySelectorAll("h1, h2, p")].map(n => `${n.tagName.toLowerCase()}: ${n.textContent}`);

  it("a note: its title and its text, paragraph by paragraph; nothing to print while it is empty", () => {
    const { h, host } = makeHost();
    const id = addNote(host, "Research")!;
    expect(printableFor(host, id, null)).toBeNull();
    h.run("entity.update", { entityId: id, patch: { description: "Lamps burned colza oil.\n\nKeepers worked in pairs.\nAlways." } });
    const doc = printableFor(host, id, null, "The Door")!;
    expect(doc).toEqual({ title: "Research", subtitle: "Note · The Door", sections: [{ text: "Lamps burned colza oil.\n\nKeepers worked in pairs.\nAlways." }], font: COURIER });
    expect(texts(renderPrintDoc(doc))).toEqual(["h1: Research", "p: Note · The Door", "p: Lamps burned colza oil.", "p: Keepers worked in pairs.\nAlways."]);
  });

  it("what the writer typed is text, never markup", () => {
    const { h, host } = makeHost();
    const id = addNote(host, "<b>Bold</b>")!;
    h.run("entity.update", { entityId: id, patch: { description: '<img src=x onerror="alert(1)">' } });
    const el = renderPrintDoc(printableFor(host, id, null)!);
    expect(el.querySelector("img, b")).toBeNull();
    expect(el.textContent).toContain('<img src=x onerror="alert(1)">');
  });

  it("a description, with the kind it belongs to", () => {
    const { h, host } = makeHost();
    h.run("entity.create", { kind: "prop", name: "Lantern" });
    const prop = host.model.entities({ kind: "prop" })[0]!;
    expect(printableFor(host, prop.id, null)).toBeNull();
    h.run("entity.update", { entityId: prop.id, patch: { description: "Brass, dented." } });
    expect(printableFor(host, prop.id, null)).toEqual({ title: "Lantern", subtitle: "Prop", sections: [{ heading: "Description", text: "Brass, dented." }], font: COURIER });
  });

  it("a character: short fields as facts, paragraphs under their own heading; life stages one after another", () => {
    const { h, host } = makeHost();
    h.run("entity.create", { kind: "character", name: "Tomas", aliases: ["Old Tom"], attributes: { "character.skeleton": { age: "61", health: "bad knee", appearance: "Broad, slow-moving.\nGrey beard.", secret: "" } } });
    const tom = host.model.entities({ kind: "character" })[0]!;
    expect(printableFor(host, tom.id, null)).toEqual({
      title: "Tomas",
      subtitle: "Character",
      sections: [
        { facts: [{ label: "Also known as", value: "Old Tom" }] },
        { heading: "Physical", facts: [{ label: "Age", value: "61" }, { label: "Health", value: "bad knee" }] },
        { heading: "Appearance", text: "Broad, slow-moving.\nGrey beard." },
      ],
      font: COURIER,
    });
    h.run("entity.update", { entityId: tom.id, patch: { attributes: { "character.skeleton": null, "character.stages": [{ id: "s1", skeleton: { age: "12" } }, { id: "s2", skeleton: { age: "61", ambitions: "To keep the lamp lit." } }] } } });
    expect(printableFor(host, tom.id, null)!.sections.map(s => s.heading)).toEqual([undefined, "Age 12 · Physical", "Age 61 · Physical", "Age 61 · Ambitions"]);
    expect(printableFor(host, tom.id, "s2")).toMatchObject({ subtitle: "Character · Age 61", sections: [{ heading: "Physical" }, { heading: "Ambitions", text: "To keep the lamp lit." }] });
  });

  it("story items: synopsis, a subplot, and the plot with its subplots; one-line items are not printed on their own", () => {
    const { host } = makeHost();
    ensureStoryEntity(host);
    const story = () => findStoryEntity(host)!;
    expect(hasParagraphs(story(), "theme")).toBe(false);
    expect(hasParagraphs(story(), "tagline")).toBe(false);
    expect(hasParagraphs(story(), "synopsis")).toBe(true);
    expect(printableFor(host, story().id, "plot")).toBeNull();
    setTheme(host, story(), "Grief");
    setSynopsis(host, story(), "A keeper finds a door.");
    setPlotMain(host, story(), "He must choose.");
    const sub = addSubplot(host, story());
    setSubplotField(host, story(), sub, { name: "The debt", text: "Ilse owes money." });
    expect(printableFor(host, story().id, "synopsis")).toEqual({ title: "Synopsis", subtitle: "Story", sections: [{ text: "A keeper finds a door." }], font: COURIER });
    expect(printableFor(host, story().id, `subplot:${sub}`)).toEqual({ title: "The debt", subtitle: "Subplot", sections: [{ text: "Ilse owes money." }], font: COURIER });
    expect(printableFor(host, story().id, "plot")!.sections).toEqual([
      { facts: [{ label: "Theme", value: "Grief" }] },
      { heading: "Main plot", text: "He must choose." },
      { heading: "Subplot: The debt", text: "Ilse owes money." },
    ]);
  });
});
