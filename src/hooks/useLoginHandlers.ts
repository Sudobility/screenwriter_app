import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { LoginModalText, LoginViewText } from "@sudobility/components";
import type { LoginPageText } from "@sudobility/building_blocks";
import { useAuth } from "../app/AuthContext";

/**
 * Everything the sign-in form needs, once, for both places it is shown: the login route's `LoginPage` and the
 * `LoginModal` opened over a page that needs an account (`SignInProvider`). Handlers, text and which ways in are
 * offered are decided here so the page and the modal can never drift apart.
 *
 * `VITE_DEV_AUTH=1` (local dev and the Playwright suite, against an API running with `AI_TEST_MODE=1`): the
 * email/password form is the dev email-only bypass — `devSignIn(email)`, the password ignored (the field is
 * native-`required`, so something must still be typed), no password reset — and its email field is labelled
 * "Dev login (email, no password)", which every e2e login helper selects by, in the page and the modal alike.
 * Google stays real in both modes.
 */
export function useLoginHandlers() {
  const { t } = useTranslation();
  const {
    hasGoogle,
    hasEmailPassword,
    hasDevAuth,
    signInEmail,
    signUpEmail,
    sendPasswordReset,
    signInGoogle,
    devSignIn,
  } = useAuth();

  return useMemo(() => {
    const devLogin = async (email: string) => {
      await devSignIn(email);
    };
    const viewText: Partial<LoginViewText> = {
      signIn: t("login.signIn"),
      signUp: t("login.signUp"),
      // e2e: every spec's login helper selects the dev form by this exact label.
      emailLabel: hasDevAuth ? t("login.devEmailLabel") : t("login.emailLabel"),
      passwordLabel: t("login.passwordLabel"),
      orContinueWith: t("login.orContinueWith"),
      // The component's own default ("Sign in with Google") contains "Sign in" as a substring, which makes
      // getByRole("button", { name: "Sign in" }) ambiguous (Playwright matches substrings unless `exact`) —
      // music_app overrides the same text for the same reason.
      signInWithGoogle: t("login.continueWithGoogle"),
      alreadyHaveAccount: t("login.alreadyHaveAccount"),
      dontHaveAccount: t("login.dontHaveAccount"),
      genericError: t("login.genericError"),
      forgotPassword: t("login.forgotPassword"),
      resetPasswordHint: t("login.resetPasswordHint"),
      sendResetLink: t("login.sendResetLink"),
      resetEmailSent: t("login.resetEmailSent"),
      backToSignIn: t("login.backToSignIn"),
    };
    const pageText: Partial<LoginPageText> = {
      ...viewText,
      signInToAccount: t("login.signInToAccount"),
      createAccount: t("login.createAccount"),
      resetPassword: t("login.resetPassword"),
    };
    const modalText: Partial<LoginModalText> = {
      signInTitle: t("login.modal.signInTitle"),
      signUpTitle: t("login.createAccount"),
      resetPasswordTitle: t("login.resetPassword"),
      close: t("login.modal.close"),
    };
    return {
      /** Whether any way to sign in is configured at all. */
      available: hasGoogle || hasEmailPassword || hasDevAuth,
      hasGoogle,
      handlers: {
        onEmailSignIn: hasDevAuth ? devLogin : signInEmail,
        onEmailSignUp: hasDevAuth ? devLogin : signUpEmail,
        onPasswordReset: hasDevAuth ? undefined : sendPasswordReset,
        onGoogleSignIn: hasGoogle ? signInGoogle : undefined,
      },
      viewText,
      pageText,
      modalText,
    };
  }, [t, hasGoogle, hasEmailPassword, hasDevAuth, signInEmail, signUpEmail, sendPasswordReset, signInGoogle, devSignIn]);
}
