import { voiceProfileModelSchema, type VoiceProfile } from "@sudobility/screenwriter_types";

/**
 * Character voice profiles are stored in the open `attributes` bag on the character entity
 * (`attributes.voiceProfile`) rather than in `fields`, because writing_core whitelists `fields`
 * per entity-kind and would silently drop an unknown key, whereas `attributes` is an open record.
 *
 * Nothing validates that bag on the way in, so reads go through {@link readVoiceProfile}, which
 * parses against the canonical schema and returns `null` for anything missing or malformed — a
 * safe fallback that a blind `as VoiceProfile` cast did not give. Writes go through
 * {@link voiceProfilePatch} so the attribute key lives in exactly one place.
 */
export function readVoiceProfile(attributes: unknown): VoiceProfile | null {
  if (!attributes || typeof attributes !== "object") return null;
  const raw = (attributes as Record<string, unknown>).voiceProfile;
  if (raw === undefined || raw === null) return null;
  const parsed = voiceProfileModelSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/** The `entity.update` patch that persists a voice profile under `attributes.voiceProfile`. */
export function voiceProfilePatch(value: VoiceProfile): { attributes: { voiceProfile: VoiceProfile } } {
  return { attributes: { voiceProfile: value } };
}
