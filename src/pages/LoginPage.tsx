import { useState, type FormEvent } from "react";
import { useAuth } from "@sudobility/screenwriter_lib";
import { DEV_AUTH } from "../config";

export function LoginPage() {
  const { status, error, signIn } = useAuth();
  const [email, setEmail] = useState("");

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void signIn(email);
  };

  return (
    <div className="min-h-full flex items-center justify-center p-6">
      <div className="w-full max-w-sm bg-white border border-neutral-200 rounded-lg p-6 shadow-sm">
        <h1 className="text-2xl font-semibold mb-1">Fadewright</h1>
        <p className="text-sm text-neutral-500 mb-6">Screenwriting, in the browser.</p>
        {DEV_AUTH ? (
          <form onSubmit={submit} className="space-y-3">
            <label className="block text-sm font-medium" htmlFor="dev-email">
              Dev login (email, no password)
            </label>
            <input
              id="dev-email"
              type="email"
              required
              autoFocus
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full border border-neutral-300 rounded px-3 py-2"
            />
            <button
              type="submit"
              disabled={status === "signingIn"}
              className="w-full bg-neutral-900 text-white rounded px-3 py-2 disabled:opacity-50"
            >
              Sign in
            </button>
            {error && <p className="text-sm text-red-600">{error}</p>}
          </form>
        ) : (
          <p className="text-sm text-neutral-600">
            Sign-in is not configured. Firebase login is not wired yet; set <code>VITE_DEV_AUTH=1</code> for the dev login.
          </p>
        )}
      </div>
    </div>
  );
}
