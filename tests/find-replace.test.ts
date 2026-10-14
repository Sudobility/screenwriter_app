import { describe, expect, it } from "vitest";
import { findMatches, matchAtOrAfter, matchBefore, indexOfMatch, type FindElement, type FindMatch } from "../src/util/find-replace";

const doc: FindElement[] = [
  { id: "el_a", plain: "INT. HOUSE - DAY" },
  { id: "el_b", plain: "Bob opens the door. Bob waits. bob." },
  { id: "el_c", plain: "BOB" },
  { id: "el_d", plain: "Where is the dayroom today, Day?" },
];

const starts = (ms: FindMatch[]) => ms.map(m => `${m.elementId}:${m.start}`);

describe("findMatches", () => {
  it("finds every occurrence across elements, in reading order, case-insensitive by default", () => {
    const ms = findMatches(doc, "bob", { caseSensitive: false, wholeWord: false });
    expect(starts(ms)).toEqual(["el_b:0", "el_b:20", "el_b:31", "el_c:0"]);
    expect(ms[0]).toMatchObject({ order: 1, start: 0, end: 3 });
  });

  it("respects case sensitivity", () => {
    const ms = findMatches(doc, "BOB", { caseSensitive: true, wholeWord: false });
    expect(starts(ms)).toEqual(["el_c:0"]);
  });

  it("respects whole-word matching (unicode word boundaries)", () => {
    // "day" appears inside DAY, dayroom, today and as the standalone word "Day".
    const loose = findMatches(doc, "day", { caseSensitive: false, wholeWord: false });
    expect(starts(loose)).toEqual(["el_a:13", "el_d:13", "el_d:23", "el_d:28"]);
    const whole = findMatches(doc, "day", { caseSensitive: false, wholeWord: true });
    // Only "DAY" (end of el_a) and the trailing "Day" in el_d are whole words.
    expect(starts(whole)).toEqual(["el_a:13", "el_d:28"]);
  });

  it("returns nothing for an empty query", () => {
    expect(findMatches(doc, "", { caseSensitive: false, wholeWord: false })).toEqual([]);
  });

  it("does not loop forever on an empty-string edge and advances past each hit", () => {
    const ms = findMatches([{ id: "x", plain: "aaaa" }], "aa", { caseSensitive: false, wholeWord: false });
    // Non-overlapping scan: positions 0 and 2.
    expect(starts(ms)).toEqual(["x:0", "x:2"]);
  });
});

describe("navigation (matchAtOrAfter / matchBefore)", () => {
  const ms = findMatches(doc, "bob", { caseSensitive: false, wholeWord: false }); // el_b:0, el_b:20, el_b:31, el_c:0

  it("finds the first match at or after a position (Find Next from the caret)", () => {
    expect(matchAtOrAfter(ms, { order: 0, offset: 0 })).toMatchObject({ elementId: "el_b", start: 0 });
    // A caret exactly on a match start includes that match.
    expect(matchAtOrAfter(ms, { order: 1, offset: 20 })).toMatchObject({ elementId: "el_b", start: 20 });
    // Past a match start moves to the next.
    expect(matchAtOrAfter(ms, { order: 1, offset: 21 })).toMatchObject({ elementId: "el_b", start: 31 });
    // Nothing after the last match -> null (the caller wraps to the first).
    expect(matchAtOrAfter(ms, { order: 3, offset: 0 })).toBeNull();
  });

  it("finds the last match strictly before a position (Find Previous from the caret)", () => {
    expect(matchBefore(ms, { order: 2, offset: 0 })).toMatchObject({ elementId: "el_b", start: 31 });
    // Strictly before: a caret on a match start skips it to the earlier one.
    expect(matchBefore(ms, { order: 1, offset: 20 })).toMatchObject({ elementId: "el_b", start: 0 });
    // Nothing before the first match -> null (the caller wraps to the last).
    expect(matchBefore(ms, { order: 1, offset: 0 })).toBeNull();
  });

  it("locates an active match by identity, surviving list recomputation", () => {
    const recomputed = [...ms];
    expect(indexOfMatch(recomputed, ms[2])).toBe(2);
    expect(indexOfMatch(recomputed, { elementId: "el_b", order: 1, start: 99, end: 102 })).toBe(-1);
    expect(indexOfMatch(recomputed, null)).toBe(-1);
  });
});
