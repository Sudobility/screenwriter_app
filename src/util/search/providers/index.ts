import type { ScriptEditorHost } from "@sudobility/writing_ui";
import type { SearchProvider } from "../types";
import { createScriptProvider } from "./script";
import { createSynopsisProvider } from "./synopsis";
import { createEntityProvider } from "./entity";
import { createTitlePageProvider } from "./title-page";

/** Navigation EditorPage gives the providers so a reveal can bring the right surface on screen. */
export interface FindNav {
  /** Switch to the script editor (edit view), clearing any Catalog/storyboard selection. */
  showScript(): void;
  /** Select a Catalog entity; `stageOrKey` is a character life-stage id, a Story item key, or null. */
  showEntity(entityId: string, stageOrKey: string | null): void;
  /** Open a scene's storyboard detail. */
  showStoryboard(sceneId: string): void;
  /** Open the Title page panel. */
  openTitlePanel(): void;
}

/**
 * The ordered set of search providers for the whole project: title page, script, scene synopses, and every
 * Catalog surface (entity name/aliases/description, character skeletons, visual-sheet appearance notes,
 * production & storyboard image captions, the Story record and subplots, and notes).
 */
export function createProviders(host: ScriptEditorHost, nav: FindNav): SearchProvider[] {
  return [createTitlePageProvider(host, nav), createScriptProvider(host, nav), createSynopsisProvider(host), createEntityProvider(host, nav)];
}
