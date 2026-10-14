/**
 * Project-wide search model. The find bar searches several *surfaces* — the script, character/entity
 * details, the title page, notes — through one `SearchProvider` each. A provider knows how to (1) list its
 * matches for a query, (2) reveal a match (navigate to its UI, scroll it in, highlight it), and (3) replace
 * one match. The controller merges every provider's hits into one project-wide order for Find Next/Previous.
 */

export interface SearchOptions {
  caseSensitive: boolean;
  wholeWord: boolean;
}

/** One occurrence of the search term, somewhere in the project. */
export interface SearchHit {
  /** Stable identity for this occurrence (same string across recomputations until the text around it changes). */
  id: string;
  /** Which provider owns it (dispatch target for reveal/replace). */
  providerId: string;
  /** Global position for ordering Find Next/Previous across the whole project; compared lexicographically. */
  order: readonly number[];
  /** The matched text itself (for display). */
  text: string;
  /** Short human label for where the hit is, e.g. "Script", "Bob (character)", "Title page", "Note". */
  surface: string;
  /** Provider-private payload (element id + offsets, field key, note id, …) used by reveal/replace. */
  loc: unknown;
}

export interface SearchProvider {
  readonly id: string;
  /** Every match for `query`, each tagged with a global `order`. */
  find(query: string, opts: SearchOptions): SearchHit[];
  /** Navigate to the hit's UI, scroll it into view, and highlight it. May run asynchronously (wait for mount). */
  reveal(hit: SearchHit): void;
  /** Whether this hit can currently be replaced. */
  canReplace(hit: SearchHit): boolean;
  /** Replace this single occurrence; return true when applied. */
  replace(hit: SearchHit, replacement: string): boolean;
  /** Optional batched replace of many of this provider's hits (one undo step); falls back to `replace` per hit. */
  replaceAll?(hits: readonly SearchHit[], replacement: string): void;
  /** Optional: the current caret as a global order vector, so Find Next/Previous can start from it. */
  cursor?(): readonly number[] | null;
}

/** Lexicographic comparison of two global order vectors. */
export function compareOrder(a: readonly number[], b: readonly number[]): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return a.length - b.length;
}
