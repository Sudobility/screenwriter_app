import { createTailwindPreset } from "@sudobility/design";

/** @type {import('tailwindcss').Config} */
export default {
  presets: [createTailwindPreset()],
  // Tailwind purges classes it can't see referenced in source — the sudobility UI packages' own compiled output
  // must be scanned too, or their classes get dropped from the build (music_app's own tailwind.config.js does the
  // same for the packages it consumes).
  content: [
    "./index.html",
    "./src/**/*.{ts,tsx}",
    "./node_modules/@sudobility/components/**/*.{js,jsx,ts,tsx}",
    "./node_modules/@sudobility/building_blocks/**/*.{js,jsx,ts,tsx}",
    "./node_modules/@sudobility/design/**/*.{js,jsx,ts,tsx}",
    "./node_modules/@sudobility/auth-components/**/*.{js,jsx,ts,tsx}",
  ],
  darkMode: "class",
  theme: { extend: {} },
  plugins: [],
};
