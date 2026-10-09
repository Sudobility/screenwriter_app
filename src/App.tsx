import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import { LanguageRedirect, LanguageValidator } from "@sudobility/components";
import { useAuth } from "./app/AuthContext";
import { RequireSignIn } from "./components/shell/RequireSignIn";
import { ScreenContainer } from "./components/shell/ScreenContainer";
import { isLanguageSupported } from "./config/languages";
import { useLang } from "./hooks/useLang";
import { AboutPage } from "./pages/AboutPage";
import { ContactPage } from "./pages/ContactPage";
import { DashboardPage } from "./pages/DashboardPage";
import { DocsPage } from "./pages/DocsPage";
import { EditorPage } from "./pages/EditorPage";
import { HomePage } from "./pages/HomePage";
import { LoginPage } from "./pages/LoginPage";
import { PrivacyPage } from "./pages/PrivacyPage";
import { ResourcesPage } from "./pages/ResourcesPage";
import { TermsPage } from "./pages/TermsPage";

function NotFoundPage() {
  const lang = useLang();
  return (
    <main className="mx-auto max-w-2xl px-4 py-16 text-center">
      <h1>404</h1>
      <p>Page Not Found</p>
      <a href={`/${lang}`}>Go to Home</a>
    </main>
  );
}

/** `/:lang` index route: a returning signed-in visitor skips the marketing page and lands on their projects. */
function HomeRoute() {
  const { user, loading } = useAuth();
  const lang = useLang();
  if (loading) return null;
  if (user) return <Navigate to={`/${lang}/projects`} replace />;
  return <HomePage />;
}

/** An absolute, lang-prefixed redirect target — `<Navigate to="404">` (relative) does NOT resolve to a sibling
 * "404" segment here; it repeatedly appends onto the unmatched path instead (`/en/x` -> `/en/x/404` -> .../404/404
 * -> ...), an infinite loop. Absolute sidesteps relative-resolution entirely. */
function CatchAll() {
  const lang = useLang();
  return <Navigate to={`/${lang}/404`} replace />;
}

function LegacyKeysRedirect() {
  const lang = useLang();
  return <Navigate to={`/${lang}/projects`} replace />;
}

/** Adapts `ScreenContainer`'s children-based API to a layout-route element, matching music_app's own
 * `ScreenContainerLayout` wrapper in its router.tsx. */
function ScreenContainerLayout() {
  return (
    <ScreenContainer>
      <Outlet />
    </ScreenContainer>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<LanguageRedirect isLanguageSupported={isLanguageSupported} />} />
      <Route path="/:lang" element={<LanguageValidator isLanguageSupported={isLanguageSupported} />}>
        <Route element={<ScreenContainerLayout />}>
          <Route index element={<HomeRoute />} />
          <Route path="login" element={<LoginPage />} />
          <Route path="docs" element={<DocsPage />} />
          <Route path="resources" element={<ResourcesPage />} />
          <Route path="about" element={<AboutPage />} />
          <Route path="contact" element={<ContactPage />} />
          <Route path="privacy" element={<PrivacyPage />} />
          <Route path="terms" element={<TermsPage />} />
          {/* Pages that need an account are gated in place by RequireSignIn: signed out, the sign-in modal opens over
              the page and the page renders once signed in — never a redirect to "login" (that route is only where
              somebody navigates in order to sign in). */}
          <Route
            path="projects"
            element={
              <RequireSignIn>
                <DashboardPage />
              </RequireSignIn>
            }
          />
          <Route
            path="p/:projectId"
            element={
              <RequireSignIn>
                <DashboardPage />
              </RequireSignIn>
            }
          />
          <Route
            path="settings/keys"
            element={
              <RequireSignIn>
                <LegacyKeysRedirect />
              </RequireSignIn>
            }
          />
          <Route path="404" element={<NotFoundPage />} />
        </Route>
        <Route
          path="d/:documentId"
          element={
            <RequireSignIn>
              <EditorPage />
            </RequireSignIn>
          }
        />
        <Route path="*" element={<CatchAll />} />
      </Route>
      <Route path="*" element={<LanguageRedirect isLanguageSupported={isLanguageSupported} />} />
    </Routes>
  );
}
