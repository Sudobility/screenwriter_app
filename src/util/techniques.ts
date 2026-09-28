import type { ElementId } from "@sudobility/writing_core";
import type { ScriptEditorHost } from "@sudobility/writing_ui";
import { insertRows, type InsertResult, type ScriptRow } from "./ai-script";
import { removeElement } from "./format-fix";

/**
 * Common script techniques as they are conventionally written, inserted with one click and filled in by the
 * writer. What the writer must replace is in [SQUARE BRACKETS]; everything else is the convention itself (the slug
 * that opens the device, the slug that closes it, the order of the parts). The conventions follow the usual
 * spec-script practice (Trottier's "Screenwriter's Bible", Final Draft's own templates); where practice varies the
 * most widely read form is used.
 *
 * Slugs that are not scene headings (MONTAGE, INTERCUT, BACK TO SCENE ...) use the template's Shot style: capitals,
 * flush left, not counted or numbered as a scene. A template without one falls back to Action.
 */
export interface Technique {
  id: string;
  label: string;
  /** One line for the menu: when to use it. */
  about: string;
  rows: ScriptRow[];
}

const H = (text: string): ScriptRow => ({ role: "sceneHeading", text });
const S = (text: string): ScriptRow => ({ role: "shot", text });
const A = (text: string): ScriptRow => ({ role: "action", text });
const C = (text: string): ScriptRow => ({ role: "character", text });
const P = (text: string): ScriptRow => ({ role: "parenthetical", text });
const D = (text: string): ScriptRow => ({ role: "dialogue", text });

export const TECHNIQUES: Technique[] = [
  {
    id: "montage",
    label: "Montage",
    about: "Short moments in several places that together show time passing or something being achieved.",
    rows: [
      S("MONTAGE - [WHAT IT SHOWS]"),
      A("-- [PLACE] -- [What we see.]"),
      A("-- [PLACE] -- [What we see.]"),
      A("-- [PLACE] -- [What we see.]"),
      S("END MONTAGE"),
    ],
  },
  {
    id: "series-of-shots",
    label: "Series of shots",
    about: "Quick shots in one place or of one event, in order, that carry a single piece of action.",
    rows: [S("SERIES OF SHOTS - [WHAT HAPPENS]"), A("A) [What we see.]"), A("B) [What we see.]"), A("C) [What we see.]"), S("END SERIES OF SHOTS")],
  },
  {
    id: "intercut",
    label: "Intercut",
    about: "Two scenes in different places played as one, cutting freely between them.",
    rows: [
      H("INT. [PLACE ONE] - [DAY/NIGHT]"),
      A("[Who is here and what they are doing.]"),
      H("INT. [PLACE TWO] - [DAY/NIGHT]"),
      A("[Who is here and what they are doing.]"),
      S("INTERCUT - [PLACE ONE] / [PLACE TWO]"),
      C("[CHARACTER ONE]"),
      D("[What they say.]"),
      C("[CHARACTER TWO]"),
      D("[What they answer.]"),
      S("END INTERCUT"),
    ],
  },
  {
    id: "crosscut",
    label: "Crosscutting (parallel action)",
    about: "Two lines of action happening at the same time, building toward each other.",
    rows: [
      H("EXT. [PLACE ONE] - [DAY/NIGHT]"),
      A("[The first line of action begins.]"),
      H("INT. [PLACE TWO] - SAME TIME"),
      A("[The second line of action begins.]"),
      S("CROSSCUT BETWEEN [PLACE ONE] AND [PLACE TWO]"),
      A("[PLACE ONE]: [The next beat.]"),
      A("[PLACE TWO]: [The next beat.]"),
      A("[PLACE ONE]: [The beat where the two lines meet or one overtakes the other.]"),
      S("END CROSSCUT"),
    ],
  },
  {
    id: "parallel-scenes",
    label: "Parallel scenes",
    about: "Two complete scenes that mirror each other, played one after the other.",
    rows: [
      H("INT. [PLACE ONE] - [DAY/NIGHT]"),
      A("[What happens here.]"),
      C("[CHARACTER ONE]"),
      D("[The line the other scene will echo.]"),
      H("INT. [PLACE TWO] - SAME TIME"),
      A("[The same situation, in its own way.]"),
      C("[CHARACTER TWO]"),
      D("[The echo: the same line, or its opposite.]"),
    ],
  },
  {
    id: "split-screen",
    label: "Split screen",
    about: "Two places on screen at once, side by side.",
    rows: [
      S("SPLIT SCREEN - [PLACE ONE] / [PLACE TWO]"),
      A("LEFT: [What we see in the first place.]"),
      A("RIGHT: [What we see in the second place.]"),
      S("END SPLIT SCREEN"),
    ],
  },
  {
    id: "time-lapse",
    label: "Time-lapse",
    about: "One place, time running fast: hours or seasons in a few seconds.",
    rows: [S("TIME LAPSE - [PLACE]"), A("[What changes as time runs: the light, the crowd, the weather.]"), A("[How it looks when time slows again, and how long has passed.]"), S("END TIME LAPSE")],
  },
  {
    id: "flashback",
    label: "Flashback sequence",
    about: "One or more scenes from the past, clearly opened and closed.",
    rows: [
      S("BEGIN FLASHBACK:"),
      H("INT. [PLACE] - [DAY/NIGHT] - [YEAR, OR HOW LONG AGO]"),
      A("[What happened then.]"),
      C("[CHARACTER]"),
      D("[What was said.]"),
      S("END FLASHBACK."),
      H("INT. [PLACE WE LEFT] - PRESENT DAY"),
      A("[Back where we were.]"),
    ],
  },
  {
    id: "phone-both",
    label: "Phone call (both sides seen)",
    about: "We see both people: set up each place once, then intercut.",
    rows: [
      H("INT. [CALLER'S PLACE] - [DAY/NIGHT]"),
      A("[CALLER] dials. It rings."),
      H("INT. [OTHER PLACE] - SAME TIME"),
      A("[OTHER CHARACTER] picks up."),
      S("INTERCUT PHONE CONVERSATION"),
      C("[OTHER CHARACTER]"),
      D("[How they answer.]"),
      C("[CALLER]"),
      D("[Why they are calling.]"),
      S("END INTERCUT"),
    ],
  },
  {
    id: "phone-one",
    label: "Phone call (one side heard)",
    about: "We stay with one person; the other is only a voice on the line.",
    rows: [
      A("[CHARACTER] answers the phone."),
      C("[CHARACTER]"),
      P("(into phone)"),
      D("[What they say.]"),
      C("[OTHER CHARACTER] (V.O.)"),
      P("(over phone)"),
      D("[What we hear from the other end.]"),
      A("[CHARACTER] hangs up."),
    ],
  },
  {
    id: "news",
    label: "News broadcast",
    about: "A report on a screen in the scene.",
    rows: [
      S("ON TV - NEWS BROADCAST"),
      A("[What the picture shows.] A banner reads: \"[HEADLINE]\"."),
      C("[ANCHOR] (ON TV)"),
      D("[What is reported.]"),
      S("BACK TO SCENE"),
    ],
  },
  {
    id: "social-media",
    label: "Text message / social media",
    about: "What a character reads or writes on a phone or computer screen.",
    rows: [
      S("INSERT - [CHARACTER]'S PHONE"),
      A("A message from [NAME]: \"[What it says.]\""),
      A("[CHARACTER] types: \"[The reply.]\" Hesitates. Sends it."),
      S("BACK TO SCENE"),
    ],
  },
];

export const techniqueById = (id: string): Technique | undefined => TECHNIQUES.find(t => t.id === id);

/** The placeholders of a text, in order: what the writer still has to fill in. */
export const placeholdersIn = (text: string): string[] => text.match(/\[[^\][]+\]/g) ?? [];

/**
 * Insert a technique at the caret: after the element the caret is in, never inside it. An empty line at the caret
 * (the writer pressed Enter and then chose a technique) is replaced, not left behind. Without a caret it goes to
 * the end of the script. Returns the first inserted element, to put the caret there.
 */
export function insertTechnique(host: ScriptEditorHost, technique: Technique, atElementId?: string | null): InsertResult {
  const at = atElementId ? host.model.element(atElementId as ElementId) : undefined;
  const emptyLine = !!at && !at.text.plain.trim() && host.model.elementCount() > 1;
  const r = insertRows(host, technique.rows, null, at ? String(at.id) : null);
  if (emptyLine && r.written > 0) removeElement(host, String(at!.id));
  return r;
}
