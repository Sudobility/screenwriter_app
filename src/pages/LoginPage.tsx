import { useNavigate } from "react-router-dom";
import { LoginPage as LoginPageComponent } from "@sudobility/building_blocks";
import { useAuth } from "../app/AuthContext";
import { useLang } from "../hooks/useLang";
import { APP_NAME } from "../config";

/**
 * Uses `@sudobility/building_blocks`' actual `LoginPage` component, matching `../music_app`'s real rendering
 * exactly (title, "Sign in to your account", email+password form, Sign in, divider, real Google button with its
 * logo, sign-up toggle) — not a hand-composed alternative. This app's real auth has no password at all (only
 * Google + the dev email-only bypass), so the email/password form is repurposed for `devSignIn` (password
 * ignored) when `VITE_DEV_AUTH=1`; without it, submitting throws a clear error instead of pretending to work.
 */
export function LoginPage() {
  const { hasGoogle, hasDevAuth, signInGoogle, devSignIn } = useAuth();
  const navigate = useNavigate();
  const lang = useLang();

  if (!hasGoogle && !hasDevAuth) {
    return (
      <div className="min-h-full flex items-center justify-center p-6">
        <div className="w-full max-w-sm bg-white border border-neutral-200 rounded-lg p-6 shadow-sm text-center">
          <h1 className="text-2xl font-semibold mb-2">{APP_NAME}</h1>
          <p className="text-sm text-neutral-600">
            Sign-in is not configured. Set <code>VITE_DEV_AUTH=1</code> for the dev login, or configure{" "}
            <code>VITE_FIREBASE_*</code> for Google sign-in.
          </p>
        </div>
      </div>
    );
  }

  const devLogin = async (email: string) => {
    if (!hasDevAuth) throw new Error("Email sign-in isn't available in this build — use Google.");
    await devSignIn(email);
  };

  return (
    <div className="contents" spellCheck={false} autoCorrect="off">
      <LoginPageComponent
        appName={APP_NAME}
        showGoogleSignIn={hasGoogle}
        // emailLabel: every e2e spec's login helper depends on this exact text (getByLabel("Dev login (email, no
        // password)")). The password field stays the component's own default ("Password") for full visual parity
        // with music_app — it's native-`required` (no prop removes it) so a value must still be typed, but the
        // component's own default label is enough; e2e disambiguates it from the email field with `exact: true`
        // rather than a relabel.
        // signInWithGoogle: the component's own default ("Sign in with Google") contains "Sign in" as a substring,
        // which makes every e2e spec's getByRole("button", { name: "Sign in" }) ambiguous (Playwright's default
        // name match is substring, not exact) — matches music_app's own override to the same text for the same reason.
        text={{
          ...(hasDevAuth ? { emailLabel: "Dev login (email, no password)" } : {}),
          signInWithGoogle: "Continue with Google",
        }}
        onEmailSignIn={devLogin}
        onEmailSignUp={devLogin}
        onGoogleSignIn={hasGoogle ? signInGoogle : undefined}
        onSuccess={() => navigate(`/${lang}/projects`)}
      />
    </div>
  );
}
