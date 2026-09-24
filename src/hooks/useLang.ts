import { useParams } from "react-router-dom";

/** The current `:lang` route param (music_app's `useCurrentLanguage()`, simplified — only `en` exists today). */
export function useLang(): string {
  const { lang } = useParams<{ lang: string }>();
  return lang ?? "en";
}
