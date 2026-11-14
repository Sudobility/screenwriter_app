/**
 * Gates a page that needs an account **without leaving it**: signed out, the page's place shows a short
 * signed-out notice and the sign-in modal opens over it; signing in there renders the page itself, at the same
 * URL. The gate itself is `building_blocks`' provider-agnostic `RequireSignIn`; this binds it to the app's
 * `useAuth`/`useSignIn` and copy. See "Sign-in" in CLAUDE.md.
 */
import type { ComponentType, ReactNode } from "react";
import { createRequireSignIn } from "@sudobility/building_blocks";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../app/AuthContext";
import { useSignIn } from "../../app/SignInContext";

// Annotated (not just inferred) so the type does not reference the linked
// building_blocks' own @types/react copy (TS2883 under bun link).
export const RequireSignIn: ComponentType<{ children: ReactNode }> = createRequireSignIn({
  useAuth,
  useSignIn,
  useText: () => {
    const { t } = useTranslation();
    return {
      title: t("login.gate.title"),
      body: t("login.gate.body"),
      button: t("login.gate.button"),
    };
  },
  loadingFallback: null,
});
