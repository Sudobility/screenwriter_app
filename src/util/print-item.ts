import type { EntityView } from "@sudobility/writing_core";
import { cssFontFamily, type ScriptEditorHost } from "@sudobility/writing_ui";
import { getOwnSkeleton, getStages, SKELETON_SECTIONS, stageLabel, type Skeleton } from "./character-skeleton";
import { kindLabel } from "./entity-kind-labels";
import { isNote } from "./notes";
import { getPlotMain, getSubplots, getSynopsis, getTagline, getTheme, isStoryEntity } from "./story-info";

/**
 * Printing what the writer wrote in the Catalog (per an explicit user requirement: whatever is entered as a
 * paragraph can be printed): a note, a description, a synopsis, a plot, a character's skeleton. An item is laid out
 * as a plain document (title, headed sections of text) and printed on its own, without the app around it.
 */
export interface PrintSection {
  heading?: string;
  /** Short facts shown as "Label: value" lines. */
  facts?: { label: string; value: string }[];
  /** Paragraph text, line breaks kept. */
  text?: string;
}

export interface PrintFont {
  /** A CSS font-family list. */
  family: string;
  sizePt: number;
}

export interface PrintDoc {
  title: string;
  subtitle?: string;
  sections: PrintSection[];
  /** The script's own font: a printed item looks like a page of the script it belongs to. */
  font: PrintFont;
}

/** What the script is set in when its template does not say: 12 pt Courier, the screenplay standard. */
export const DEFAULT_PRINT_FONT: PrintFont = { family: '"Courier Prime", "Courier New", Courier, monospace', sizePt: 12 };

/**
 * The font of the script's body text: the template's Action style (what most of a script is set in), else its
 * root style. The same family and size the editor and the printed pages use, so it follows the template.
 */
export function scriptFont(host: ScriptEditorHost): PrintFont {
  try {
    const template = host.model.template();
    const body = template.styles.find(s => s.role === "action")?.id ?? template.defaults.root;
    const el = host.model.elements().find(e => e.style === body);
    const font = el ? host.model.resolveStyle(el.id).font : undefined;
    const fallback = template.styles.find(s => s.id === body)?.font ?? template.styles.find(s => s.id === template.defaults.root)?.font;
    const family = font?.family ?? fallback?.family;
    const size = font?.size ?? fallback?.size;
    const css = family ? cssFontFamily(family) : "inherit";
    return { family: css === "inherit" ? DEFAULT_PRINT_FONT.family : css, sizePt: typeof size === "number" && size > 0 ? size : DEFAULT_PRINT_FONT.sizePt };
  } catch {
    return DEFAULT_PRINT_FONT;
  }
}

const filled = (s: string | undefined | null): s is string => !!s && s.trim().length > 0;

/** A skeleton as sections: one per part (Physical, Social, Psychological), short fields as facts, long ones as text. */
function skeletonSections(skeleton: Skeleton, prefix = ""): PrintSection[] {
  const out: PrintSection[] = [];
  for (const section of Object.values(SKELETON_SECTIONS)) {
    const short = section.fields.filter(f => !f.multiline && filled(skeleton[f.key]));
    const long = section.fields.filter(f => f.multiline && filled(skeleton[f.key]));
    if (short.length === 0 && long.length === 0) continue;
    // A part's own heading only when it has short facts to put under it: no heading over nothing.
    if (short.length > 0) out.push({ heading: `${prefix}${section.title}`, facts: short.map(f => ({ label: f.label, value: skeleton[f.key]!.trim() })) });
    for (const f of long) out.push({ heading: `${prefix}${f.label}`, text: skeleton[f.key]!.trim() });
  }
  return out;
}

/** True when the item has a paragraph field at all: the items that get a Print button. */
export function hasParagraphs(entity: EntityView, itemKey: string | null): boolean {
  if (isStoryEntity(entity)) return itemKey === "synopsis" || itemKey === "plot" || !!itemKey?.startsWith("subplot:");
  return true; // a note's body, a description, a skeleton's long fields
}

/**
 * The item as a document, or null when nothing has been written in it yet. `itemKey` is the life stage of a
 * character or the story item ("synopsis", "plot", "subplot:<id>"), as in the editor's selection.
 */
export function printableFor(host: ScriptEditorHost, entityId: string, itemKey: string | null, scriptTitle?: string): PrintDoc | null {
  const content = contentFor(host, entityId, itemKey, scriptTitle);
  return content ? { ...content, font: scriptFont(host) } : null;
}

function contentFor(host: ScriptEditorHost, entityId: string, itemKey: string | null, scriptTitle?: string): Omit<PrintDoc, "font"> | null {
  const entity = host.model.entity(entityId as never);
  if (!entity) return null;
  const from = scriptTitle?.trim() ? ` · ${scriptTitle.trim()}` : "";

  if (isStoryEntity(entity)) {
    const subplots = getSubplots(entity);
    if (itemKey === "synopsis") return filled(getSynopsis(entity)) ? { title: "Synopsis", subtitle: `Story${from}`, sections: [{ text: getSynopsis(entity).trim() }] } : null;
    if (itemKey?.startsWith("subplot:")) {
      const s = subplots.find(x => x.id === itemKey.slice("subplot:".length));
      return s && filled(s.text) ? { title: s.name, subtitle: `Subplot${from}`, sections: [{ text: s.text.trim() }] } : null;
    }
    if (itemKey === "plot") {
      const sections: PrintSection[] = [
        ...(filled(getTheme(entity)) || filled(getTagline(entity))
          ? [{ facts: [...(filled(getTheme(entity)) ? [{ label: "Theme", value: getTheme(entity).trim() }] : []), ...(filled(getTagline(entity)) ? [{ label: "Tagline", value: getTagline(entity).trim() }] : [])] }]
          : []),
        ...(filled(getPlotMain(entity)) ? [{ heading: "Main plot", text: getPlotMain(entity).trim() }] : []),
        ...subplots.filter(s => filled(s.text)).map(s => ({ heading: `Subplot: ${s.name}`, text: s.text.trim() })),
      ];
      return sections.some(s => s.text) ? { title: "Plot", subtitle: `Story${from}`, sections } : null;
    }
    return null;
  }

  if (isNote(entity)) {
    const body = entity.description.plain;
    return filled(body) ? { title: entity.name, subtitle: `Note${from}`, sections: [{ text: body.trim() }] } : null;
  }

  if (entity.kind === "character") {
    const stages = getStages(entity);
    const aliases = entity.aliases.length ? [{ facts: [{ label: "Also known as", value: entity.aliases.join(", ") }] }] : [];
    if (itemKey) {
      const stage = stages.find(s => s.id === itemKey);
      const sections = stage ? skeletonSections(stage.skeleton) : [];
      return stage && sections.length ? { title: entity.name, subtitle: `Character · Age ${stageLabel(stage)}${from}`, sections } : null;
    }
    const sections = stages.length > 0 ? stages.flatMap(s => skeletonSections(s.skeleton, `Age ${stageLabel(s)} · `)) : skeletonSections(getOwnSkeleton(entity));
    return sections.length ? { title: entity.name, subtitle: `Character${from}`, sections: [...aliases, ...sections] } : null;
  }

  const description = entity.description.plain;
  return filled(description) ? { title: entity.name, subtitle: `${kindLabel(entity.kind)}${from}`, sections: [{ heading: "Description", text: description.trim() }] } : null;
}

/** The document as DOM, built with text nodes only: nothing the writer typed is ever parsed as markup. */
export function renderPrintDoc(doc: PrintDoc, document_: Document = document): HTMLElement {
  const el = (tag: string, cls: string, text?: string) => {
    const n = document_.createElement(tag);
    n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  };
  const root = el("article", "print-doc");
  root.setAttribute("data-testid", "print-doc");
  // On the element itself: everything in it (title, headings, text) is set in the script's font.
  root.style.fontFamily = doc.font.family;
  root.style.fontSize = `${doc.font.sizePt}pt`;
  root.append(el("h1", "print-doc-title", doc.title));
  if (doc.subtitle) root.append(el("p", "print-doc-subtitle", doc.subtitle));
  for (const s of doc.sections) {
    const section = el("section", "print-doc-section");
    if (s.heading) section.append(el("h2", "print-doc-heading", s.heading));
    for (const f of s.facts ?? []) {
      const line = el("p", "print-doc-fact");
      line.append(el("span", "print-doc-label", `${f.label}: `), document_.createTextNode(f.value));
      section.append(line);
    }
    for (const para of (s.text ?? "").split(/\n{2,}/).filter(p => p.trim())) section.append(el("p", "print-doc-text", para));
    root.append(section);
  }
  return root;
}

/** Print a document on its own: it goes under <body>, the app is hidden in print, and it is taken away afterwards. */
export function printDoc(doc: PrintDoc): void {
  document.querySelectorAll(".print-doc").forEach(n => n.remove());
  const node = renderPrintDoc(doc);
  document.body.append(node);
  document.body.classList.add("printing-doc");
  const done = () => {
    window.removeEventListener("afterprint", done);
    node.remove();
    document.body.classList.remove("printing-doc");
  };
  window.addEventListener("afterprint", done);
  window.print();
}
