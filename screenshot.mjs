import puppeteer from "puppeteer-core";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(root, "temporary screenshots");
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const url = process.argv[2] || "http://localhost:3000";
const label = process.argv[3];

const existing = fs
  .readdirSync(outDir)
  .map((f) => {
    const m = f.match(/^screenshot-(\d+)/);
    return m ? parseInt(m[1], 10) : 0;
  });
const n = existing.length ? Math.max(...existing) + 1 : 1;
const filename = label ? `screenshot-${n}-${label}.png` : `screenshot-${n}.png`;
const outPath = path.join(outDir, filename);

function findChrome() {
  const cacheRoot = "C:/Users/User/.cache/puppeteer/chrome";
  if (fs.existsSync(cacheRoot)) {
    const dirs = fs.readdirSync(cacheRoot);
    for (const d of dirs) {
      const p = path.join(cacheRoot, d, "chrome-win64", "chrome.exe");
      if (fs.existsSync(p)) return p;
    }
  }
  return undefined;
}
const executablePath = findChrome();

const browser = await puppeteer.launch({
  executablePath,
  headless: true,
  defaultViewport: { width: 1440, height: 900 },
});
const page = await browser.newPage();
await page.goto(url, { waitUntil: "networkidle0" });
await page.screenshot({ path: outPath, fullPage: true });
await browser.close();

console.log(`Saved ${outPath}`);
