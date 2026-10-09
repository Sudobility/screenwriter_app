import { useEffect, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button, Heading, Text } from "@sudobility/components";
import { useAuth } from "../../app/AuthContext";
import { useSignIn } from "../../app/SignInContext";

/**
 * Gates a page that needs an account (projects, a project, the editor) **without leaving it**: signed out, the
 * page's place shows a short signed-out notice and the sign-in modal opens over it; signing in there renders the
 * page itself, at the same URL. Closing the modal without signing in leaves the notice, whose button opens the modal
 * again. There is no redirect to the login route and no redirect back — see "Sign-in" in CLAUDE.md.
 */
export function RequireSignIn({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <>{children}</>;
  return <SignedOutNotice />;
}

function SignedOutNotice() {
  const { t } = useTranslation();
  const { openSignIn, closeSignIn } = useSignIn();

  useEffect(() => {
    openSignIn();
    // Leaving the gated page while the modal is open (Back) takes the modal with it.
    return () => closeSignIn();
  }, [openSignIn, closeSignIn]);

  return (
    <main className="mx-auto max-w-md px-4 py-16 text-center" data-testid="signed-out-notice">
      <Heading level={1} size="2xl" weight="semibold" align="center">
        {t("login.gate.title")}
      </Heading>
      <Text as="p" color="muted" align="center" className="mt-3">
        {t("login.gate.body")}
      </Text>
      <Button type="button" variant="primary" className="mt-6" onClick={() => openSignIn()}>
        {t("login.gate.button")}
      </Button>
    </main>
  );
}
