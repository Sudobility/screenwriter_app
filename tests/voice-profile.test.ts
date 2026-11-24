import { describe, it, expect } from "vitest";
import type { VoiceProfile } from "@sudobility/screenwriter_types";
import { readVoiceProfile, voiceProfilePatch } from "../src/util/voice-profile";

const profile: VoiceProfile = {
  summary: "Clipped, wry, defensive.",
  vocabulary: "Short Anglo-Saxon words; avoids jargon.",
  rhythm: "Staccato; sentence fragments under stress.",
  tics: 'Answers questions with questions; says "look" to stall.',
  sample: "Look — you want the truth or the version that lets you sleep?",
};

describe("voice-profile persistence seam", () => {
  it("round-trips a profile through the attributes bag", () => {
    // What EntityDetailView writes, then reads back: patch.attributes IS the merged attributes bag.
    const patch = voiceProfilePatch(profile);
    expect(patch).toEqual({ attributes: { voiceProfile: profile } });
    expect(readVoiceProfile(patch.attributes)).toEqual(profile);
  });

  it("returns null for a missing, empty or non-object bag", () => {
    expect(readVoiceProfile(undefined)).toBeNull();
    expect(readVoiceProfile(null)).toBeNull();
    expect(readVoiceProfile({})).toBeNull();
    expect(readVoiceProfile({ voiceProfile: null })).toBeNull();
    expect(readVoiceProfile("nope")).toBeNull();
  });

  it("rejects a malformed stored value instead of handing back garbage", () => {
    // A future refactor that changes the shape, or a hand-corrupted bag, must not render as a profile.
    expect(readVoiceProfile({ voiceProfile: { summary: 123 } })).toBeNull();
    expect(readVoiceProfile({ voiceProfile: { summary: "ok" } })).toBeNull(); // missing required fields
    expect(
      readVoiceProfile({ voiceProfile: { ...profile, extra: "x" } })
    ).toBeNull(); // strictObject rejects unknown keys
  });

  it("preserves other keys already in the attributes bag (merge semantics)", () => {
    // entity.update merges attributes per key, so reading a bag that also holds skeleton data still works.
    expect(readVoiceProfile({ skeleton: { age: 40 }, voiceProfile: profile })).toEqual(profile);
  });
});
