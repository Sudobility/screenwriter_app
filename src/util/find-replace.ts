/**
 * Pure find & replace core, independent of the editor host and the DOM, so it can be unit-tested.
 * `FindReplaceBar` supplies the document as a flat element list and uses these to locate matches and to
 * pick the next/previous match relative to a position (the caret, or where a replacement just happened).
 */

/** One occurrence of the search term inside a single element, in plain (embed-excluded) UTF-16 offsets. */
export interface FindMatch {
  elementId: string;
  /** The element's index in document order (model.elements()), for comparing positions across elements. */
  order: number;
  start: number;
  end: number;
}

/** A point in the document in reading order: which element (by order) and a plain offset within it. */
export interface FindPos {
  order: number;
  offset: number;
}

/** The element text to search, in document order. */
export interface FindElement {
  id: string;
  plain: string;
}

export interface FindOptions {
  caseSensitive: boolean;
  wholeWord: boolean;
}

export const cmpFindPos = (a: FindPos, b: FindPos): number => (a.order !== b.order ? a.order - b.order : a.offset - b.offset);
export const posOfMatch = (m: FindMatch): FindPos => ({ order: m.order, offset: m.start });

const WORD = /[\p{L}\p{N}_]/u;
function isWholeWord(plain: string, start: number, end: number): boolean {
  const before = start > 0 ? plain[start - 1] : "";
  const after = end < plain.length ? plain[end] : "";
  return !(before && WORD.test(before)) && !(after && WORD.test(after));
}

/** Every occurrence of `query` in one string (non-overlapping), honouring case and whole-word options. */
export function matchRanges(plain: string, query: string, { caseSensitive, wholeWord }: FindOptions): { start: number; end: number }[] {
  if (!query) return [];
  const out: { start: number; end: number }[] = [];
  const needle = caseSensitive ? query : query.toLowerCase();
  const hay = caseSensitive ? plain : plain.toLowerCase();
  let from = 0;
  for (;;) {
    const i = hay.indexOf(needle, from);
    if (i < 0) break;
    const end = i + query.length;
    if (!wholeWord || isWholeWord(plain, i, end)) out.push({ start: i, end });
    from = i + Math.max(1, query.length);
  }
  return out;
}

/** Every occurrence of `query` across the elements, in reading order. Matches never cross an element boundary. */
export function findMatches(elements: readonly FindElement[], query: string, opts: FindOptions): FindMatch[] {
  const out: FindMatch[] = [];
  for (let order = 0; order < elements.length; order++) {
    const { id, plain } = elements[order];
    for (const r of matchRanges(plain, query, opts)) out.push({ elementId: id, order, start: r.start, end: r.end });
  }
  return out;
}

/** The first match at or after `pos` (document order), or null if every match is before it. */
export function matchAtOrAfter(matches: readonly FindMatch[], pos: FindPos): FindMatch | null {
  for (const m of matches) if (cmpFindPos(posOfMatch(m), pos) >= 0) return m;
  return null;
}

/** The last match strictly before `pos` (document order), or null if every match is at or after it. */
export function matchBefore(matches: readonly FindMatch[], pos: FindPos): FindMatch | null {
  for (let i = matches.length - 1; i >= 0; i--) if (cmpFindPos(posOfMatch(matches[i]), pos) < 0) return matches[i];
  return null;
}

/** Index of `active` within `matches` by identity (element + start), or -1 if it is no longer present. */
export function indexOfMatch(matches: readonly FindMatch[], active: FindMatch | null): number {
  return active ? matches.findIndex(m => m.elementId === active.elementId && m.start === active.start) : -1;
}
