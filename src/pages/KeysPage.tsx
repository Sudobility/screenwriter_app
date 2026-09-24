import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import type { ApiKeySummary } from "@sudobility/screenwriter_types";
import { useApiKeys } from "@sudobility/screenwriter_lib";
import { FormModal } from "@sudobility/components";
import { useLang } from "../hooks/useLang";
import { API_URL } from "../config";
import { mcpAddCommand, mcpJsonConfig } from "../util/mcp-config";

const btn = "border border-neutral-300 rounded px-3 py-1 text-sm hover:bg-neutral-100 disabled:opacity-50";
const primary = "bg-neutral-900 text-white rounded px-3 py-1 text-sm disabled:opacity-50";

const statusOf = (k: ApiKeySummary): "revoked" | "expired" | "active" =>
  k.revokedAt ? "revoked" : k.expiresAt && Date.parse(k.expiresAt) <= Date.now() ? "expired" : "active";
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : "never");
const SCOPE_LABEL = { read: "Read only", read_write: "Read and write" } as const;

function CopyButton({ text, label, testId }: { text: string; label: string; testId: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setState("copied");
    } catch {
      setState("failed");
    }
    setTimeout(() => setState("idle"), 2500);
  };
  return (
    <button type="button" className={btn} data-testid={testId} onClick={() => void copy()}>
      {state === "copied" ? "Copied" : state === "failed" ? "Copy failed: select it and copy by hand" : label}
    </button>
  );
}

function ConnectSection({ revealedKey }: { revealedKey: string | null }) {
  const json = mcpJsonConfig(API_URL, revealedKey);
  const cmd = mcpAddCommand(API_URL, revealedKey);
  return (
    <section className="mt-8" data-testid="mcp-connect">
      <h3 className="text-lg font-semibold mb-1">Connect an MCP client</h3>
      <p className="text-sm text-neutral-600 mb-3">
        Lets Claude Desktop, Claude Code or any MCP client read and edit your scripts. You need{" "}
        <a className="underline" href="https://bun.sh" target="_blank" rel="noreferrer">
          Bun
        </a>{" "}
        and a clone of the <code>screenwriter_api_mcp</code> repo; replace <code>/path/to/screenwriter_api_mcp</code> with where it lives.
        {revealedKey ? "" : " Create a key above and it is filled in here while it is shown; until then this uses the placeholder fwk_..."}
      </p>
      <div className="mb-3">
        <div className="flex items-center gap-2 mb-1">
          <h4 className="text-sm font-medium">Claude Desktop or Claude Code (JSON)</h4>
          <CopyButton text={json} label="Copy JSON" testId="copy-mcp-json" />
        </div>
        <pre data-testid="mcp-json" className="bg-neutral-900 text-neutral-100 text-xs rounded p-3 overflow-auto">{json}</pre>
      </div>
      <div>
        <div className="flex items-center gap-2 mb-1">
          <h4 className="text-sm font-medium">Claude Code, one line</h4>
          <CopyButton text={cmd} label="Copy command" testId="copy-mcp-cmd" />
        </div>
        <pre data-testid="mcp-cmd" className="bg-neutral-900 text-neutral-100 text-xs rounded p-3 overflow-auto whitespace-pre-wrap break-all">{cmd}</pre>
      </div>
    </section>
  );
}

export function KeysPage() {
  const k = useApiKeys();
  const lang = useLang();
  const [name, setName] = useState("");
  const [scope, setScope] = useState<"read" | "read_write">("read_write");
  const [ai, setAi] = useState(false);
  const [expiry, setExpiry] = useState("");
  const [confirming, setConfirming] = useState<ApiKeySummary | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const ok = await k.create({ name, scope, ai, ...(expiry ? { expiresInDays: Number(expiry) } : {}) });
    if (ok) setName("");
  };

  return (
    <>
      <div className="flex items-center gap-3 mb-4">
        <h2 className="text-xl font-semibold">API keys</h2>
        <Link to={`/${lang}/projects`} className="ml-auto text-sm text-neutral-600 hover:underline">
          Back to projects
        </Link>
      </div>
      <p className="text-sm text-neutral-600 mb-4">
        Personal keys let scripts and MCP clients act as you on your personal workspace. Treat a key like a password.
      </p>

      {k.error && (
        <p role="alert" data-testid="keys-error" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2 mb-3">
          {k.error.message}{" "}
          <button className="underline" onClick={k.clearError}>
            Dismiss
          </button>
        </p>
      )}

      {k.revealed && (
        <section data-testid="key-reveal" className="border-2 border-amber-400 bg-amber-50 rounded p-4 mb-4">
          <h3 className="font-semibold mb-1">Your new key: {k.revealed.name}</h3>
          <p className="text-sm text-amber-900 mb-2">
            <strong>You won't be able to see this key again.</strong> Copy it now and store it somewhere safe. Closing this panel removes it from
            the page for good; if you lose it, revoke it and create a new one.
          </p>
          <div className="flex items-center gap-2">
            <code data-testid="revealed-key" className="flex-1 bg-white border border-amber-300 rounded px-2 py-1.5 text-sm break-all select-all">
              {k.revealed.key}
            </code>
            <CopyButton text={k.revealed.key} label="Copy key" testId="copy-key" />
          </div>
          <div className="mt-3">
            <button className={primary} data-testid="dismiss-reveal" onClick={k.dismissReveal}>
              I have saved it, hide this key
            </button>
          </div>
        </section>
      )}

      <form onSubmit={submit} className="bg-white border border-neutral-200 rounded p-4 flex flex-wrap items-end gap-3 mb-6" data-testid="key-form">
        <label className="flex-1 min-w-48 text-sm">
          <span className="block text-neutral-600 mb-1">Name</span>
          <input
            aria-label="Key name"
            required
            maxLength={60}
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. Claude Desktop on my laptop"
            className="w-full border border-neutral-300 rounded px-3 py-1.5"
          />
        </label>
        <label className="text-sm">
          <span className="block text-neutral-600 mb-1">Access</span>
          <select aria-label="Key access" value={scope} onChange={e => setScope(e.target.value as "read" | "read_write")} className="border border-neutral-300 rounded px-2 py-1.5">
            <option value="read_write">Read and write</option>
            <option value="read">Read only</option>
          </select>
        </label>
        <label className="text-sm">
          <span className="block text-neutral-600 mb-1">Expires</span>
          <select aria-label="Key expiry" value={expiry} onChange={e => setExpiry(e.target.value)} className="border border-neutral-300 rounded px-2 py-1.5">
            <option value="">Never</option>
            <option value="30">In 30 days</option>
            <option value="90">In 90 days</option>
            <option value="365">In 1 year</option>
          </select>
        </label>
        <label className="text-sm flex items-center gap-1.5 pb-2">
          <input type="checkbox" checked={ai} onChange={e => setAi(e.target.checked)} />
          Allow AI features
        </label>
        <button type="submit" className={primary} disabled={k.creating}>
          {k.creating ? "Creating..." : "Create key"}
        </button>
      </form>

      <h3 className="text-lg font-semibold mb-2">Your keys</h3>
      {!k.loaded && <p className="text-sm text-neutral-500">Loading...</p>}
      {k.loaded && k.keys.length === 0 && <p className="text-sm text-neutral-500">No keys yet.</p>}
      {k.keys.length > 0 && (
        <table className="w-full text-sm bg-white border border-neutral-200 rounded" data-testid="keys-table">
          <thead>
            <tr className="text-left text-neutral-500 border-b border-neutral-200">
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Key</th>
              <th className="px-3 py-2">Access</th>
              <th className="px-3 py-2">Created</th>
              <th className="px-3 py-2">Last used</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {k.keys.map(key => {
              const status = statusOf(key);
              return (
                <tr key={key.id} data-testid="key-row" data-status={status} className="border-b border-neutral-100 last:border-0">
                  <td className="px-3 py-2 font-medium">{key.name}</td>
                  <td className="px-3 py-2 font-mono text-xs" data-testid="key-prefix">
                    fwk_{key.prefix}_...
                  </td>
                  <td className="px-3 py-2">
                    {SCOPE_LABEL[key.scope]}
                    {key.ai ? " + AI" : ""}
                  </td>
                  <td className="px-3 py-2">{when(key.createdAt)}</td>
                  <td className="px-3 py-2">{when(key.lastUsedAt)}</td>
                  <td className="px-3 py-2" data-testid="key-status">
                    {status === "active" ? "Active" : status === "revoked" ? "Revoked" : "Expired"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {status !== "revoked" && (
                      <button className={btn} disabled={k.revoking.includes(key.id)} onClick={() => setConfirming(key)}>
                        Revoke
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <ConnectSection revealedKey={k.revealed?.key ?? null} />

      <FormModal
        open={!!confirming}
        title="Revoke this key?"
        onClose={() => setConfirming(null)}
        actions={[
          { label: "Cancel", onClick: () => setConfirming(null), variant: "ghost" },
          {
            label: "Revoke key",
            variant: "destructive",
            onClick: () => {
              if (!confirming) return;
              const id = confirming.id;
              setConfirming(null);
              void k.revoke(id);
            },
          },
        ]}
      >
        {confirming && (
          <p className="text-sm">
            Anything using <strong>{confirming.name}</strong> (fwk_{confirming.prefix}_...) will stop working right away. This cannot be undone.
          </p>
        )}
      </FormModal>
    </>
  );
}
