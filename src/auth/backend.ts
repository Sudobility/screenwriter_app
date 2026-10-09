import { initializeApp } from "firebase/app";
import {
  createUserWithEmailAndPassword,
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
  type Auth,
  type User,
} from "firebase/auth";
import { DevAuthPort, type AuthPort, type AuthUser } from "@sudobility/screenwriter_lib";
import { DEV_AUTH, FIREBASE_CONFIG } from "../config";

/**
 * This app's auth surface, matching music_app's `AuthBackend` shape (observe/getToken/signInEmail/signUpEmail/
 * sendPasswordReset/signInGoogle/signOut — real Firebase email/password and Google), plus `devSignIn`, the
 * email-only bypass offered only when `VITE_DEV_AUTH=1` (see CLAUDE.md's Auth section). The sign-in calls return
 * the resulting `AuthUser` (not `Promise<void>`, unlike music_app's own shape) so `authBackendAsPort`'s
 * `AuthPort.signIn` can return it directly, with no race against `observe` having fired yet.
 */
export interface AuthBackend {
  observe(cb: (user: AuthUser | null) => void): () => void;
  getToken(forceRefresh?: boolean): Promise<string | null>;
  signInEmail(email: string, password: string): Promise<AuthUser>;
  signUpEmail(email: string, password: string): Promise<AuthUser>;
  /** Sends Firebase's password-reset link to `email`. */
  sendPasswordReset(email: string): Promise<void>;
  signInGoogle(): Promise<AuthUser>;
  devSignIn(email: string): Promise<AuthUser>;
  signOut(): Promise<void>;
  /** Whether Google sign-in is offered at all (VITE_FIREBASE_* configured). Static for the process lifetime. */
  readonly hasGoogle: boolean;
  /** Whether Firebase email/password sign-in, sign-up and reset are offered (VITE_FIREBASE_* configured). */
  readonly hasEmailPassword: boolean;
  /** Whether the dev email-only bypass is offered (VITE_DEV_AUTH=1). Static for the process lifetime. */
  readonly hasDevAuth: boolean;
}

const hasFirebaseConfig = Boolean(FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.projectId);

function toAuthUser(user: User | null): AuthUser | null {
  return user ? { uid: user.uid, email: user.email, displayName: user.displayName } : null;
}

/**
 * Reads a Firebase ID token, waiting for the session to be restored first.
 *
 * `auth.currentUser` is `null` between `getAuth()` and the first `onAuthStateChanged`, even for a signed-in user
 * with a persisted session — restoring it is asynchronous. Reading it immediately would answer `null` for a user
 * who *was* signed in, so a request made on mount would go out unauthenticated. `authStateReady()` resolves
 * immediately once that has happened, so this costs nothing after start-up. (Same rule music_app's
 * `readFirebaseToken` documents and applies.)
 */
function readFirebaseToken(auth: Auth, forceRefresh?: boolean): Promise<string | null> {
  return auth.authStateReady().then(() => auth.currentUser?.getIdToken(forceRefresh) ?? null);
}

interface SubBackend {
  observe(cb: (user: AuthUser | null) => void): () => void;
  getToken(forceRefresh?: boolean): Promise<string | null>;
  signOut(): Promise<void>;
}

interface FirebaseSubBackend extends SubBackend {
  signInEmail(email: string, password: string): Promise<AuthUser>;
  signUpEmail(email: string, password: string): Promise<AuthUser>;
  sendPasswordReset(email: string): Promise<void>;
  signInGoogle(): Promise<AuthUser>;
}

function requireUser(user: User | null, what: string): AuthUser {
  const out = toAuthUser(user);
  if (!out) throw new Error(`${what} did not return a user`);
  return out;
}

function firebaseBackend(): FirebaseSubBackend | null {
  if (!hasFirebaseConfig) return null;
  const app = initializeApp(FIREBASE_CONFIG);
  const auth = getAuth(app);
  return {
    observe: (cb) => onAuthStateChanged(auth, (user) => cb(toAuthUser(user))),
    getToken: (forceRefresh) => readFirebaseToken(auth, forceRefresh),
    signInEmail: async (email, password) => {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      return requireUser(cred.user, "Email sign-in");
    },
    signUpEmail: async (email, password) => {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      return requireUser(cred.user, "Sign-up");
    },
    sendPasswordReset: (email) => sendPasswordResetEmail(auth, email),
    signInGoogle: async () => {
      const cred = await signInWithPopup(auth, new GoogleAuthProvider());
      return requireUser(cred.user, "Google sign-in");
    },
    signOut: () => firebaseSignOut(auth),
  };
}

function devBackend(): (SubBackend & { devSignIn(email: string): Promise<AuthUser> }) | null {
  if (!DEV_AUTH) return null;
  const port = new DevAuthPort(window.localStorage);
  return {
    // Unlike Firebase's onAuthStateChanged, DevAuthPort.onChange does NOT replay the already-restored session to a
    // newly-registered listener — it only announces future changes. Firing once with the current value here makes
    // both sub-backends' `observe` share one contract (always announce the current state to a fresh subscriber).
    observe: (cb) => {
      cb(port.currentUser);
      return port.onChange(cb);
    },
    getToken: () => port.getToken(),
    devSignIn: (email) => port.signIn(email),
    signOut: () => port.signOut(),
  };
}

/**
 * Composes the Firebase (email/password + Google) and dev backends into one (this app's real API already has a
 * working `AI_TEST_MODE=1` dev bypass all e2e specs depend on — unlike music_app's env-flag e2e shim, it isn't
 * replaced here, just unified alongside real Firebase sign-in).
 *
 * Whichever backend last reported a signed-in user becomes "active"; `getToken`/`signOut` delegate to it.
 *
 * A subscriber (`AuthContext`'s `loading` flag depends on this) is announced the current state only once EVERY
 * configured sub-backend has reported at least once: the dev backend is always synchronously ready (see
 * `devBackend`'s `observe` above), but Firebase's session restore is asynchronous — `auth.currentUser` is `null`
 * until the first real `onAuthStateChanged` fires, even for a persisted signed-in user. Replaying a snapshot
 * before that arrives would flash "signed out" and race exactly the bug music_app's own `readFirebaseToken`
 * comment documents, just for `loading`/`user` instead of a token read.
 */
export function unifiedAuthBackend(): AuthBackend {
  const firebase = firebaseBackend();
  const dev = devBackend();

  let active: SubBackend | null = null;
  let current: AuthUser | null = null;
  let firebaseReady = firebase === null;
  let devReady = dev === null;
  const listeners = new Set<(user: AuthUser | null) => void>();

  const emit = () => {
    if (!firebaseReady || !devReady) return;
    for (const l of [...listeners]) l(current);
  };

  if (firebase) {
    firebase.observe((user) => {
      firebaseReady = true;
      if (user) {
        active = firebase;
        current = user;
      } else if (active === firebase) {
        active = null;
        current = null;
      }
      emit();
    });
  }
  if (dev) {
    dev.observe((user) => {
      devReady = true;
      if (user) {
        active = dev;
        current = user;
      } else if (active === dev) {
        active = null;
        current = null;
      }
      emit();
    });
  }

  return {
    hasGoogle: firebase !== null,
    hasEmailPassword: firebase !== null,
    hasDevAuth: dev !== null,
    observe(cb) {
      listeners.add(cb);
      if (firebaseReady && devReady) cb(current);
      return () => listeners.delete(cb);
    },
    getToken: (forceRefresh) => (active ? active.getToken(forceRefresh) : Promise.resolve(null)),
    signInEmail: (email, password) => {
      if (!firebase) throw new Error("Email sign-in is not configured (set VITE_FIREBASE_* in .env)");
      return firebase.signInEmail(email, password);
    },
    signUpEmail: (email, password) => {
      if (!firebase) throw new Error("Email sign-up is not configured (set VITE_FIREBASE_* in .env)");
      return firebase.signUpEmail(email, password);
    },
    sendPasswordReset: (email) => {
      if (!firebase) throw new Error("Password reset is not configured (set VITE_FIREBASE_* in .env)");
      return firebase.sendPasswordReset(email);
    },
    signInGoogle: () => {
      if (!firebase) throw new Error("Google sign-in is not configured (set VITE_FIREBASE_* in .env)");
      return firebase.signInGoogle();
    },
    devSignIn: (email) => {
      if (!dev) throw new Error("Dev login is not enabled (set VITE_DEV_AUTH=1)");
      return dev.devSignIn(email);
    },
    signOut: async () => {
      await active?.signOut();
    },
  };
}

/** Adapts the unified backend to `screenwriter_lib`'s `AuthPort`, so `createScreenwriter()` has the concrete,
 * synchronous auth object it needs at construction time (before any React context exists). */
export function authBackendAsPort(backend: AuthBackend): AuthPort {
  let user: AuthUser | null = null;
  backend.observe((u) => {
    user = u;
  });
  return {
    get currentUser() {
      return user;
    },
    signIn(input?: unknown): Promise<AuthUser> {
      if (typeof input === "string") return backend.devSignIn(input);
      if (input && typeof input === "object") {
        const o = input as { provider?: unknown; email?: unknown; password?: unknown };
        if (o.provider === "google") return backend.signInGoogle();
        if (typeof o.email === "string" && typeof o.password === "string") {
          return backend.signInEmail(o.email, o.password);
        }
      }
      return Promise.reject(
        new Error("authBackendAsPort.signIn needs a dev email string, { email, password } or { provider: 'google' }"),
      );
    },
    signOut: () => backend.signOut(),
    getToken: (forceRefresh) => backend.getToken(forceRefresh),
    onChange: (listener) => backend.observe(listener),
  };
}
