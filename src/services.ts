import { configureTheme } from "@sudobility/design";
import { generateThemeCSS, retroTheme } from "@sudobility/design/themes";
import { createFetchNetworkClient } from "@sudobility/screenwriter_client";
import { ConsumablesApiClient, initializeConsumables } from "@sudobility/consumables_client";
import { configureConsumablesWebAdapter, createConsumablesWebAdapter } from "@sudobility/consumables_client/adapter/web";
import type { NetworkClient, NetworkRequestOptions, NetworkResponse } from "@sudobility/types";
import {
  createScreenwriter,
  type Screenwriter,
} from "@sudobility/screenwriter_lib";
import {
  authBackendAsPort,
  unifiedAuthBackend,
  type AuthBackend,
} from "./auth/backend";
import { API_URL, REVENUECAT_API_KEY, SHOW_ENTITIES } from "./config";
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
  consumablesApiClient: ConsumablesApiClient;
  /** The same backend instance `authBackendAsPort` feeds into `screenwriter`'s `AuthPort` — `AuthProvider`
   * (src/app/AuthContext.tsx) subscribes to this exact instance so both agree on who is signed in. */
  auth: AuthBackend;
}

let services: Services | null = null;

/** One Screenwriter (and one auth backend) per browser tab (= one device: one sync socket). Never disposed. */
export function createServices(): Services {
  if (services) return services;
  const auth = unifiedAuthBackend();
  const consumablesApiClient = new ConsumablesApiClient({
    baseUrl: API_URL,
    networkClient: createAuthenticatedConsumablesNetwork(auth),
    getAuthToken: () => auth.getToken(),
    getEntityId: () => SHOW_ENTITIES && typeof localStorage !== "undefined"
      ? selectedEntityId()
      : null,
    entityQueryParam: "entityId",
    creditProductsPath: "/api/v1/public/consumables/products",
    purchaseTargetPath: "/purchase-target",
  });
  if (REVENUECAT_API_KEY) configureConsumablesWebAdapter(REVENUECAT_API_KEY);
  initializeConsumables({
    adapter: createConsumablesWebAdapter(),
    apiClient: consumablesApiClient,
  });
  const screenwriter = createScreenwriter({
    network: createFetchNetworkClient(),
    baseUrl: API_URL,
    auth: authBackendAsPort(auth),
    offline: new IndexedDbOfflineDocStore(),
    getSelectedEntityId: () =>
      SHOW_ENTITIES && typeof localStorage !== "undefined"
        ? selectedEntityId()
        : null,
  });
  services = { screenwriter, auth, consumablesApiClient };
  return services;
}

function selectedEntityId(): string | null {
  const current = localStorage.getItem("screenwriter.selectedEntityId");
  if (current) return current;
  const legacy = localStorage.getItem("screenwriter.selectedWorkspaceId");
  if (legacy) localStorage.setItem("screenwriter.selectedEntityId", legacy);
  return legacy;
}

function createAuthenticatedConsumablesNetwork(auth: AuthBackend): NetworkClient {
  async function request<T>(url: string, options?: NetworkRequestOptions | null): Promise<NetworkResponse<T>> {
    const token = await auth.getToken();
    const response = await fetch(url, {
      method: options?.method ?? "GET",
      headers: {
        ...(options?.headers ?? {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options?.body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: options?.body as BodyInit | undefined,
      signal: options?.signal ?? undefined,
    });
    let data: T | undefined;
    try { data = await response.json() as T; } catch { data = undefined; }
    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => { headers[key] = value; });
    return { ok: response.ok, status: response.status, statusText: response.statusText, headers, data, success: response.ok } as NetworkResponse<T>;
  }
  return {
    request,
    get: (url, options) => request(url, { ...options, method: "GET" }),
    post: (url, body, options) => request(url, { ...options, method: "POST", body: JSON.stringify(body) }),
    put: (url, body, options) => request(url, { ...options, method: "PUT", body: JSON.stringify(body) }),
    delete: (url, options) => request(url, { ...options, method: "DELETE" }),
  };
}

export function getServices(): Services {
  if (!services) throw new Error("createServices() has not been called");
  return services;
}
