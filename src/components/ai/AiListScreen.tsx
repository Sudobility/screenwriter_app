import { useState } from "react";
import { Input } from "@sudobility/components";
import { GROUP_LABEL, useFilteredGroups, type AiAction } from "./actions";

/**
 * The wizard's first screen: a searchable, grouped list of AI actions. Selecting a row pushes that
 * action's options screen (`onOpen`).
 */
export function AiListScreen({ onOpen }: { onOpen(action: AiAction): void }) {
  const [query, setQuery] = useState("");
  const groups = useFilteredGroups(query);

  return (
    <div className="space-y-3" data-testid="ai-action-list">
      <Input
        type="search"
        aria-label="Search AI actions"
        data-testid="ai-action-search"
        placeholder="Search actions…"
        value={query}
        onChange={e => setQuery(e.target.value)}
        className="w-full bg-white"
      />
      {groups.length === 0 && <p className="text-xs text-neutral-500">No actions match “{query}”.</p>}
      {groups.map(({ group, actions }) => (
        <section key={group} className="space-y-1">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">{GROUP_LABEL[group]}</h3>
          <ul className="space-y-1">
            {actions.map(a => (
              <li key={a.id}>
                <button
                  type="button"
                  data-testid={`ai-action-${a.id}`}
                  onClick={() => onOpen(a)}
                  className="w-full text-left border border-neutral-200 rounded p-2 bg-white hover:bg-neutral-100 flex items-start gap-2"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{a.title}</span>
                    <span className="block text-xs text-neutral-600">{a.blurb}</span>
                  </span>
                  <span aria-hidden className="text-neutral-400 mt-0.5">›</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
