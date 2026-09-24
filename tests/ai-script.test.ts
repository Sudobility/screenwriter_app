import { describe, expect, it } from "vitest";
import { commandHarness } from "../../writing_core/src/commands/test-harness";
import type { ScriptEditorHost } from "@sudobility/writing_ui";
import {
  applyLineEdits,
  dialogueOf,
  headingText,
  insertScript,
  readScene,
  replaceSceneBody,
  speakersIn,
} from "../src/util/ai-script";
import { mergeSkeleton, skeletonForAi } from "../src/util/character-skeleton";

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
  ["st_character", "ASSISTANT"],
  ["st_dialogue", "Nobody touched it."],
  ["st_scene_heading", "EXT. ROOF - NIGHT"],
  ["st_action", "Voss climbs out into the wind."],
];
const texts = (h: ReturnType<typeof makeHost>["h"]) => h.body().map(e => e.text);

describe("headingText", () => {
  it("formats a structured heading", () => {
    expect(headingText({ setting: "int", location: "lab", time: "day" })).toBe("INT. LAB - DAY");
    expect(headingText({ setting: "ext", location: "The Cliff Path", time: "Morning" })).toBe("EXT. THE CLIFF PATH - MORNING");
    expect(headingText({ setting: "intExt", location: "Car", time: "Night" })).toBe("INT./EXT. CAR - NIGHT");
  });
});

describe("skeleton helpers", () => {
  it("mergeSkeleton keeps what the writer wrote and fills only blanks", () => {
    const r = mergeSkeleton({ age: "50", race: "" , secret: "mine" }, { age: "47", race: "x", secret: "theirs", health: "poor", posture: "  " });
    expect(r.skeleton).toEqual({ age: "50", race: "x", secret: "mine", health: "poor" });
    expect(r.filled.sort()).toEqual(["health", "race"]);
  });
  it("skeletonForAi sends age 'unspecified' when there is none and drops blanks", () => {
    expect(skeletonForAi({ race: " ", health: "poor" })).toEqual({ health: "poor", age: "unspecified" });
    expect(skeletonForAi({ age: "52" })).toEqual({ age: "52" });
  });
});

describe("reading the script", () => {
  it("readScene maps the body to element types and leaves the heading out", () => {
    const { host } = makeHost(LAB);
    const scene = host.model.scenes()[0]!;
    const r = readScene(host, String(scene.id))!;
    expect(r.heading).toBe("INT. LAB - DAY");
    expect(r.elements.map(e => e.type)).toEqual(["action", "character", "dialogue", "character", "dialogue"]);
    expect(r.unsupported).toBe(0);
  });

  it("finds who speaks in a scene and a character's lines, optionally per scene", () => {
    const { h, host } = makeHost(LAB);
    h.run("entity.rebuild", {});
    const scene = String(host.model.scenes()[0]!.id);
    const names = speakersIn(host, scene).map(e => e.name).sort();
    expect(names).toEqual(["ASSISTANT", "VOSS"]);
    const voss = host.model.entities({ kind: "character" }).find(e => e.name === "VOSS")!;
    expect(dialogueOf(host, voss).map(l => l.text)).toEqual(["It should not be running."]);
    expect(dialogueOf(host, voss, String(host.model.scenes()[1]!.id))).toEqual([]);
  });
});

describe("applying results", () => {
  it("applyLineEdits replaces a line's text and refuses a line edited since", () => {
    const { h, host } = makeHost(LAB);
    const [a, b] = h.body().filter(e => e.style === "st_dialogue");
    const r = applyLineEdits(host, [
      { id: a!.id, before: "It should not be running.", after: "Why is it running?" },
      { id: b!.id, before: "something else entirely", after: "nope" },
    ]);
    expect(r).toEqual({ applied: [a!.id], stale: [b!.id] });
    expect(texts(h)).toContain("Why is it running?");
    expect(texts(h)).toContain("Nobody touched it.");
  });

  it("replaceSceneBody swaps a scene's body and leaves the heading and the other scenes alone", () => {
    const { h, host } = makeHost(LAB);
    const scene = String(host.model.scenes()[0]!.id);
    const ok = replaceSceneBody(host, scene, [
      { type: "action", text: "Voss studies the screen." },
      { type: "character", text: "VOSS" },
      { type: "dialogue", text: "Why is this running?" },
    ]);
    expect(ok).toBe(true);
    expect(texts(h)).toEqual([
      "INT. LAB - DAY",
      "Voss studies the screen.",
      "VOSS",
      "Why is this running?",
      "EXT. ROOF - NIGHT",
      "Voss climbs out into the wind.",
    ]);
    expect(h.body().map(e => e.style)).toEqual(["st_scene_heading", "st_action", "st_character", "st_dialogue", "st_scene_heading", "st_action"]);
  });

  it("replaceSceneBody refuses a scene that changed since the AI saw it", () => {
    const { h, host } = makeHost(LAB);
    const scene = String(host.model.scenes()[0]!.id);
    const seen = readScene(host, scene)!.elements;
    const dlg = h.body().find(e => e.text === "Nobody touched it.")!;
    applyLineEdits(host, [{ id: dlg.id, before: dlg.text, after: "Somebody did." }]);
    expect(replaceSceneBody(host, scene, [{ type: "action", text: "x" }], seen)).toBe(false);
    expect(texts(h)).toContain("Somebody did."); // nothing was discarded
  });

  it("insertScript reuses the empty starter element of a new document", () => {
    const { h, host } = makeHost();
    const r = insertScript(host, {
      title: null,
      scenes: [
        {
          heading: { setting: "int", location: "Lighthouse", time: "Night" },
          elements: [
            { type: "action", text: "Tomas climbs the stairs." },
            { type: "character", text: "TOMAS" },
            { type: "dialogue", text: "Anna?" },
          ],
        },
      ],
    });
    expect(r).toMatchObject({ written: 4, skipped: 0 });
    expect(texts(h)).toEqual(["INT. LIGHTHOUSE - NIGHT", "Tomas climbs the stairs.", "TOMAS", "Anna?"]);
    expect(h.body().map(e => e.style)).toEqual(["st_scene_heading", "st_action", "st_character", "st_dialogue"]);
  });

  it("insertScript appends after existing content", () => {
    const { h, host } = makeHost(LAB);
    insertScript(host, {
      title: null,
      scenes: [{ heading: { setting: "ext", location: "Cliff", time: "Dawn" }, elements: [{ type: "action", text: "Grey light." }] }],
    });
    expect(texts(h).slice(-2)).toEqual(["EXT. CLIFF - DAWN", "Grey light."]);
    expect(texts(h)).toHaveLength(LAB.length + 2);
  });
});
