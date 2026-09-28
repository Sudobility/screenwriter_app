/**
 * Reading the clipboard for Smart Paste. Styled text (HTML from a word processor, a web page or a PDF viewer) is
 * turned into plain text that keeps what matters for reading a script or notes — paragraphs, line breaks, headings,
 * list items, and whole paragraphs that were bold or centred — as light markers (`# `, `- `, `**...**`, `[center] `)
 * the AI prompts know about. Sending the raw HTML would cost many times the tokens for the same information.
 */

export interface ClipboardText {
  text: string;
  /** True when the text came from the clipboard's styled (HTML) flavour. */
  styled: boolean;
}

const BLOCK = new Set([
  "ADDRESS", "ARTICLE", "ASIDE", "BLOCKQUOTE", "CENTER", "DD", "DIV", "DL", "DT", "FIGCAPTION", "FIGURE", "FOOTER", "H1", "H2", "H3", "H4", "H5",
  "H6", "HEADER", "HR", "LI", "MAIN", "NAV", "OL", "P", "PRE", "SECTION", "TABLE", "TBODY", "TD", "TFOOT", "TH", "THEAD", "TR", "UL",
]);
const SKIP = new Set(["SCRIPT", "STYLE", "HEAD", "META", "LINK", "TITLE", "NOSCRIPT", "TEMPLATE"]);

const styleOf = (el: Element): string => (el.getAttribute("style") ?? "").toLowerCase();

/** Bold as the element itself says; `null` when it says nothing. Google Docs wraps everything in `<b style="font-weight:normal">`. */
function boldOf(el: Element): boolean | null {
  const weight = /font-weight\s*:\s*([a-z0-9]+)/.exec(styleOf(el))?.[1];
  if (weight) return weight === "bold" || weight === "bolder" || Number(weight) >= 600;
  return el.tagName === "B" || el.tagName === "STRONG" ? true : null;
}

function centeredOf(el: Element): boolean {
  return el.tagName === "CENTER" || el.getAttribute("align")?.toLowerCase() === "center" || /text-align\s*:\s*center/.test(styleOf(el));
}

interface Piece {
  text: string;
  bold: boolean;
}

/** HTML from the clipboard as structured plain text. Blocks become paragraphs separated by a blank line. */
export function htmlToStructuredText(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const out: string[] = [];
  let pieces: Piece[] = [];
  let prefix = "";
  let center = false;

  const flush = () => {
    // `\n` inside a block is a hard line break (<br>, <pre>); everything else collapses like HTML does.
    const lines = pieces
      .map(p => p.text)
      .join("")
      .split("\n")
      .map(l => l.replace(/[ \t ]+/g, " ").trim());
    while (lines.length && !lines[0]) lines.shift();
    while (lines.length && !lines[lines.length - 1]) lines.pop();
    const allBold = pieces.some(p => p.text.trim()) && pieces.every(p => p.bold || !p.text.trim());
    pieces = [];
    if (lines.length === 0) return;
    let text = lines.join("\n");
    if (allBold && !prefix) text = `**${text}**`;
    out.push(`${center ? "[center] " : ""}${prefix}${text}`);
  };

  const walk = (node: Node, bold: boolean, pre: boolean) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const raw = node.textContent ?? "";
      pieces.push({ text: pre ? raw : raw.replace(/\s+/g, " "), bold });
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as Element;
    if (SKIP.has(el.tagName)) return;
    if (el.tagName === "BR") {
      pieces.push({ text: "\n", bold });
      return;
    }
    const nowBold = boldOf(el) ?? bold;
    if (!BLOCK.has(el.tagName)) {
      for (const child of el.childNodes) walk(child, nowBold, pre);
      return;
    }
    flush();
    const saved = { prefix, center };
    if (/^H[1-6]$/.test(el.tagName)) prefix = "# ";
    else if (el.tagName === "LI") prefix = "- ";
    if (centeredOf(el)) center = true;
    // A heading is bold by default in every browser; the `# ` marker already says what it is.
    for (const child of el.childNodes) walk(child, nowBold, pre || el.tagName === "PRE");
    flush();
    prefix = saved.prefix;
    center = saved.center;
  };

  walk(doc.body, false, false);
  flush();
  return out.join("\n\n");
}

/** Line endings normalised, trailing spaces and runs of blank lines removed. */
export function tidyPlainText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t ]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Prefer the styled flavour when it yields text; the plain flavour otherwise. */
export function pickClipboardText(html: string | null | undefined, plain: string | null | undefined): ClipboardText {
  if (html?.trim()) {
    const text = tidyPlainText(htmlToStructuredText(html));
    if (text) return { text, styled: true };
  }
  return { text: tidyPlainText(plain ?? ""), styled: false };
}

/**
 * What is on the clipboard now. Throws when the browser does not allow reading it (no permission, or no API such as
 * in Firefox): the caller then offers a box to paste into, which `fromPasteEvent` reads.
 */
export async function readClipboard(): Promise<ClipboardText> {
  const clip = navigator.clipboard;
  if (!clip) throw new Error("This browser does not let a page read the clipboard.");
  if (typeof clip.read === "function") {
    try {
      let html: string | null = null;
      let plain: string | null = null;
      for (const item of await clip.read()) {
        if (html === null && item.types.includes("text/html")) html = await (await item.getType("text/html")).text();
        if (plain === null && item.types.includes("text/plain")) plain = await (await item.getType("text/plain")).text();
      }
      return pickClipboardText(html, plain);
    } catch (e) {
      // `read()` refused or unsupported for this content: the plain flavour may still be readable.
      if (typeof clip.readText !== "function") throw e;
    }
  }
  return pickClipboardText(null, await clip.readText());
}

export function fromPasteEvent(data: DataTransfer | null): ClipboardText {
  return pickClipboardText(data?.getData("text/html"), data?.getData("text/plain"));
}
