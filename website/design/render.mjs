import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const out = process.argv[2] ?? join(here, "png");
mkdirSync(out, { recursive: true });
const index = JSON.parse(readFileSync(join(here, "frames", "canvas.json"), "utf8"));
const browser = await chromium.launch();
for (const [name, board] of Object.entries(index.boards)) {
  const page = await browser.newPage({ viewport: { width: board.w, height: board.h } });
  const html = readFileSync(join(here, "frames", name), "utf8").replace('<script src="./support.js"></script>', "");
  await page.setContent(html, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(out, name.replace(".dc.html", ".png")) });
  await page.close();
}
await browser.close();
console.log(`rendered ${Object.keys(index.boards).length} frames into ${out}`);
