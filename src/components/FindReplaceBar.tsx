import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { getSelectionStore, type ScriptEditorHost } from "@sudobility/writing_ui";
import { compareOrder, type SearchHit, type SearchProvider } from "../util/search/types";

/**
 * Project-wide Find & Replace. Searches every surface its `providers` cover (title page, script,
 * Catalog entities — names, descriptions, character skeletons, the Story record, notes), merges the hits
 * into one reading order, and drives Find Next/Previous, Replace and Find Next/Previous, and Replace All.
 * Each provider reveals its own match (navigates to the surface, scrolls it in, highlights it) and replaces
 * its own text. Replace actions enable only when the replacement box has text; otherwise just the Find
 * actions. ⌘/Ctrl+G and F3 (add Shift for previous) step through matches from anywhere.
 */
export function FindReplaceBar({ host, providers, onClose }: { host: ScriptEditorHost; providers: readonly SearchProvider[]; onClose(): void }) {
  // Recompute when the document changes (a replace, a remote edit): every surface derives from host.model.
  const [tick, bump] = useReducer((n: number) => n + 1, 0);
  useEffect(() => host.subscribe(() => bump()), [host]);

  const [query, setQuery] = useState("");
  const [replacement, setReplacement] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [active, setActive] = useState<SearchHit | null>(null);
  const [revealNonce, setRevealNonce] = useState(0);
  const activeRef = useRef<SearchHit | null>(null);
  activeRef.current = active;
  const queryInput = useRef<HTMLInputElement | null>(null);

  const opts = { caseSensitive, wholeWord };
  const computeHits = (): SearchHit[] => providers.flatMap(p => p.find(query, opts)).sort((a, b) => compareOrder(a.order, b.order));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const hits = useMemo(computeHits, [providers, query, caseSensitive, wholeWord, tick]);
  const activeIndex = active ? hits.findIndex(h => h.id === active.id) : -1;

  const providerOf = (hit: SearchHit): SearchProvider | undefined => providers.find(p => p.id === hit.providerId);

  // Select + scroll to the active hit, after app state / editor have committed.
  useEffect(() => {
    const h = activeRef.current;
    if (h) providerOf(h)?.reveal(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealNonce]);

  const reveal = (hit: SearchHit | null) => {
    setActive(hit);
    setRevealNonce(n => n + 1);
  };

  // Where the editor caret sits, as a global order vector (only the script provides one); starts Find from there.
  const caretOrder = (): readonly number[] | null => {
    for (const p of providers) {
      const c = p.cursor?.();
      if (c) return c;
    }
    return null;
  };

  const hasHits = hits.length > 0;
  const canFind = query.length > 0 && hasHits;
  const canReplace = canFind && replacement.length > 0;

  const findNext = () => {
    if (!hasHits) return;
    if (active && activeIndex >= 0) return reveal(hits[(activeIndex + 1) % hits.length]);
    const ref = caretOrder();
    reveal((ref && hits.find(h => compareOrder(h.order, ref) >= 0)) || hits[0]);
  };

  const findPrev = () => {
    if (!hasHits) return;
    if (active && activeIndex >= 0) return reveal(hits[(activeIndex - 1 + hits.length) % hits.length]);
    const ref = caretOrder();
    if (!ref) return reveal(hits[hits.length - 1]);
    for (let i = hits.length - 1; i >= 0; i--) if (compareOrder(hits[i].order, ref) < 0) return reveal(hits[i]);
    reveal(hits[hits.length - 1]);
  };

  const replaceOne = (hit: SearchHit): boolean => providerOf(hit)?.replace(hit, replacement) ?? false;

  const replaceAndFindNext = () => {
    if (!canReplace) return;
    if (!(active && activeIndex >= 0)) return findNext();
    const cur = active;
    if (!replaceOne(cur)) return;
    const next = computeHits();
    reveal(next.find(h => compareOrder(h.order, cur.order) > 0) ?? next[0] ?? null);
  };

  const replaceAndFindPrev = () => {
    if (!canReplace) return;
    if (!(active && activeIndex >= 0)) return findPrev();
    const cur = active;
    if (!replaceOne(cur)) return;
    const next = computeHits();
    for (let i = next.length - 1; i >= 0; i--) if (compareOrder(next[i].order, cur.order) < 0) return reveal(next[i]);
    reveal(next[next.length - 1] ?? null);
  };

  const replaceAll = () => {
    if (!canReplace || !hasHits) return;
    const byProvider = new Map<string, SearchHit[]>();
    for (const h of hits) (byProvider.get(h.providerId) ?? byProvider.set(h.providerId, []).get(h.providerId)!).push(h);
    for (const [pid, group] of byProvider) {
      const p = providers.find(x => x.id === pid);
      if (!p) continue;
      if (p.replaceAll) p.replaceAll(group, replacement);
      else for (const h of [...group].sort((a, b) => compareOrder(b.order, a.order))) p.replace(h, replacement);
    }
    reveal(null);
  };

  // Keep latest handlers reachable from the one-time global key listener below.
  const handlers = useRef({ findNext, findPrev });
  handlers.current = { findNext, findPrev };

  // On open: seed the query from a one-element script selection, focus the find box.
  useEffect(() => {
    const sel = getSelectionStore(host).get();
    if (sel && sel.anchor.elementId === sel.head.elementId && sel.anchor.offset !== sel.head.offset) {
      const v = host.model.element(sel.anchor.elementId as never);
      if (v) {
        const a = Math.min(sel.anchor.offset, sel.head.offset);
        const b = Math.max(sel.anchor.offset, sel.head.offset);
        const text = v.text.plain.slice(a, b);
        if (text && !text.includes("\n")) setQuery(text);
      }
    }
    queryInput.current?.focus();
    queryInput.current?.select();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ⌘/Ctrl+G and F3 step through matches from any focus; ⌘/Ctrl+F refocuses the find box.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if ((mod && !e.altKey && e.key.toLowerCase() === "g") || e.key === "F3") {
        e.preventDefault();
        e.shiftKey ? handlers.current.findPrev() : handlers.current.findNext();
      } else if (mod && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "f") {
        e.preventDefault();
        queryInput.current?.focus();
        queryInput.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const counter = !query ? "" : hasHits ? `${activeIndex >= 0 ? activeIndex + 1 : 0}/${hits.length}` : "No results";

  const btn = "border border-neutral-300 rounded px-2 py-1 text-xs whitespace-nowrap hover:bg-neutral-100 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent";
  const inputCls = "flex-1 min-w-0 border border-neutral-300 rounded px-2 py-1 text-sm";
  const toggleCls = (on: boolean) => `rounded px-2 py-1 text-xs border ${on ? "bg-neutral-800 text-white border-neutral-800" : "border-neutral-300 hover:bg-neutral-100"}`;

  return (
    <div
      role="search"
      aria-label="Find and replace"
      data-testid="find-replace-bar"
      className="print:hidden absolute top-3 right-4 z-30 w-[23rem] max-w-[calc(100%-2rem)] rounded-lg border border-neutral-300 bg-white shadow-lg p-2 space-y-2"
      onKeyDown={e => {
        if (e.key === "Escape") {
          e.preventDefault();
          onClose();
        }
      }}
    >
      <div className="flex items-center gap-1">
        <input
          ref={queryInput}
          className={inputCls}
          placeholder="Find in project"
          aria-label="Find in project"
          spellCheck={false}
          autoCorrect="off"
          value={query}
          onChange={e => {
            setQuery(e.target.value);
            setActive(null);
          }}
          onKeyDown={e => {
            if (e.key === "Enter") {
              e.preventDefault();
              e.shiftKey ? findPrev() : findNext();
            }
          }}
        />
        <span data-testid="find-count" className="text-xs text-neutral-500 tabular-nums w-16 text-center shrink-0">
          {counter}
        </span>
        <button type="button" className={toggleCls(caseSensitive)} aria-pressed={caseSensitive} title="Match case" onClick={() => { setCaseSensitive(v => !v); setActive(null); }}>
          Aa
        </button>
        <button type="button" className={toggleCls(wholeWord)} aria-pressed={wholeWord} title="Whole word" onClick={() => { setWholeWord(v => !v); setActive(null); }}>
          W
        </button>
        <button type="button" className={btn} aria-label="Close find" title="Close (Esc)" onClick={onClose}>
          ✕
        </button>
      </div>

      <input
        className={inputCls + " w-full"}
        placeholder="Replace with"
        aria-label="Replace with"
        spellCheck={false}
        autoCorrect="off"
        value={replacement}
        onChange={e => setReplacement(e.target.value)}
        onKeyDown={e => {
          if (e.key === "Enter") {
            e.preventDefault();
            e.shiftKey ? replaceAndFindPrev() : replaceAndFindNext();
          }
        }}
      />

      {active && (
        <div data-testid="find-surface" className="text-xs text-neutral-500 truncate" title={active.surface}>
          {active.surface}
        </div>
      )}

      <div className="flex items-center gap-1 flex-wrap">
        <button type="button" className={btn} disabled={!canFind} onClick={findPrev} aria-label="Find previous" title="Find previous (Shift+Enter, ⇧⌘G)">
          ↑ Find
        </button>
        <button type="button" className={btn} disabled={!canFind} onClick={findNext} aria-label="Find next" title="Find next (Enter, ⌘G)">
          ↓ Find
        </button>
        <span className="flex-1" />
        <button type="button" className={btn} disabled={!canReplace} onClick={replaceAndFindPrev} aria-label="Replace and find previous" title="Replace and find previous">
          ↑ Replace
        </button>
        <button type="button" className={btn} disabled={!canReplace} onClick={replaceAndFindNext} aria-label="Replace and find next" title="Replace and find next (Enter)">
          ↓ Replace
        </button>
        <button type="button" className={btn} disabled={!canReplace} onClick={replaceAll} aria-label="Replace all">
          Replace all
        </button>
      </div>
    </div>
  );
}
