import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { LoginModal } from "@sudobility/components";
import { useLoginHandlers } from "../hooks/useLoginHandlers";

export interface SignInContextValue {
  /**
   * Opens the sign-in modal over the current page. `onSuccess` runs once somebody has signed in (the action that
   * needed an account continuing); closing the modal without signing in runs nothing and leaves the page as it was.
   */
  openSignIn: (onSuccess?: () => void) => void;
  /** Closes the modal without signing in (a gated page leaving the screen while it is open). */
  closeSignIn: () => void;
}

const SignInContext = createContext<SignInContextValue | null>(null);

/**
 * The one `LoginModal` in the app, mounted once (inside `AuthProvider`): sign-in needed in the middle of something
 * else — a page that needs an account reached while signed out (`RequireSignIn`), an action that needs one — opens
 * it over the current page and stays there. It never sends anybody to the login route; that route (`LoginPage`) is
 * for where somebody navigates *in order to* sign in. Same handlers and text as the page (`useLoginHandlers`).
 */
export function SignInProvider({ children }: { children: ReactNode }) {
  const { handlers, viewText, modalText } = useLoginHandlers();
  const [open, setOpen] = useState(false);
  const pending = useRef<(() => void) | undefined>(undefined);

  const openSignIn = useCallback((onSuccess?: () => void) => {
    pending.current = onSuccess;
    setOpen(true);
  }, []);
  const closeSignIn = useCallback(() => setOpen(false), []);
  const value = useMemo(() => ({ openSignIn, closeSignIn }), [openSignIn, closeSignIn]);

  return (
    <SignInContext.Provider value={value}>
      {children}
      <LoginModal
        open={open}
        onClose={() => {
          pending.current = undefined;
          setOpen(false);
        }}
        onSuccess={() => {
          const next = pending.current;
          pending.current = undefined;
          next?.();
        }}
        {...handlers}
        text={viewText}
        modalText={modalText}
      />
    </SignInContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useSignIn(): SignInContextValue {
  const ctx = useContext(SignInContext);
  if (!ctx) throw new Error("useSignIn must be used inside SignInProvider");
  return ctx;
}
