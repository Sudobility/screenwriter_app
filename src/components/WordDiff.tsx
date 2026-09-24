import { useMemo } from "react";
import { diffWords } from "../util/diff";

/** One side of a word-level before/after diff: deletions marked on "before", additions on "after". */
export function WordDiff({ before, after, side }: { before: string; after: string; side: "before" | "after" }) {
  const parts = useMemo(() => diffWords(before, after), [before, after]);
  return (
    <p className="text-sm whitespace-pre-wrap font-mono" data-testid={`ai-diff-${side}`}>
      {parts.map((p, i) =>
        p.op === "same" ? (
          <span key={i}>{p.text}</span>
        ) : side === "before" && p.op === "del" ? (
          <del key={i} className="bg-red-100 text-red-800">
            {p.text}
          </del>
        ) : side === "after" && p.op === "add" ? (
          <ins key={i} className="bg-green-100 text-green-800 no-underline">
            {p.text}
          </ins>
        ) : null
      )}
    </p>
  );
}
