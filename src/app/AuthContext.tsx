import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { AuthUser } from "@sudobility/screenwriter_lib";
import { getServices } from "../services";
import { setConsumablesUserId } from "@sudobility/consumables_client";

/**
 * This app's own auth context, matching music_app's `AuthContext.tsx` shape — the UI reads THIS `useAuth()`, not
 * `@sudobility/screenwriter_lib`'s own re-exported one (the lib's stays in use internally, e.g. by its
 * `useProjects()`/`useTemplates()`, unaffected). Subscribes to the exact same `AuthBackend` instance that feeds
 * `screenwriter_lib`'s `AuthPort` (see `services.ts`), so both always agree on who is signed in.
 */
export interface AuthContextValue {
  user: AuthUser | null;
  /** True until the first auth-state resolution arrives. */
  loading: boolean;
  /** Whether Google sign-in is offered (VITE_FIREBASE_* configured). */
  hasGoogle: boolean;
  /** Whether Firebase email/password sign-in, sign-up and reset are offered (VITE_FIREBASE_* configured). */
  hasEmailPassword: boolean;
  /** Whether the dev email-only bypass is offered (VITE_DEV_AUTH=1). */
  hasDevAuth: boolean;
  signInEmail: (email: string, password: string) => Promise<void>;
  signUpEmail: (email: string, password: string) => Promise<void>;
  /** Sends a link to reset the password for an address. */
  sendPasswordReset: (email: string) => Promise<void>;
  signInGoogle: () => Promise<void>;
  devSignIn: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { auth } = getServices();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = auth.observe((nextUser) => {
      setUser(nextUser);
      void setConsumablesUserId(nextUser?.uid, nextUser?.email ?? undefined);
      setLoading(false);
    });
    return unsubscribe;
  }, [auth]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      hasGoogle: auth.hasGoogle,
      hasEmailPassword: auth.hasEmailPassword,
      hasDevAuth: auth.hasDevAuth,
      signInEmail: async (email: string, password: string) => {
        await auth.signInEmail(email, password);
      },
      signUpEmail: async (email: string, password: string) => {
        await auth.signUpEmail(email, password);
      },
      sendPasswordReset: (email: string) => auth.sendPasswordReset(email),
      signInGoogle: async () => {
        await auth.signInGoogle();
      },
      devSignIn: async (email: string) => {
        await auth.devSignIn(email);
      },
      signOut: () => auth.signOut(),
    }),
    [user, loading, auth],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Lives beside its provider on purpose (same call music_app's AuthContext.tsx makes): a hook that only reads
 * this context isn't worth a second module. */
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
