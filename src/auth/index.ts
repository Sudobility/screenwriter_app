import { DevAuthPort, type AuthPort, type AuthUser } from "@sudobility/screenwriter_lib";
import { DEV_AUTH } from "../config";

/**
 * Real Firebase login is NOT implemented: it needs a Firebase web config here and FIREBASE_* admin credentials on
 * the API, neither of which exist yet. Implement `AuthPort` (currentUser, signIn, signOut, getToken, onChange) with
 * the Firebase web SDK and return it from `createAuthPort` when the `VITE_FIREBASE_*` config is present.
 */
class UnconfiguredAuthPort implements AuthPort {
  readonly currentUser: AuthUser | null = null;
  async signIn(): Promise<AuthUser> {
    throw new Error("No auth provider configured. Set VITE_DEV_AUTH=1 for the dev login (Firebase login is not wired yet).");
  }
  async signOut(): Promise<void> {}
  async getToken(): Promise<string | null> {
    return null;
  }
  onChange(): () => void {
    return () => {};
  }
}

export function createAuthPort(): AuthPort {
  if (DEV_AUTH) return new DevAuthPort(window.localStorage);
  return new UnconfiguredAuthPort();
}
