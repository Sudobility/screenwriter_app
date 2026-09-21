import type { ReactNode } from "react";
import { Link } from "react-router";
import { useAuth } from "@sudobility/screenwriter_lib";

/** Page chrome for the dashboard routes (the editor has its own full-window layout). */
export function Shell({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth();
  return (
    <div className="min-h-full flex flex-col">
      <header className="bg-white border-b border-neutral-200 px-6 py-3 flex items-center gap-4">
        <Link to="/" className="font-semibold text-lg">
          Fadewright
        </Link>
        <span className="ml-auto text-sm text-neutral-500" data-testid="user-email">
          {user?.email}
        </span>
        <button onClick={() => void signOut()} className="text-sm border border-neutral-300 rounded px-3 py-1 hover:bg-neutral-100">
          Sign out
        </button>
      </header>
      <main className="flex-1 w-full max-w-4xl mx-auto p-6">{children}</main>
    </div>
  );
}
