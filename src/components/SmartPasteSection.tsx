import { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@sudobility/components";
import {
  AI_ACTION_LIMITS,
  countWords,
  type GenerateScriptResult,
  type PastedCharacter,
  type ScriptElement,
  type SmartPastePlotsResult,
  type SmartPasteScriptResult,
} from "@sudobility/screenwriter_types";
import type { ScriptEditorHost } from "@sudobility/writing_ui";
import { useAiActions } from "../hooks/useAiActions";
import { headingText, insertRows, pastedRows, scriptRows, type ScriptRow } from "../util/ai-script";
import { SKELETON_SECTIONS } from "../util/character-skeleton";
import { fromPasteEvent, readClipboard, type ClipboardText } from "../util/clipboard-text";
import { applyCharacters, applyPlots, planCharacters, planPlots, type CharacterPlan } from "../util/smart-paste";
import { useModelTick } from "../util/use-model-tick";
import { AiNotices } from "./AiNotices";

const btn = "border border-neutral-300 rounded px-2 py-1 text-xs hover:bg-neutral-100 disabled:opacity-50";
const primary = "bg-neutral-900 text-white rounded px-3 py-1 text-sm hover:bg-neutral-800 disabled:opacity-50";

export type SmartPasteKind = "characters" | "script" | "story" | "plots";

const KINDS: Record<SmartPasteKind, { label: string; about: string; run: string; busy: string; wordsMax: number; charsMax: number }> = {
  characters: {
    label: "Characters",
    about: "Finds the characters in the text and builds their skeletons. A character you already have keeps what you wrote: only blank fields are filled.",
    run: "Build characters",
    busy: "Reading the characters...",
    wordsMax: AI_ACTION_LIMITS.pasteWordsMax,
    charsMax: AI_ACTION_LIMITS.pasteCharsMax,
  },
  script: {
    label: "Script",
    about: "Formats the text as a script: scene headings, action, characters, dialogue. Your words are kept as they are.",
    run: "Format as script",
    busy: "Formatting the script...",
    wordsMax: AI_ACTION_LIMITS.pasteScriptWordsMax,
    charsMax: AI_ACTION_LIMITS.pasteScriptCharsMax,
  },
  story: {
    label: "Story",
    about: "Takes the text as a story and writes a script from it: the AI writes the scenes, action and dialogue.",
    run: "Write script from story",
    busy: "Writing the script...",
    wordsMax: Infinity,
    charsMax: AI_ACTION_LIMITS.storyMax,
  },
  plots: {
    label: "Plots",
    about: "Finds the main plot and the subplots in the text. A plot you already wrote is kept: only empty ones are filled, new subplots are added.",
    run: "Build plots",
    busy: "Reading the plots...",
    wordsMax: AI_ACTION_LIMITS.pasteWordsMax,
    charsMax: AI_ACTION_LIMITS.pasteCharsMax,
  },
};

const FIELD_LABEL: Record<string, string> = Object.fromEntries(
  Object.values(SKELETON_SECTIONS).flatMap(s => s.fields.map(f => [f.key, f.label] as const))
);
const labels = (keys: string[]): string => keys.map(k => FIELD_LABEL[k] ?? k).join(", ");
const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

type Result =
  | { kind: "characters"; characters: PastedCharacter[] }
  | { kind: "plots"; plots: SmartPastePlotsResult }
  | { kind: "script"; rows: ScriptRow[]; scenes: SmartPasteScriptResult["scenes"] }
  | { kind: "story"; rows: ScriptRow[]; scenes: SmartPasteScriptResult["scenes"]; title: string | null };

/**
 * Smart Paste: pick what the clipboard holds (characters, a script, a story, plots), the text is read from the
 * clipboard (styled text keeps its structure, see `util/clipboard-text.ts`), the AI turns it into structured data,
 * and the result is shown first. Nothing is written until "Apply"; what is written goes through ordinary document
 * commands, so the Catalog and the script update at once and it can be undone.
 */
export function SmartPasteSection({
  host,
  scene,
  onInserted,
}: {
  host: ScriptEditorHost;
  /** The scene the caret is in: a script is inserted after it. */
  scene: { id: string; heading: string } | null;
  onInserted(firstElementId: string): void;
}) {
  useModelTick(host);
  const ai = useAiActions();
  const [kind, setKind] = useState<SmartPasteKind | "">("");
  const [clip, setClip] = useState<ClipboardText | null>(null);
  const [clipError, setClipError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [unticked, setUnticked] = useState<ReadonlySet<string>>(new Set());
  const [note, setNote] = useState<string | null>(null);

  const read = async () => {
    setResult(null);
    setNote(null);
    ai.clearError();
    try {
      const c = await readClipboard();
      setClip(c);
      setClipError(c.text ? null : "The clipboard has no text. Copy the text first, or paste it into the box below.");
    } catch {
      setClip(null);
      setClipError("The browser did not allow reading the clipboard. Paste the text into the box below instead.");
    }
  };

  const choose = (next: SmartPasteKind) => {
    setKind(next);
    void read();
  };

  const spec = kind ? KINDS[kind] : null;
  const text = clip?.text ?? "";
  const words = countWords(text);
  const tooLong = !!spec && (words > spec.wordsMax || text.length > spec.charsMax);

  const run = async () => {
    if (!kind || !text || tooLong) return;
    setResult(null);
    setNote(null);
    setUnticked(new Set());
    if (kind === "characters") {
      const knownNames = host.model
        .entities({ kind: "character" })
        .map(e => e.name)
        .slice(0, AI_ACTION_LIMITS.pasteKnownNamesMax);
      const res = await ai.run(client => client.smartPasteCharacters({ text, ...(knownNames.length ? { knownNames } : {}) }));
      if (res) setResult({ kind, characters: res.result.characters });
    } else if (kind === "plots") {
      const res = await ai.run(client => client.smartPastePlots({ text }));
      if (res) setResult({ kind, plots: res.result });
    } else if (kind === "script") {
      const res = await ai.run(client => client.smartPasteScript({ text }));
      if (res) setResult({ kind, scenes: res.result.scenes, rows: pastedRows(res.result.scenes) });
    } else {
      const res = await ai.run(client => client.generateScript({ story: text }));
      if (res) setResult({ kind, title: res.result.title, scenes: asPastedScenes(res.result), rows: scriptRows(res.result) });
    }
  };

  const done = (message: string) => {
    setNote(message);
    setResult(null);
    setClip(null);
    setKind("");
  };

  const apply = () => {
    if (!result) return;
    if (result.kind === "characters") {
      const r = applyCharacters(host, result.characters.filter(c => !unticked.has(c.name)));
      const parts = [
        r.created.length ? `${plural(r.created.length, "character")} added (${r.created.join(", ")})` : "",
        r.updated.length ? `${r.updated.length} updated (${r.updated.join(", ")})` : "",
        r.failed.length ? `${r.failed.length} could not be written (${r.failed.join(", ")})` : "",
      ].filter(Boolean);
      done(`${parts.length ? parts.join("; ") : "Nothing to change"}. See Catalog, Characters. You can undo this from the editor.`);
    } else if (result.kind === "plots") {
      const changes = applyPlots(host, result.plots);
      const written = changes.filter(c => c.kind !== "kept");
      const kept = changes.length - written.length;
      done(
        (written.length ? `${plural(written.length, "plot")} written (${written.map(c => c.name).join(", ")})` : "Nothing to change") +
          (kept ? `; ${kept} kept as you wrote ${kept === 1 ? "it" : "them"}` : "") +
          ". See Catalog, Story. You can undo this from the editor."
      );
    } else {
      const r = insertRows(host, result.rows, scene?.id);
      done(
        `Inserted ${plural(r.written, "element")}${scene ? ` after "${scene.heading || "the current scene"}"` : ""}.` +
          (r.skipped > 0 ? ` ${r.skipped} skipped because this template has no style for them.` : "") +
          " You can undo this from the editor."
      );
      if (r.firstId) onInserted(r.firstId);
    }
  };

  const plans: CharacterPlan[] = result?.kind === "characters" ? planCharacters(host, result.characters) : [];
  const chosen = plans.filter(p => p.changes && !unticked.has(p.name));
  const plotChanges = result?.kind === "plots" ? planPlots(host, result.plots) : [];

  return (
    <section className="space-y-2" data-testid="smart-paste-section">
      <h3 className="text-xs font-semibold uppercase text-neutral-500">Smart Paste</h3>
      <p className="text-xs text-neutral-600">Copy text anywhere, then choose what it is. The AI reads it from the clipboard and you review the result before anything is written.</p>
      <Select value={kind} onValueChange={v => choose(v as SmartPasteKind)} disabled={ai.busy || !ai.available}>
        <SelectTrigger aria-label="Smart Paste" data-testid="smart-paste-select" className="w-full bg-white">
          <SelectValue placeholder="Smart Paste" />
        </SelectTrigger>
        <SelectContent>
          {(Object.keys(KINDS) as SmartPasteKind[]).map(k => (
            <SelectItem key={k} value={k}>
              {KINDS[k].label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {spec && (
        <div className="space-y-2" data-testid="smart-paste-source" data-kind={kind}>
          <p className="text-xs text-neutral-600">{spec.about}</p>
          {clipError && (
            <p role="alert" data-testid="smart-paste-clip-error" className="text-xs text-amber-900 bg-amber-50 border border-amber-300 rounded p-2">
              {clipError}
            </p>
          )}
          {text ? (
            <div className="border border-neutral-200 rounded bg-white p-2 space-y-1" data-testid="smart-paste-clipboard">
              <p className="text-[11px] text-neutral-500" data-testid="smart-paste-words">
                Clipboard: {plural(words, "word")}
                {clip?.styled ? ", styled text" : ", plain text"}
              </p>
              <p className="text-xs text-neutral-800 whitespace-pre-wrap line-clamp-4" data-testid="smart-paste-excerpt">
                {text.slice(0, 400)}
                {text.length > 400 ? "..." : ""}
              </p>
            </div>
          ) : (
            <label className="flex flex-col text-xs text-neutral-500">
              Paste the text here
              <textarea
                rows={3}
                data-testid="smart-paste-box"
                className="border border-neutral-300 rounded px-2 py-1 text-sm bg-white text-neutral-900"
                placeholder="Click here and press Ctrl+V / Cmd+V"
                value=""
                onChange={() => {}}
                onPaste={e => {
                  e.preventDefault();
                  const c = fromPasteEvent(e.clipboardData);
                  setClip(c);
                  setClipError(c.text ? null : "That paste had no text in it.");
                }}
              />
            </label>
          )}
          {tooLong && (
            <p role="alert" data-testid="smart-paste-too-long" className="text-xs text-red-800 bg-red-50 border border-red-300 rounded p-2">
              That is too long for {spec.label}: at most{" "}
              {Number.isFinite(spec.wordsMax) ? `${spec.wordsMax.toLocaleString("en")} words` : `${spec.charsMax.toLocaleString("en")} characters`} at once.
              Copy a smaller part and read the clipboard again. Nothing was sent or charged.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button className={primary} data-testid="smart-paste-run" disabled={ai.busy || !text || tooLong || !ai.available} onClick={() => void run()}>
              {ai.busy ? spec.busy : spec.run}
            </button>
            <button className={btn} data-testid="smart-paste-reread" disabled={ai.busy} onClick={() => void read()}>
              Read clipboard again
            </button>
          </div>
        </div>
      )}

      <AiNotices ai={ai} showCredits showTestBanner={false} />
      {note && (
        <p role="status" data-testid="smart-paste-note" className="text-xs text-neutral-700">
          {note}
        </p>
      )}

      {result?.kind === "characters" && (
        <div className="space-y-2" data-testid="smart-paste-result" data-kind="characters">
          {plans.length === 0 && <p className="text-xs text-neutral-600">The AI found no characters in that text.</p>}
          <ul className="space-y-1">
            {plans.map(p => (
              <li key={p.name} data-testid="smart-paste-character" data-status={!p.entityId ? "new" : p.changes ? "update" : "same"} className="border border-neutral-200 rounded p-2 bg-white">
                <label className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    aria-label={`Apply ${p.name}`}
                    disabled={!p.changes}
                    checked={p.changes && !unticked.has(p.name)}
                    onChange={() =>
                      setUnticked(u => {
                        const n = new Set(u);
                        if (!n.delete(p.name)) n.add(p.name);
                        return n;
                      })
                    }
                  />
                  <span className="text-xs space-y-0.5">
                    <span className="block text-sm font-medium">
                      {p.existingName ?? p.name}{" "}
                      <span className="text-[10px] uppercase text-neutral-500">{!p.entityId ? "new" : p.changes ? "existing" : "nothing new"}</span>
                    </span>
                    {p.stages.map((s, i) => (
                      <span key={i} className="block text-neutral-700" data-testid="smart-paste-stage" data-kind={s.kind}>
                        {s.kind === "new" && `${p.entityId ? "Adds age" : "Age"} ${s.age}: ${labels(s.filled.filter(k => k !== "age")) || "age only"}`}
                        {s.kind === "fill" && `Age ${s.age}: fills ${labels(s.filled)}`}
                        {s.kind === "same" && `Age ${s.age}: nothing to fill, your own text is kept`}
                      </span>
                    ))}
                    {p.newAliases.length > 0 && <span className="block text-neutral-700">Also known as: {p.newAliases.join(", ")}</span>}
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <button className={primary} data-testid="smart-paste-apply" disabled={chosen.length === 0} onClick={apply}>
              Apply ({chosen.length})
            </button>
            <button className={btn} data-testid="smart-paste-discard" onClick={() => setResult(null)}>
              Discard
            </button>
          </div>
        </div>
      )}

      {result?.kind === "plots" && (
        <div className="space-y-2" data-testid="smart-paste-result" data-kind="plots">
          {plotChanges.length === 0 && <p className="text-xs text-neutral-600">The AI found no plots in that text.</p>}
          <ul className="space-y-1">
            {plotChanges.map((c, i) => (
              <li key={i} data-testid="smart-paste-plot" data-status={c.kind} className="border border-neutral-200 rounded p-2 bg-white text-xs space-y-0.5">
                <p className="text-sm font-medium">
                  {c.name} <span className="text-[10px] uppercase text-neutral-500">{c.kind === "new" ? "new subplot" : c.kind === "fill" ? "fills empty" : "kept as you wrote it"}</span>
                </p>
                <p className={`whitespace-pre-wrap ${c.kind === "kept" ? "text-neutral-400 line-through" : "text-neutral-700"}`}>{c.text}</p>
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <button className={primary} data-testid="smart-paste-apply" disabled={!plotChanges.some(c => c.kind !== "kept")} onClick={apply}>
              Apply
            </button>
            <button className={btn} data-testid="smart-paste-discard" onClick={() => setResult(null)}>
              Discard
            </button>
          </div>
        </div>
      )}

      {(result?.kind === "script" || result?.kind === "story") && (
        <div className="space-y-2" data-testid="smart-paste-result" data-kind={result.kind}>
          {result.kind === "story" && result.title && <p className="text-sm font-semibold">{result.title}</p>}
          <ol className="space-y-2">
            {result.scenes.map((s, i) => (
              <li key={i} data-testid="smart-paste-scene" className="border border-neutral-200 rounded p-2 bg-white space-y-1">
                <p className="text-xs font-semibold">{s.heading ?? <span className="font-normal text-neutral-500">(before the first scene heading)</span>}</p>
                <div className="text-xs space-y-0.5">
                  {s.elements.map((e, j) => (
                    <p key={j} data-type={e.type} className={ELEMENT_CLASS[e.type]}>
                      {e.text}
                    </p>
                  ))}
                </div>
              </li>
            ))}
          </ol>
          <p className="text-xs text-neutral-600" data-testid="smart-paste-target">
            Goes {scene ? <>after the scene <strong>{scene.heading || "(untitled scene)"}</strong></> : "at the end of the script (click in the script to choose a scene)"}.
          </p>
          <div className="flex gap-2">
            <button className={primary} data-testid="smart-paste-apply" onClick={apply}>
              Insert into script
            </button>
            <button className={btn} data-testid="smart-paste-discard" onClick={() => setResult(null)}>
              Discard
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

const ELEMENT_CLASS: Record<ScriptElement["type"], string> = {
  action: "",
  character: "font-semibold pl-8 pt-1",
  parenthetical: "pl-6 italic",
  dialogue: "pl-4",
  transition: "text-right",
};

/** A generated script in the preview's shape: headings as text. */
const asPastedScenes = (script: GenerateScriptResult): SmartPasteScriptResult["scenes"] =>
  script.scenes.map(s => ({ heading: headingText(s.heading), elements: s.elements }));
