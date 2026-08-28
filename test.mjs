// Test rapido modal distanza: apre il modal della prima gara in lista
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
page.on('console', m => { if (m.type() === 'error') console.log('PAGE ERROR:', m.text()); });
page.on('pageerror', e => console.log('PAGE EXCEPTION:', e.message));
// index.html richiede un token Google valido in sessionStorage (exp futuro)
// → si inietta un JWT finto con scadenza lontana per superare il gate di login
const fakeToken = [
  Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url"),
  Buffer.from(JSON.stringify({ email: "test@test.it", name: "Test", exp: 4102444800 })).toString("base64url"),
  "firma-finta"
].join(".");
await page.addInitScript(t => sessionStorage.setItem("runmap:idToken", t), fakeToken);
await page.goto(`http://localhost:${port}/index.html`);
await page.waitForSelector(".race-row");

export default async function run(page, ui) {
  const out = {};
  // apri modal della PRIMA gara reale in lista
  out.rowName = await page.evaluate(() => {
    const r = document.querySelector('.race-row');
    if (!r) return null;
    r.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    return r.textContent.trim().slice(0, 60);
  });
  await page.waitForTimeout(300);
  out.modalState = await page.evaluate(() => ({
    hidden: document.getElementById('modal').hidden,
    bodyLen: document.getElementById('modalBody')?.innerHTML.length,
    bodySnippet: document.getElementById('modalBody')?.innerHTML.slice(0, 300)
  }));
  console.log('MODAL STATE:', JSON.stringify(out.modalState));
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
  // log del PB della card 10 km (se esiste) per visibilità sul riposizionamento
  out.pb10 = await page.evaluate(() => document.querySelector('#pb-10 .pb-time')?.textContent ?? null);
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
