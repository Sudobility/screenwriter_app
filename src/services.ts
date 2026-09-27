import { configureTheme } from "@sudobility/design";
import { generateThemeCSS, retroTheme } from "@sudobility/design/themes";
import { createFetchNetworkClient } from "@sudobility/screenwriter_client";
import {
  createScreenwriter,
  type Screenwriter,
} from "@sudobility/screenwriter_lib";
import {
  authBackendAsPort,
  unifiedAuthBackend,
  type AuthBackend,
} from "./auth/backend";
import { API_URL, SHOW_ENTITIES } from "./config";
import { IndexedDbOfflineDocStore } from "./offline/idb-store";

// Activate the design-system theme. configureTheme() registers the JS class overrides; the semantic tokens
// (theme-bg-*, theme-text-*, the component palette) resolve via the CSS custom properties injected below (:root
// light + .dark) — same pattern as music_app/sudojo_app. Without this style tag every theme-* utility resolves to
// an undefined variable. `retroTheme` — every `variant="primary"`/`colorVariant="primary"` component (the default
// throughout this app, never overridden) picks up its actual color/type treatment from whichever theme is active
// here, with no other code change.
configureTheme(retroTheme);
if (
  typeof document !== "undefined" &&
  !document.getElementById("sudobility-design-theme")
) {
  const styleEl = document.createElement("style");
  styleEl.id = "sudobility-design-theme";
  styleEl.textContent = generateThemeCSS(retroTheme);
  document.head.appendChild(styleEl);
}

export interface Services {
  screenwriter: Screenwriter;
  /** The same backend instance `authBackendAsPort` feeds into `screenwriter`'s `AuthPort` — `AuthProvider`
   * (src/app/AuthContext.tsx) subscribes to this exact instance so both agree on who is signed in. */
  auth: AuthBackend;
}

let services: Services | null = null;

/** One Screenwriter (and one auth backend) per browser tab (= one device: one sync socket). Never disposed. */
export function createServices(): Services {
  if (services) return services;
  const auth = unifiedAuthBackend();
  const screenwriter = createScreenwriter({
    network: createFetchNetworkClient(),
    baseUrl: API_URL,
    auth: authBackendAsPort(auth),
    offline: new IndexedDbOfflineDocStore(),
    getSelectedWorkspaceId: () =>
      SHOW_ENTITIES && typeof localStorage !== "undefined"
        ? localStorage.getItem("screenwriter.selectedWorkspaceId")
        : null,
  });
  services = { screenwriter, auth };
  return services;
}

export function getServices(): Services {
  if (!services) throw new Error("createServices() has not been called");
  return services;
}
