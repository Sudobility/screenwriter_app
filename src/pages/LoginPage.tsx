import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { LoginPage as LoginPageComponent } from "@sudobility/building_blocks";
import { useLang } from "../hooks/useLang";
import { useLoginHandlers } from "../hooks/useLoginHandlers";
import { APP_NAME } from "../config";

/**
 * The login route — where somebody comes *in order to* sign in (the top bar's "Log in", the home page's "Log in").
 * `@sudobility/building_blocks`' actual `LoginPage` component, wired the way `../music_app` and `../raidr_app` wire
 * it: real Firebase email/password sign-in, sign-up and password reset plus Google. Handlers and text come from
 * `useLoginHandlers`, shared with the `LoginModal` (`SignInProvider`) that a page needing an account opens over
 * itself — see "Sign-in" in CLAUDE.md for which of the two a place uses.
 */
export function LoginPage() {
  const { t } = useTranslation();
  const { available, hasGoogle, handlers, pageText } = useLoginHandlers();
  const navigate = useNavigate();
  const lang = useLang();

  if (!available) {
    return (
      <div className="min-h-full flex items-center justify-center p-6">
        <div className="w-full max-w-sm bg-white border border-neutral-200 rounded-lg p-6 shadow-sm text-center">
          <h1 className="text-2xl font-semibold mb-2">{APP_NAME}</h1>
          <p className="text-sm text-neutral-600">
            {t("login.notConfigured.lead")} <code>VITE_DEV_AUTH=1</code> {t("login.notConfigured.or")}{" "}
            <code>VITE_FIREBASE_*</code> {t("login.notConfigured.tail")}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="contents" spellCheck={false} autoCorrect="off">
      <LoginPageComponent
        appName={APP_NAME}
        showGoogleSignIn={hasGoogle}
        text={pageText}
        {...handlers}
        onSuccess={() => navigate(`/${lang}/projects`)}
      />
    </div>
  );
}
