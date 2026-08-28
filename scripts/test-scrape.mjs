// Test parser dello scraping iRunning contro l'HTML reale scaricato.
// Uso: node scripts/test-scrape.mjs <file-html>
import { readFileSync } from "node:fs";

const file = process.argv[2];
const html = readFileSync(file, "utf8");

// stessa logica che andrà in Google Apps Script (Code.gs)
function parseRaces(html) {
  const out = [];
  const rowRe = /<tr id="exp_(\d+)">([\s\S]*?)<\/tr>/g;
  let m;
  while ((m = rowRe.exec(html))) {
    const irunId = m[1];
    const cells = [...m[2].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)]
      .map(c => c[1].replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").trim());
    if (cells.length < 7) continue;
    const name = cells[1];
    const specialty = cells[2];
    const time = cells[3].split(".").map(x => x.padStart(2, "0")).join(":");
    const location = cells[5];
    const dmy = cells[6].split("/");
    const date = `${dmy[2]}-${dmy[1]}-${dmy[0]}`;
    out.push({ irunId, name, specialty, time, location, date });
  }
  return out;
}

const races = parseRaces(html);
console.log("GARE TROVATE:", races.length);
races.forEach(r => console.log(JSON.stringify(r)));
