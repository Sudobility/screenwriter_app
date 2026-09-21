import { createFetchNetworkClient } from "@sudobility/screenwriter_client";
import { createScreenwriter, type Screenwriter } from "@sudobility/screenwriter_lib";
import { createAuthPort } from "./auth";
import { API_URL } from "./config";
import { IndexedDbOfflineDocStore } from "./offline/idb-store";

/** One Screenwriter per browser tab (= one device: one sync socket). Never disposed; it lives as long as the page. */
export function createServices(): Screenwriter {
  return createScreenwriter({
    network: createFetchNetworkClient(),
    baseUrl: API_URL,
    auth: createAuthPort(),
    offline: new IndexedDbOfflineDocStore(),
  });
}
