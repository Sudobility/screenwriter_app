import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ScreenwriterClientProvider } from "@sudobility/screenwriter_client";
import { ScreenwriterProvider } from "@sudobility/screenwriter_lib";
import { App } from "./App";
import { AuthProvider } from "./app/AuthContext";
import { ErrorBoundary } from "./app/ErrorBoundary";
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
              <BrowserRouter>
                <App />
              </BrowserRouter>
            </AuthProvider>
          </ScreenwriterProvider>
        </ScreenwriterClientProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
);
