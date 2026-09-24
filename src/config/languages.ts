/** Machinery in place for more languages later; only `en` is translated today. */
export const SUPPORTED_LANGUAGES = ["en"] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export function isLanguageSupported(lang: string): lang is SupportedLanguage {
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(lang);
}
