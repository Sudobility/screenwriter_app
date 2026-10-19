import { useMemo, useState } from "react";
import { useEditorSelection, type ScriptEditorHost } from "@sudobility/writing_ui";
import { useModelTick } from "../util/use-model-tick";

// Google-Docs-style comments on the script. Reads the live `notes` model and writes through the
// writing_core note.* commands via host.execute, so a comment merges collaboratively like any edit.

type Note = ReturnType<ScriptEditorHost["model"]["notes"]>[number];
type Scene = ReturnType<ScriptEditorHost["model"]["scenes"]>[number];

// note.add's range anchor carries the selection to mark; the stored NoteView anchor does not.
type AddAnchor =
  | { kind: "scene"; elementId: string }
  | { kind: "element"; elementId: string }
  | { kind: "range"; range: { anchor: { elementId: string; offset: number }; head: { elementId: string; offset: number } } };

const primary = "bg-neutral-900 text-white rounded px-3 py-1 text-sm hover:bg-neutral-800 disabled:opacity-50";
const btn = "border border-neutral-300 rounded px-2 py-1 text-xs hover:bg-neutral-100 disabled:opacity-50";

function when(ms: number | null | undefined): string {
  return ms ? new Date(ms).toLocaleString() : "";
}

export function CommentsPanel({ host, onJumpTo, onClose }: { host: ScriptEditorHost; onJumpTo(sceneId: string): void; onClose(): void }) {
  useModelTick(host);
  const selection = useEditorSelection(host);
  const [draft, setDraft] = useState("");
  const [showResolved, setShowResolved] = useState(false);
  const [replyFor, setReplyFor] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState("");

  const scenes = host.model.scenes();
  const notes = host.model.notes();

  const sceneForElement = useMemo(() => {
    const m = new Map<string, Scene>();
    for (const s of scenes) for (const id of s.elementIds) m.set(id, s);
    return m;
  }, [scenes]);

  const run = (id: string, params: unknown) => host.execute([{ id, params }], { kind: "local-command" });

  // What "Add a comment" will attach to, derived from the current editor selection.
  const target = useMemo((): { anchor: AddAnchor; label: string } | null => {
    if (!selection) return null;
    const { anchor: a, head: h } = selection;
    const collapsed = a.elementId === h.elementId && a.offset === h.offset;
    if (collapsed) {
      const scene = scenes.find(s => s.id === a.elementId);
      if (scene) return { anchor: { kind: "scene", elementId: a.elementId }, label: `Scene — ${scene.headingText || "untitled"}` };
      const inScene = sceneForElement.get(a.elementId);
      return { anchor: { kind: "element", elementId: a.elementId }, label: inScene ? `A line in ${inScene.headingText || "a scene"}` : "A line" };
    }
    return { anchor: { kind: "range", range: { anchor: a, head: h } }, label: "Selected text" };
  }, [selection, scenes, sceneForElement]);

  const groups = useMemo(() => {
    const byScene = new Map<string, { scene: Scene; notes: Note[] }>();
    const other: Note[] = [];
    for (const n of notes) {
      if (!showResolved && n.resolved) continue;
      let scene: Scene | undefined;
      if (n.anchor.kind === "scene") {
        const headingId = n.anchor.elementId;
        scene = scenes.find(s => s.id === headingId);
      } else if (n.anchor.kind === "element") scene = sceneForElement.get(n.anchor.elementId);
      if (scene) {
        const g = byScene.get(scene.id) ?? { scene, notes: [] };
        g.notes.push(n);
        byScene.set(scene.id, g);
      } else other.push(n);
    }
    return { ordered: [...byScene.values()].sort((x, y) => x.scene.index - y.scene.index), other };
  }, [notes, scenes, sceneForElement, showResolved]);

  const openCount = notes.filter(n => !n.resolved).length;

  const add = () => {
    if (!target || !draft.trim()) return;
    run("note.add", { anchor: target.anchor, body: draft.trim() });
    setDraft("");
  };

  const sendReply = (noteId: string) => {
    if (!replyDraft.trim()) return;
    run("note.reply", { noteId, body: replyDraft.trim() });
    setReplyDraft("");
    setReplyFor(null);
  };

  const card = (n: Note, sceneId: string | null) => (
    <li key={n.id} data-testid="comment" data-note-id={n.id} className={`rounded border p-2 text-xs ${n.resolved ? "border-neutral-200 bg-neutral-50 opacity-70" : "border-neutral-300"}`}>
      {n.title && <p className="font-medium">{n.title}</p>}
      <p className="whitespace-pre-wrap">{n.body.plain}</p>
      <p className="mt-1 text-[10px] text-neutral-500">{n.authorUid}{n.createdAt ? ` · ${when(n.createdAt)}` : ""}{n.resolved ? " · resolved" : ""}</p>
      {n.replies.length > 0 && (
        <ul className="mt-1 space-y-1 border-l-2 border-neutral-200 pl-2">
          {n.replies.map(r => (
            <li key={r.id}>
              <span className="whitespace-pre-wrap">{r.body.plain}</span>
              <span className="block text-[10px] text-neutral-500">{r.authorUid}{r.createdAt ? ` · ${when(r.createdAt)}` : ""}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-1 flex flex-wrap items-center gap-1">
        {sceneId && <button type="button" className={btn} onClick={() => onJumpTo(sceneId)}>Jump</button>}
        <button type="button" className={btn} onClick={() => { setReplyFor(replyFor === n.id ? null : n.id); setReplyDraft(""); }}>Reply</button>
        <button type="button" className={btn} onClick={() => run("note.resolve", { noteId: n.id, resolved: !n.resolved })}>{n.resolved ? "Reopen" : "Resolve"}</button>
        <button type="button" className={btn} onClick={() => run("note.delete", { noteId: n.id })}>Delete</button>
      </div>
      {replyFor === n.id && (
        <div className="mt-1 flex gap-1">
          <input className="flex-1 rounded border border-neutral-300 px-2 py-1 text-xs" value={replyDraft} onChange={e => setReplyDraft(e.target.value)} placeholder="Reply…" onKeyDown={e => { if (e.key === "Enter") sendReply(n.id); }} />
          <button type="button" className={btn} disabled={!replyDraft.trim()} onClick={() => sendReply(n.id)}>Send</button>
        </div>
      )}
    </li>
  );

  return (
    <aside data-testid="comments-panel" className="w-80 shrink-0 border-l border-neutral-200 bg-white p-3 overflow-y-auto space-y-3 text-sm">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Comments <span className="text-xs font-normal text-neutral-500">({openCount} open)</span></h2>
        <button type="button" className={btn} onClick={onClose}>Close</button>
      </div>

      <div className="space-y-1 rounded border border-neutral-200 p-2">
        <p className="text-[11px] text-neutral-500">{target ? `On: ${target.label}` : "Place your cursor in the script, or select text, to comment."}</p>
        <textarea data-testid="comment-draft" className="w-full rounded border border-neutral-300 p-2 text-xs" rows={2} value={draft} onChange={e => setDraft(e.target.value)} placeholder="Add a comment…" disabled={!target} />
        <button type="button" className={primary} data-testid="comment-add" disabled={!target || !draft.trim()} onClick={add}>Add comment</button>
      </div>

      <label className="flex items-center gap-1 text-xs text-neutral-600">
        <input type="checkbox" checked={showResolved} onChange={e => setShowResolved(e.target.checked)} /> Show resolved
      </label>

      {groups.ordered.length === 0 && groups.other.length === 0 && <p className="text-xs text-neutral-500">No comments yet.</p>}

      {groups.ordered.map(g => (
        <section key={g.scene.id} className="space-y-1">
          <button type="button" className="text-left text-xs font-medium text-neutral-700 hover:underline" onClick={() => onJumpTo(g.scene.id)}>
            {g.scene.number ? `${g.scene.number}. ` : ""}{g.scene.headingText || "Untitled scene"}
          </button>
          <ul className="space-y-2">{g.notes.map(n => card(n, g.scene.id))}</ul>
        </section>
      ))}

      {groups.other.length > 0 && (
        <section className="space-y-1">
          <p className="text-xs font-medium text-neutral-700">Other</p>
          <ul className="space-y-2">{groups.other.map(n => card(n, null))}</ul>
        </section>
      )}
    </aside>
  );
}
