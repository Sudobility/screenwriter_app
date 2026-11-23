import type { ScriptEditorHost } from "@sudobility/writing_ui";
import type { VoiceProfile } from "@sudobility/screenwriter_types";
import { useAiActions } from "../hooks/useAiActions";
import { characterLines } from "../util/character-lines";
import { AiNotices } from "./AiNotices";

const button = "rounded border border-neutral-300 bg-white px-3 py-1.5 text-sm hover:bg-neutral-100 disabled:opacity-40";

const FIELDS: { key: keyof VoiceProfile; label: string }[] = [
  { key: "summary", label: "Summary" },
  { key: "vocabulary", label: "Vocabulary" },
  { key: "rhythm", label: "Rhythm" },
  { key: "tics", label: "Habits" },
  { key: "sample", label: "Sample line" },
];

/**
 * A character's "voice profile": how they speak, generated from their own lines in the script and stored on the
 * character entity (fields.voiceProfile). A reference for keeping dialogue consistent — it does not change the script.
 */
export function VoiceProfileBox({ host, name, aliases, value, onChange }: {
  host: ScriptEditorHost;
  name: string;
  aliases: string[];
  value: VoiceProfile | null;
  onChange(profile: VoiceProfile): void;
}) {
  const ai = useAiActions();

  const generate = async () => {
    const lines = characterLines(host, [name, ...aliases]);
    if (lines.length === 0) return;
    const res = await ai.run(client => client.voiceProfile({ name, lines }));
    if (res) onChange(res.result);
  };

  const lineCount = characterLines(host, [name, ...aliases]).length;

  return (
    <section className="space-y-2" data-testid="voice-profile-box">
      <h4 className="text-xs font-semibold uppercase text-neutral-500">Voice profile</h4>
      <p className="text-xs text-neutral-600">How this character speaks, from their {lineCount} line{lineCount === 1 ? "" : "s"} in the script. A reference only — it never changes the script.</p>
      <button
        className={button}
        data-testid="voice-profile-generate"
        disabled={ai.busy || !ai.available || lineCount === 0}
        onClick={() => void generate()}
      >
        {ai.busy ? "Analysing…" : lineCount === 0 ? "No dialogue yet" : value ? "Regenerate" : "Generate voice profile"}
      </button>
      <AiNotices ai={ai} showTestBanner={false} />
      {value && (
        <dl className="space-y-1 rounded border border-neutral-200 bg-white p-2 text-xs" data-testid="voice-profile-view">
          {FIELDS.map(f => (
            value[f.key] ? (
              <div key={f.key}>
                <dt className="font-semibold text-neutral-500">{f.label}</dt>
                <dd className="whitespace-pre-wrap text-neutral-800" data-testid={`voice-profile-${f.key}`}>{value[f.key]}</dd>
              </div>
            ) : null
          ))}
        </dl>
      )}
    </section>
  );
}
