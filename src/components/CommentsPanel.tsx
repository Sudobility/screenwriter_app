import { useMemo, useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@sudobility/components";
import { useEditorSelection, type ScriptEditorHost } from "@sudobility/writing_ui";
import { REVIEW_CATEGORIES, type AiNote, type ReviewCategory, type Severity } from "@sudobility/screenwriter_types";
import { useModelTick } from "../util/use-model-tick";
import { useAiActions } from "../hooks/useAiActions";
import { applyFix, noteFixContext } from "../util/note-fix";
import { AiNotices } from "./AiNotices";
import { NoteFixes } from "./NoteFixes";

// Structured comments on the script (AI review, the writer, or org members). Reads the live `notes`
// model and writes through the writing_core note.* commands via host.execute, so a comment merges
// collaboratively like any edit. The writer triages each comment: confirm (→ todo), complete, or reject.

type Note = ReturnType<ScriptEditorHost["model"]["notes"]>[number];
type Scene = ReturnType<ScriptEditorHost["model"]["scenes"]>[number];

type AddAnchor =
  | { kind: "scene"; elementId: string }
  | { kind: "element"; elementId: string }
  | { kind: "range"; range: { anchor: { elementId: string; offset: number }; head: { elementId: string; offset: number } } };

const primary = "bg-neutral-900 text-white rounded px-3 py-1 text-sm hover:bg-neutral-800 disabled:opacity-50";
const btn = "border border-neutral-300 rounded px-2 py-1 text-xs hover:bg-neutral-100 disabled:opacity-50";

const SOURCE_LABEL: Record<string, string> = { ai: "AI review", writer: "Writer", member: "Reviewer" };
const SOURCE_CLASS: Record<string, string> = {
  ai: "bg-violet-100 text-violet-800",
  writer: "bg-sky-100 text-sky-800",
  member: "bg-emerald-100 text-emerald-800",
};
const STATUS_LABEL: Record<string, string> = { pending: "Pending", todo: "TODO", rejected: "Rejected", completed: "Done" };

function when(ms: number | null | undefined): string {
  return ms ? new Date(ms).toLocaleString() : "";
}

export function CommentsPanel({
  host,
  onJumpTo,
  canTriage = true,
  authorName,
}: {
  host: ScriptEditorHost;
  onJumpTo(sceneId: string): void;
  /** Whether the viewer may triage comments (owner/manager). Members add/reply only. */
  canTriage?: boolean;
  /** Resolve a uid to a display name; falls back to the uid. */
  authorName?: (uid: string) => string;
}) {
  useModelTick(host);
  const selection = useEditorSelection(host);
  const [draft, setDraft] = useState("");
  const [draftCategory, setDraftCategory] = useState<ReviewCategory>("other");
  const [draftSuggestion, setDraftSuggestion] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [replyFor, setReplyFor] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState("");
  const [aiFor, setAiFor] = useState<string | null>(null);
  const ai = useAiActions();
  const [batching, setBatching] = useState(false);
  const [batchMsg, setBatchMsg] = useState<string | null>(null);

  const scenes = host.model.scenes();
  const notes = host.model.notes();
  const name = (uid: string) => authorName?.(uid) ?? uid;

  const sceneForElement = useMemo(() => {
    const m = new Map<string, Scene>();
    for (const s of scenes) for (const id of s.elementIds) m.set(id, s);
    return m;
  }, [scenes]);

  const run = (id: string, params: unknown) => host.execute([{ id, params }], { kind: "local-command" });
  const setStatus = (noteId: string, status: "pending" | "todo" | "rejected" | "completed") => run("note.setStatus", { noteId, status });

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

  const isVisible = (n: Note) => showHistory || n.status === "pending" || n.status === "todo";

  const sceneOf = (n: Note): Scene | undefined => {
    if (n.anchor.kind === "scene") {
      const headingId = n.anchor.elementId; // capture before the closure (TS drops the narrowing inside it)
      return scenes.find(s => s.id === headingId);
    }
    if (n.anchor.kind === "element") return sceneForElement.get(n.anchor.elementId);
    return undefined;
  };

  const groups = useMemo(() => {
    const byScene = new Map<string, { scene: Scene; notes: Note[] }>();
    const other: Note[] = [];
    for (const n of notes) {
      if (!isVisible(n)) continue;
      const scene = sceneOf(n);
      if (scene) {
        const g = byScene.get(scene.id) ?? { scene, notes: [] };
        g.notes.push(n);
        byScene.set(scene.id, g);
      } else other.push(n);
    }
    return { ordered: [...byScene.values()].sort((x, y) => x.scene.index - y.scene.index), other };
  }, [notes, scenes, sceneForElement, showHistory]);

  const activeCount = notes.filter(n => n.status === "pending" || n.status === "todo").length;
  const todoCount = notes.filter(n => n.status === "todo").length;

  const add = () => {
    if (!target || !draft.trim()) return;
    run("note.add", {
      anchor: target.anchor,
      body: draft.trim(),
      category: draftCategory,
      source: canTriage ? "writer" : "member",
      ...(draftSuggestion.trim() ? { suggestion: draftSuggestion.trim() } : {}),
    });
    setDraft("");
    setDraftSuggestion("");
  };

  const sendReply = (noteId: string) => {
    if (!replyDraft.trim()) return;
    run("note.reply", { noteId, body: replyDraft.trim() });
    setReplyDraft("");
    setReplyFor(null);
  };

  // A stored comment, shaped as an AiNote so the shared per-comment fix machinery (NoteFixes) can act on it.
  const asAiNote = (n: Note, sceneId: string | null): AiNote => {
    const elementId = n.anchor.kind === "element" ? String(n.anchor.elementId) : undefined;
    return {
      id: n.id,
      title: n.title || n.category,
      body: n.body.plain,
      category: n.category as ReviewCategory,
      severity: (n.severity ?? "moderate") as Severity,
      suggestion: n.suggestion?.plain ?? null,
      anchors: sceneId ? [{ sceneId, ...(elementId ? { elementId } : {}), contentHash: "" }] : [],
    };
  };

  // Fix every TODO with AI in one pass: for each, ask for fixes and apply the top one, then mark it completed.
  // Each edit is an ordinary undoable command, and the comment stays in history (reopenable), so this is safe to
  // run as a batch. A TODO the AI cannot fix by editing its scene (or whose scene changed) is left as a TODO.
  const fixAllTodos = async () => {
    const todos = host.model.notes({ status: "todo" });
    if (todos.length === 0) return;
    setBatching(true);
    setBatchMsg(null);
    let fixed = 0;
    let skipped = 0;
    try {
      for (const n of todos) {
        const sceneId = sceneOf(n)?.id ?? null;
        const ctx = noteFixContext(host, asAiNote(n, sceneId), sceneId ?? undefined);
        if (!ctx) { skipped++; continue; }
        const res = await ai.run(client => client.suggestNoteFix(ctx.request));
        if (!res) return; // consent/credits/paywall interrupted — the notices explain; the writer retries
        const best = res.result.suggestions[0];
        if (!best) { skipped++; continue; }
        if (applyFix(host, ctx, best).applied > 0) { setStatus(n.id, "completed"); fixed++; }
        else skipped++;
      }
      setBatchMsg(`Fixed ${fixed} TODO${fixed === 1 ? "" : "s"} with AI${skipped ? `, left ${skipped} that need a manual change` : ""}. Undo from the editor if needed.`);
    } finally {
      setBatching(false);
    }
  };

  const retired = (n: Note) => n.status === "completed" || n.status === "rejected";

  const card = (n: Note, sceneId: string | null) => (
    <li key={n.id} data-testid="comment" data-note-id={n.id} data-status={n.status} data-source={n.source} className={`rounded border p-2 text-xs ${retired(n) ? "border-neutral-200 bg-neutral-50 opacity-70" : "border-neutral-300"}`}>
      <div className="mb-1 flex flex-wrap items-center gap-1">
        <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${SOURCE_CLASS[n.source] ?? "bg-neutral-100 text-neutral-700"}`}>{SOURCE_LABEL[n.source] ?? n.source}</span>
        <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] text-neutral-700">{n.category}</span>
        {n.severity && n.severity !== "praise" && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-800">{n.severity}</span>}
        <span className="ml-auto rounded px-1.5 py-0.5 text-[10px] text-neutral-500">{STATUS_LABEL[n.status] ?? n.status}</span>
      </div>
      {n.title && <p className="font-medium">{n.title}</p>}
      <p className="whitespace-pre-wrap">{n.body.plain}</p>
      {n.suggestion?.plain && (
        <p className="mt-1 whitespace-pre-wrap rounded bg-neutral-50 p-1 text-[11px]"><span className="font-medium text-neutral-600">Suggestion: </span>{n.suggestion.plain}</p>
      )}
      <p className="mt-1 text-[10px] text-neutral-500">{name(n.authorUid)}{n.createdAt ? ` · ${when(n.createdAt)}` : ""}</p>
      {n.replies.length > 0 && (
        <ul className="mt-1 space-y-1 border-l-2 border-neutral-200 pl-2">
          {n.replies.map(r => (
            <li key={r.id}>
              <span className="whitespace-pre-wrap">{r.body.plain}</span>
              <span className="block text-[10px] text-neutral-500">{name(r.authorUid)}{r.createdAt ? ` · ${when(r.createdAt)}` : ""}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-1 flex flex-wrap items-center gap-1">
        {sceneId && <button type="button" className={btn} onClick={() => onJumpTo(sceneId)}>Jump</button>}
        <button type="button" className={btn} onClick={() => { setReplyFor(replyFor === n.id ? null : n.id); setReplyDraft(""); }}>Reply</button>
        {canTriage && n.status === "pending" && (
          <button type="button" className={btn} data-testid="comment-confirm" onClick={() => setStatus(n.id, "todo")}>Confirm</button>
        )}
        {canTriage && (n.status === "pending" || n.status === "todo") && (
          <>
            <button type="button" className={btn} data-testid="comment-complete" onClick={() => setStatus(n.id, "completed")}>Complete</button>
            <button type="button" className={btn} data-testid="comment-reject" onClick={() => setStatus(n.id, "rejected")}>Reject</button>
            <button type="button" className={btn} data-testid="comment-ai" onClick={() => setAiFor(aiFor === n.id ? null : n.id)}>{aiFor === n.id ? "Hide AI" : "Fix with AI"}</button>
          </>
        )}
        {canTriage && retired(n) && (
          <button type="button" className={btn} data-testid="comment-reopen" onClick={() => setStatus(n.id, "pending")}>Reopen</button>
        )}
      </div>
      {replyFor === n.id && (
        <div className="mt-1 flex gap-1">
          <input className="flex-1 rounded border border-neutral-300 px-2 py-1 text-xs" value={replyDraft} onChange={e => setReplyDraft(e.target.value)} placeholder="Reply…" onKeyDown={e => { if (e.key === "Enter") sendReply(n.id); }} />
          <button type="button" className={btn} disabled={!replyDraft.trim()} onClick={() => sendReply(n.id)}>Send</button>
        </div>
      )}
      {aiFor === n.id && (n.status === "pending" || n.status === "todo") && (
        <NoteFixes
          host={host}
          note={asAiNote(n, sceneId)}
          sceneId={sceneId ?? undefined}
          onJumpTo={onJumpTo}
          onApplied={() => { setStatus(n.id, "completed"); setAiFor(null); }}
        />
      )}
    </li>
  );

  return (
    <>
      <p className="text-xs text-neutral-500" data-testid="comments-count">{activeCount} open{todoCount ? `, ${todoCount} TODO` : ""}</p>

      <div className="space-y-1 rounded border border-neutral-200 p-2">
        <p className="text-[11px] text-neutral-500">{target ? `On: ${target.label}` : "Place your cursor in the script, or select text, to comment."}</p>
        <Select value={draftCategory} onValueChange={v => setDraftCategory(v as ReviewCategory)} disabled={!target}>
          <SelectTrigger data-testid="comment-category" aria-label="Comment category" className="w-full bg-white text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {REVIEW_CATEGORIES.map(c => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <textarea data-testid="comment-draft" className="w-full rounded border border-neutral-300 p-2 text-xs" rows={2} value={draft} onChange={e => setDraft(e.target.value)} placeholder="Comment…" disabled={!target} />
        <textarea data-testid="comment-suggestion" className="w-full rounded border border-neutral-300 p-2 text-xs" rows={2} value={draftSuggestion} onChange={e => setDraftSuggestion(e.target.value)} placeholder="Suggestion (optional, concrete action)…" disabled={!target} />
        <button type="button" className={primary} data-testid="comment-add" disabled={!target || !draft.trim()} onClick={add}>Add comment</button>
      </div>

      <label className="flex items-center gap-1 text-xs text-neutral-600">
        <input type="checkbox" checked={showHistory} onChange={e => setShowHistory(e.target.checked)} /> Show completed & rejected
      </label>

      {canTriage && (todoCount > 0 || batchMsg) && (
        <div className="space-y-1 rounded border border-neutral-200 p-2">
          {todoCount > 0 && (
            <button type="button" className={btn} data-testid="comment-fix-all-todos" disabled={batching || !ai.available} onClick={() => void fixAllTodos()}>
              {batching ? "Fixing TODOs…" : `Fix all ${todoCount} TODO${todoCount === 1 ? "" : "s"} with AI`}
            </button>
          )}
          <AiNotices ai={ai} showTestBanner={false} />
          {batchMsg && <p role="status" data-testid="comment-fix-all-result" className="text-[11px] text-neutral-700">{batchMsg}</p>}
        </div>
      )}

      {groups.ordered.length === 0 && groups.other.length === 0 && <p className="text-xs text-neutral-500">No comments{showHistory ? "" : " to review"} yet.</p>}

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
          <p className="text-xs font-medium text-neutral-700">Whole script</p>
          <ul className="space-y-2">{groups.other.map(n => card(n, null))}</ul>
        </section>
      )}
    </>
  );
}
