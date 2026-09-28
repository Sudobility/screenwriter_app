import { useEffect, useState, type ReactNode } from "react";
import { SKELETON_SECTIONS, type Skeleton, type SkeletonFieldDef, type SkeletonSection } from "../util/character-skeleton";

const fieldInput = "border border-neutral-300 rounded px-2 py-1 text-sm bg-white text-neutral-900";
const chip = "text-xs border border-dashed border-neutral-300 rounded-full px-2 py-0.5 text-neutral-500 hover:border-neutral-400 hover:text-neutral-700 hover:bg-neutral-50";

/** One click per field, not a menu to open and then pick from (that was the original design — a
 * `Select` of remaining fields — but "open the menu, then pick" is two clicks to reveal one input,
 * which is exactly the friction a user flagged). Direct chip buttons reveal a field in one click. */
function AddFieldChips({ fields, onAdd }: { fields: SkeletonFieldDef[]; onAdd(key: string): void }) {
  return (
    <div className="mt-2 flex flex-wrap gap-1.5" data-testid="skeleton-add-field-chips">
      {fields.map(f => (
        <button key={f.key} type="button" className={chip} data-testid={`skeleton-add-field-${f.key}`} onClick={() => onAdd(f.key)}>
          + {f.label}
        </button>
      ))}
    </div>
  );
}

/**
 * The structured skeleton form (Physical/Social/Psychological), per an explicit user requirement:
 * only Age is required, everything else is optional and shown on demand (one-click "+ {label}" chips
 * per section) rather than as ~30 empty inputs at once — and removable again (except Age), clearing
 * the stored value so it doesn't reappear on its own next time (seeded visibility below is driven by
 * "has a non-empty stored value"). Pure — the caller (`EntityDetailView`) owns reading/writing the
 * skeleton via `entity.update`; give this component a fresh `key` (entity id + stage id) when the
 * subject changes so its "which fields are visible" state resets instead of leaking between subjects.
 * The remove control is a "×" inside the field itself (not a separate button beside it) — matches the
 * familiar "clearable input" affordance and keeps the remove action visually attached to its field.
 *
 * `socialExtra` (per an explicit user requirement — "make Aliases part of social skeleton") renders
 * inside the Social section, above its own fields, rather than as its own separate section elsewhere:
 * `EntityDetailView` passes the Aliases editor there only when this skeleton is a character's own
 * (un-staged) skeleton, since aliases are a real entity-level thing (`entity.aliases`), not a per-stage
 * one — it stays a standalone section instead in the two places this component *isn't* on screen (a
 * staged character's "Life stages" list, and non-character kinds), so it's never simply unreachable.
 */
export function CharacterSkeletonEditor({
  skeleton,
  onFieldCommit,
  socialExtra,
}: {
  skeleton: Skeleton;
  onFieldCommit(key: string, value: string): void;
  socialExtra?: ReactNode;
}) {
  const [visible, setVisible] = useState<Set<string>>(() => {
    const v = new Set<string>(["age"]);
    for (const section of Object.values(SKELETON_SECTIONS)) for (const f of section.fields) if (skeleton[f.key]?.trim()) v.add(f.key);
    return v;
  });

  // A field filled from outside this form (Smart Paste, a collaborator) shows up without a remount: it becomes
  // visible here, and its input below is keyed on "has a stored value" so it takes the new value.
  const filledKeys = Object.keys(skeleton)
    .filter(k => skeleton[k]?.trim())
    .sort()
    .join(",");
  useEffect(() => {
    const filled = filledKeys ? filledKeys.split(",") : [];
    setVisible(v => (filled.every(k => v.has(k)) ? v : new Set([...v, ...filled])));
  }, [filledKeys]);

  const removeField = (key: string) => {
    onFieldCommit(key, "");
    setVisible(v => {
      const next = new Set(v);
      next.delete(key);
      return next;
    });
  };

  return (
    <div className="space-y-6" data-testid="skeleton-editor">
      {(Object.entries(SKELETON_SECTIONS) as [SkeletonSection, (typeof SKELETON_SECTIONS)[SkeletonSection]][]).map(([sectionKey, section]) => {
        const shown = section.fields.filter(f => visible.has(f.key));
        const remaining = section.fields.filter(f => !visible.has(f.key));
        let lastGroup: string | undefined;
        return (
          <section key={sectionKey} data-testid="skeleton-section" data-section={sectionKey}>
            <h4 className="text-xs font-semibold uppercase text-neutral-500 mb-2">{section.title}</h4>
            {sectionKey === "social" && socialExtra && <div className="mb-3">{socialExtra}</div>}
            <div className="space-y-3">
              {shown.map(f => {
                const showGroup = f.group !== undefined && f.group !== lastGroup;
                lastGroup = f.group;
                return (
                  <div key={f.key}>
                    {showGroup && <p className="text-xs italic text-neutral-400 mb-1">{f.group}</p>}
                    <label className="flex flex-col text-xs text-neutral-500">
                      {f.label}
                      {f.required && (
                        <span className="text-red-600" aria-hidden="true">
                          {" "}
                          *
                        </span>
                      )}
                      <div className="relative">
                        {f.multiline ? (
                          <textarea
                            key={skeleton[f.key]?.trim() ? "filled" : "blank"}
                            spellCheck={!["age", "height", "weight"].includes(f.key)}
                            autoCorrect="off"
                            rows={2}
                            data-testid={`skeleton-field-${f.key}`}
                            className={`${fieldInput} w-full ${f.required ? "" : "pr-6"}`}
                            defaultValue={skeleton[f.key] ?? ""}
                            onBlur={e => onFieldCommit(f.key, e.target.value)}
                          />
                        ) : (
                          <input
                            key={skeleton[f.key]?.trim() ? "filled" : "blank"}
                            spellCheck={!["age", "height", "weight"].includes(f.key)}
                            autoCorrect="off"
                            data-testid={`skeleton-field-${f.key}`}
                            className={`${fieldInput} w-full ${f.required ? "" : "pr-6"}`}
                            defaultValue={skeleton[f.key] ?? ""}
                            onBlur={e => onFieldCommit(f.key, e.target.value)}
                          />
                        )}
                        {!f.required && (
                          <button
                            type="button"
                            className={`absolute right-1.5 ${f.multiline ? "top-1.5" : "top-1/2 -translate-y-1/2"} text-neutral-400 hover:text-red-600 leading-none`}
                            data-testid={`skeleton-remove-${f.key}`}
                            aria-label={`Remove ${f.label}`}
                            onClick={() => removeField(f.key)}
                          >
                            &times;
                          </button>
                        )}
                      </div>
                    </label>
                  </div>
                );
              })}
            </div>
            {remaining.length > 0 && <AddFieldChips fields={remaining} onAdd={key => setVisible(v => new Set(v).add(key))} />}
          </section>
        );
      })}
    </div>
  );
}
