/** Build-time configuration (Vite `VITE_*` env). */
export const API_URL: string = (import.meta.env.VITE_API_URL as string | undefined) || "http://localhost:8042";
/** Dev login (email only) is available only when explicitly enabled; the API must run with AI_TEST_MODE=1. */
export const DEV_AUTH: boolean = import.meta.env.VITE_DEV_AUTH === "1";
