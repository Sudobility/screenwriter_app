import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ScreenwriterClientProvider } from "@sudobility/screenwriter_client";
import { ScreenwriterProvider } from "@sudobility/screenwriter_lib";
import { SEOHead, SEOHeadProvider } from "@sudobility/seo_lib";
import { App } from "./App";
import { seoHeadConfig } from "./seoHead";
import { AuthProvider } from "./app/AuthContext";
import { ErrorBoundary } from "./app/ErrorBoundary";
import { SignInProvider } from "./app/SignInContext";
import { createServices } from "./services";
import "./i18n";
import "./index.css";

const services = createServices();
// One QueryClient for the whole app: the client library's hooks read it from context.
const queryClient = new QueryClient();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ScreenwriterClientProvider client={services.screenwriter.client}>
          <ScreenwriterProvider screenwriter={services.screenwriter}>
            <AuthProvider>
              {/* The one sign-in modal, opened over whatever page needs an account (see App.tsx / CLAUDE.md). */}
              <SignInProvider>
                <BrowserRouter>
                  {/* One root-level SEOHead emits the per-route <link rel="canonical"> + meta that
                      scripts/prerender.mjs waits for; pages may still render their own SEOHead to override. */}
                  <SEOHeadProvider config={seoHeadConfig}>
                    <SEOHead title={seoHeadConfig.appName} description={seoHeadConfig.appName} />
                    <App />
                  </SEOHeadProvider>
                </BrowserRouter>
              </SignInProvider>
            </AuthProvider>
          </ScreenwriterProvider>
        </ScreenwriterClientProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
);
