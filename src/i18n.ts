/**
 * i18n init, app-owned (not inside @sudobility/building_blocks — that package's own `initializeI18n` helper exists
 * but this app follows music_app's own choice not to use it, matching that repo's "sudojo_app pattern"). Single
 * namespace `app`; translations are fetched at runtime, never bundled, so adding a language later is dropping in
 * a directory, not a rebuild.
 */
import i18n, { type InitOptions } from "i18next";
import Backend from "i18next-http-backend";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";
import { isLanguageSupported, SUPPORTED_LANGUAGES } from "./config/languages";

function detectLanguageFromPath(): string {
  if (typeof window === "undefined") return "en";
  const pathLang = window.location.pathname.split("/")[1];
  return pathLang && isLanguageSupported(pathLang) ? pathLang : "en";
}

void i18n
  .use(Backend)
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    lng: detectLanguageFromPath(),
    fallbackLng: "en",
    supportedLngs: [...SUPPORTED_LANGUAGES],
    initImmediate: false,
    ns: ["app"],
    defaultNS: "app",
    backend: { loadPath: "/locales/{{lng}}/{{ns}}.json" },
    detection: {
      order: ["path", "localStorage", "navigator"],
      caches: ["localStorage"],
      lookupLocalStorage: "language",
      lookupFromPathIndex: 0,
    },
    load: "currentOnly",
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
  } as InitOptions);

export default i18n;
