// Test rapido modal distanza: STRACHIVIOL (10 km dal nome)
// Uso: node test.mjs  (parte un server statico, apre il browser, chiude tutto)
import { chromium } from "playwright";
import { createServer } from "http";
import { readFileSync, existsSync } from "fs";
import { join, extname, resolve, dirname } from "path";
import { fileURLToPath } from "url";

const root = resolve(dirname(fileURLToPath(import.meta.url)));
const mime = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg" };
const server = createServer((req, res) => {
  let p = join(root, req.url.split("?")[0] === "/" ? "index.html" : req.url.split("?")[0]);
  if (!existsSync(p)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "Content-Type": mime[extname(p)] || "application/octet-stream" });
  res.end(readFileSync(p));
});
await new Promise(r => server.listen(0, r));
const port = server.address().port;

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto(`http://localhost:${port}/index.html`);
await page.waitForSelector(".race-row");

export default async function run(page, ui) {
  const out = {};
  // apri modal STRACHIVIOL (10 km dal nome)
  await page.evaluate(() => {
    [...document.querySelectorAll('.race-row')].forEach(d => {
      if (d.textContent.includes('STRACHIVIOL')) d.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
  });
  await page.waitForTimeout(300);
  out.initial = await page.evaluate(() => ({
    label: document.querySelector('#modalBody .km-box label')?.textContent.trim(),
    value: document.getElementById('kmField')?.value,
    hasReset: !!document.getElementById('kmReset')
  }));
  // modifica 10 → 12 e salva
  await page.evaluate(() => {
    document.getElementById('kmField').value = '12';
    document.getElementById('kmSave').click();
  });
  await page.waitForTimeout(300);
  out.afterEdit = await page.evaluate(() => ({
    modalReopened: !document.getElementById('modal').hidden,
    label: document.querySelector('#modalBody .km-box label')?.textContent.trim(),
    value: document.getElementById('kmField')?.value,
    hasReset: !!document.getElementById('kmReset')
  }));
  // 12 km rientra nella fascia [9.5, 20) delle card "10 km", ma 00:52:52 non batte il PB 00:47:30
  out.pb10 = await page.evaluate(() => document.querySelector('#pb-10 .pb-time')?.textContent);
  // ripristina dal nome
  await page.evaluate(() => document.getElementById('kmReset')?.click());
  await page.waitForTimeout(300);
  out.afterReset = await page.evaluate(() => ({
    label: document.querySelector('#modalBody .km-box label')?.textContent.trim(),
    value: document.getElementById('kmField')?.value,
    hasReset: !!document.getElementById('kmReset')
  }));
  return out;
}

const out = await run(page);
console.log(JSON.stringify(out, null, 2));
await browser.close();
server.close();
