import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ScreenwriterClientProvider } from "@sudobility/screenwriter_client";
import { ScreenwriterProvider } from "@sudobility/screenwriter_lib";
import { App } from "./App";
import { createServices } from "./services";
import "./index.css";

const screenwriter = createServices();
// One QueryClient for the whole app: the client library's hooks read it from context.
const queryClient = new QueryClient();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ScreenwriterClientProvider client={screenwriter.client}>
        <ScreenwriterProvider screenwriter={screenwriter}>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </ScreenwriterProvider>
      </ScreenwriterClientProvider>
    </QueryClientProvider>
  </StrictMode>,
);
