/** Build-time configuration (Vite `VITE_*` env). */
export const API_URL: string = (import.meta.env.VITE_API_URL as string | undefined) || "http://localhost:8036";
/** Dev login (email only) is available only when explicitly enabled; the API must run with AI_TEST_MODE=1. */
export const DEV_AUTH: boolean = import.meta.env.VITE_DEV_AUTH === "1";

export const APP_NAME: string = (import.meta.env.VITE_APP_NAME as string | undefined) || "Fadewright";
export const APP_DOMAIN: string = (import.meta.env.VITE_APP_DOMAIN as string | undefined) || "fadewright.app";
export const COMPANY_NAME: string = (import.meta.env.VITE_COMPANY_NAME as string | undefined) || "Sudobility Inc.";
export const SUPPORT_EMAIL: string = `support@${APP_DOMAIN}`;

/** Firebase web config. Google sign-in is offered only when apiKey/projectId are both present (see auth/backend.ts). */
export const FIREBASE_CONFIG = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string | undefined,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID as string | undefined,
};
