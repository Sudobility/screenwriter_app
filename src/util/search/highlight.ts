/**
 * DOM helpers for revealing a search match on a non-script surface: wait for the target UI to mount after a
 * navigation, then scroll it into view and highlight the matched substring. Inputs/textareas use the native
 * text selection (focus + setSelectionRange); read-only text nodes use a document Range.
 */

/** Run `step` after paint, retrying each frame until it returns true or `maxFrames` elapse (target not yet mounted). */
export function afterMount(step: () => boolean, maxFrames = 60): void {
  let frames = 0;
  const tick = () => {
    let done = false;
    try {
      done = step();
    } catch {
      done = true; // never spin forever on a thrown error
    }
    if (done || frames++ >= maxFrames) return;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/** Scroll `el` into view and highlight `[start, end)` of its text. For an input/textarea, `syncValue` (when
 * given) is written first so an uncontrolled field reflects a just-applied Replace before it is highlighted. */
export function highlightInField(el: HTMLElement, start: number, end: number, syncValue?: string): void {
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    if (syncValue !== undefined && el.value !== syncValue) el.value = syncValue;
    el.focus({ preventScroll: true });
    try {
      el.setSelectionRange(start, end);
    } catch {
      /* some input types reject setSelectionRange; the scroll below still reveals the field */
    }
    el.scrollIntoView({ block: "center" });
    return;
  }
  selectTextRange(el, start, end);
  el.scrollIntoView({ block: "center" });
}

/** Select `[start, end)` plain-text offsets inside a read-only element, mapping offsets to its text nodes. */
function selectTextRange(el: HTMLElement, start: number, end: number): void {
  const doc = el.ownerDocument;
  const walker = doc.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let acc = 0;
  let a: { node: Text; offset: number } | null = null;
  let b: { node: Text; offset: number } | null = null;
  for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
    const len = n.data.length;
    if (!a && start <= acc + len) a = { node: n, offset: start - acc };
    if (!b && end <= acc + len) b = { node: n, offset: end - acc };
    acc += len;
    if (a && b) break;
  }
  const sel = doc.getSelection();
  if (!a || !b || !sel) return;
  if (typeof sel.setBaseAndExtent === "function") sel.setBaseAndExtent(a.node, a.offset, b.node, b.offset);
}
