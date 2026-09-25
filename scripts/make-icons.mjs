/**
 * Regenerates every app icon from public/logo.svg.   Run after changing the logo:  bun run icons
 *
 * The SVG is rasterised once, large, with headless Chromium (Playwright is already a dev dependency; ImageMagick's
 * own SVG renderer is not reliable), then trimmed to the ink, re-padded so the mark sits dead centre, and downscaled
 * with ImageMagick — the same pipeline as music_app's scripts/make-icons.sh. Below ~32px a light unsharp keeps the
 * notches and the shaft gap from going mushy. The Apple touch icon is flattened onto white: iOS composites a
 * transparent home-screen icon onto black. Requires ImageMagick (`brew install imagemagick`).
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const OUT = "public";
const svg = readFileSync(`${OUT}/logo.svg`, "utf8").replace('width="256" height="256"', 'width="1024" height="1024"');
const tmp = mkdtempSync(join(tmpdir(), "viaink-icon-"));
const raw = join(tmp, "raw.png");
const master = join(tmp, "master.png");

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1024, height: 1024 }, deviceScaleFactor: 1 });
await page.setContent(`<body style="margin:0;background:transparent">${svg}</body>`);
await page.screenshot({ path: raw, omitBackground: true });
await browser.close();

const magick = (...args) => execFileSync("magick", args, { stdio: ["ignore", "pipe", "inherit"] }).toString().trim();
// The mark fills 88% of a square canvas: legible in a tab, not clipped by a rounded mask.
const [w, h] = magick(raw, "-trim", "+repage", "-format", "%w %h", "info:").split(" ").map(Number);
const canvas = Math.round((Math.max(w, h) * 100) / 88);
magick(raw, "-trim", "+repage", "-background", "none", "-gravity", "center", "-extent", `${canvas}x${canvas}`, master);

const png = (size, path) => magick(master, "-filter", "Lanczos", "-resize", `${size}x${size}`, "-strip", path);
const smallPng = (size, path) => magick(master, "-filter", "Lanczos", "-resize", `${size}x${size}`, "-unsharp", "0x0.6+0.8+0.02", "-strip", path);

png(512, `${OUT}/icon-512.png`);
png(192, `${OUT}/icon-192.png`);
png(96, `${OUT}/logo-96.png`);
smallPng(32, `${OUT}/favicon-32.png`);
smallPng(16, `${OUT}/favicon-16.png`);
// Multi-resolution .ico (48/32/16): what a browser asks for at /favicon.ico when no link tag names anything better.
magick(master, "-filter", "Lanczos", "-resize", "48x48", "-unsharp", "0x0.6+0.8+0.02", "-strip",
  "(", "-clone", "0", "-resize", "32x32", ")", "(", "-clone", "0", "-resize", "16x16", ")", `${OUT}/favicon.ico`);
magick(master, "-resize", "180x180", "-background", "white", "-alpha", "remove", "-alpha", "off", "-strip", `${OUT}/apple-touch-icon.png`);
rmSync(tmp, { recursive: true, force: true });
console.log(`Generated from ${OUT}/logo.svg (${w}x${h} ink -> ${canvas}px master): icon-512, icon-192, logo-96, favicon-32, favicon-16, favicon.ico, apple-touch-icon`);
