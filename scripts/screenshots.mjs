// Responsive QA helper: screenshots pages at 360 / 768 / 1280 px, flags
// horizontal overflow (the #1 mobile bug) and browser console errors.
//
// Usage: node scripts/screenshots.mjs [--role FARMER] [--base http://localhost:3000] [--scroll true] /path [/path2 …]
// Output: screenshots-tmp/<path>-<width>.png (gitignored)
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const base = opt("base", "http://localhost:3000");
const role = opt("role", null);
const widths = opt("widths", "360,768,1280").split(",").map(Number);
const fullPage = opt("full", "true") !== "false";
const waitMs = Number(opt("wait", "1200"));
// Scroll the page top-to-bottom first so scroll-triggered reveals fire.
const scrollFirst = opt("scroll", "false") === "true";
const scheme = opt("scheme", "light");
const paths = args.length ? args : ["/"];
const outDir = path.join(process.cwd(), "screenshots-tmp");
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
let failures = 0;
for (const width of widths) {
  const context = await browser.newContext({
    viewport: { width, height: width < 768 ? 780 : 900 },
    deviceScaleFactor: 1,
    hasTouch: width < 768,
    isMobile: width < 768,
    colorScheme: scheme,
  });
  if (role) {
    const res = await context.request.post(`${base}/api/auth/demo`, { data: { role } });
    if (!res.ok()) throw new Error(`demo login failed: ${res.status()}`);
  }
  const page = await context.newPage();
  const errors = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.message));
  for (const p of paths) {
    errors.length = 0;
    await page.goto(`${base}${p}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(waitMs);
    if (scrollFirst) {
      const h = await page.evaluate(() => document.documentElement.scrollHeight);
      for (let y = 0; y < h; y += 400) {
        await page.mouse.wheel(0, 400);
        await page.waitForTimeout(120);
      }
      await page.waitForTimeout(1800);
    }
    const overflow = await page.evaluate(() => {
      const vw = document.documentElement.clientWidth;
      const offenders = [];
      if (document.documentElement.scrollWidth > vw + 1) {
        for (const el of document.querySelectorAll("body *")) {
          const r = el.getBoundingClientRect();
          if (r.right > vw + 1 && r.width > 0 && getComputedStyle(el).position !== "fixed") {
            offenders.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 60)} → ${Math.round(r.right)}px`);
          }
        }
      }
      return { scrollWidth: document.documentElement.scrollWidth, vw, offenders: offenders.slice(0, 8) };
    });
    const name = `${p.replace(/^\//, "").replace(/[/?=&]/g, "_") || "home"}-${width}.png`;
    await page.screenshot({ path: path.join(outDir, name), fullPage });
    const flag = overflow.offenders.length ? "OVERFLOW" : "ok";
    if (overflow.offenders.length || errors.length) failures++;
    console.log(`${flag.padEnd(8)} ${String(width).padEnd(5)} ${p}  (scroll ${overflow.scrollWidth}/${overflow.vw})`);
    for (const o of overflow.offenders) console.log(`   ↳ ${o}`);
    for (const e of errors.slice(0, 5)) console.log(`   ✗ console: ${e.slice(0, 200)}`);
  }
  await context.close();
}
await browser.close();
process.exitCode = failures ? 1 : 0;
