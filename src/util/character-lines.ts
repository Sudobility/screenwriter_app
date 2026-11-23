import type { ScriptEditorHost } from "@sudobility/writing_ui";
import { AI_ACTION_LIMITS } from "@sudobility/screenwriter_types";

/**
 * A character's own dialogue, harvested from the live document for the voice-profile action: walking each scene in
 * order, a `character` cue whose name matches the character (or one of their aliases) turns the next run of
 * `dialogue`/`parenthetical` lines "on"; any other element turns it off. Cue extensions like "(CONT'D)" / "(V.O.)"
 * are ignored when matching. Capped to the action's limits.
 */
export function characterLines(host: ScriptEditorHost, names: string[]): string[] {
  const want = new Set(names.map(n => n.trim().toUpperCase().replace(/\s*\(.*\)\s*$/, "").trim()).filter(Boolean));
  if (want.size === 0) return [];
  const out: string[] = [];
  for (const scene of host.model.scenes()) {
    let active = false;
    for (const id of scene.elementIds) {
      if (id === scene.id) continue;
      const el = host.model.element(id);
      if (!el) continue;
      if (el.role === "character") {
        active = want.has(el.text.plain.trim().toUpperCase().replace(/\s*\(.*\)\s*$/, "").trim());
      } else if (el.role === "dialogue") {
        if (active) {
          const t = el.text.plain.trim();
          if (t) out.push(t.slice(0, AI_ACTION_LIMITS.sceneElementTextMax));
          if (out.length >= AI_ACTION_LIMITS.voiceLinesMax) return out;
        }
      } else if (el.role !== "parenthetical") {
        active = false;
      }
    }
  }
  return out;
}

const cueName = (text: string): string => text.trim().toUpperCase().replace(/\s*\(.*\)\s*$/, "").trim();

/** The distinct character cue names in the document (upper-cased, extensions like "(CONT'D)" stripped). */
export function characterNames(host: ScriptEditorHost): string[] {
  const names = new Set<string>();
  for (const scene of host.model.scenes()) {
    for (const id of scene.elementIds) {
      if (id === scene.id) continue;
      const el = host.model.element(id);
      if (el?.role === "character") {
        const n = cueName(el.text.plain);
        if (n) names.add(n);
      }
    }
  }
  return [...names];
}

/** Every character cue element whose name matches `name` (ignoring extensions), with its current plain text. */
export function characterCues(host: ScriptEditorHost, name: string): { id: string; text: string }[] {
  const want = cueName(name);
  const cues: { id: string; text: string }[] = [];
  for (const scene of host.model.scenes()) {
    for (const id of scene.elementIds) {
      if (id === scene.id) continue;
      const el = host.model.element(id);
      if (el?.role === "character" && cueName(el.text.plain) === want) cues.push({ id: String(id), text: el.text.plain });
    }
  }
  return cues;
}
