/* ===== Run Map — database cloud su Google Drive (via Apps Script) =====
 *
 * Questo script, pubblicato come Web App, fa da piccolo database condiviso:
 * i dati vivono in un file JSON ("runmap-db.json") sul TUO Google Drive.
 * L'app (anche su GitHub Pages) legge/scrive lì, così tutti i dispositivi
 * vedono gli stessi dati.
 *
 * AUTENTICAZIONE: ogni richiesta DEVE contenere un ID token OAuth di Google
 * ("Sign in with Google"). Il token viene verificato con l'endpoint ufficiale
 * tokeninfo di Google: deve essere valido (non scaduto), emesso per il
 * CLIENT_ID configurato e con email verificata. Senza token valido l'API
 * risponde con un errore "auth: ..." e nessun dato viene letto o scritto.
 *
 * IMPOSTAZIONE:
 *   1. Apri questo progetto da un foglio Google (Estensioni → Apps Script)
 *      oppure su script.google.com.
 *   2. Imposta CLIENT_ID come Proprietà dello script (Impostazioni progetto →
 *      Proprietà script) oppure sostituisci DEFAULT_CLIENT_ID qui sotto,
 *      usando l'ID client OAuth creato in Google Cloud Console (tipo
 *      "Applicazione web"). Lo stesso ID va messo in js/cloud-config.js.
 *   3. Al primo "Esegui" autorizza gli scope (Drive, fetch esterno).
 *   4. Deploy → Nuovo deployment → App web → "Esegui come: Me",
 *      "Chi ha accesso: Solo io stesso". Copia l'URL in js/cloud-config.js.
 *
 * API (tutte richiedono il token):
 *   GET  <webAppUrl>?token=<idToken>              → l'intero DB come JSON
 *   POST <webAppUrl>  body: { token, key, value } → salva una chiave
 *                                   { token, key, value: null } → cancella
 */

const DB_FILE_NAME = "runmap-db.json";
const IRUNNING_ATLETA_URL = "https://www.irunning.it/atleta.php?id=";
const IRUNNING_ATLETA_ID = "375285"; // atleta Garuti Erick

const DEFAULT_CLIENT_ID = "761557978615-vglbpp1rhldvmpu895t4d5vasfhr5bd5.apps.googleusercontent.com";

function clientId_() {
  const props = PropertiesService.getScriptProperties();
  return props.getProperty("CLIENT_ID") || DEFAULT_CLIENT_ID;
}

/* --- verifica dell'ID token OAuth (Sign in with Google) --- */
function verifyToken_(token) {
  if (!token) throw new Error("auth: token mancante");
  const res = UrlFetchApp.fetch(
    "https://oauth2.googleapis.com/tokeninfo?id_token=" + encodeURIComponent(token),
    { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) throw new Error("auth: token non valido");
  const info = JSON.parse(res.getContentText());
  if (info.aud !== clientId_()) throw new Error("auth: client non autorizzato");
  if (info.iss !== "accounts.google.com" && info.iss !== "https://accounts.google.com")
    throw new Error("auth: emittente non valido");
  if (info.email_verified !== "true" && info.email_verified !== true)
    throw new Error("auth: email non verificata");
  return { email: info.email, name: info.name || info.email };
}

/* Restituisce (o crea al primo utilizzo) il file JSON su Drive.
 * Il DB contiene uno "spazio" per ogni account Google: chi si logga vede
 * e modifica SOLO i propri dati (db[email]). */
function dbFile_() {
  const it = DriveApp.getFilesByName(DB_FILE_NAME);
  return it.hasNext() ? it.next()
    : DriveApp.createFile(Utilities.newBlob("{}", "application/json", DB_FILE_NAME));
}

function readDb_() {
  return JSON.parse(dbFile_().getBlob().getDataAsString("utf-8") || "{}");
}

function doGet(e) {
  try {
    const user = verifyToken_((e.parameter || {}).token);
    const db = readDb_();
    const json = JSON.stringify(db[user.email] || {});
    return ContentService.createTextOutput(json)
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return json_({ error: String(err) });
  }
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000); // evita scritture sovrapposte da più dispositivi
  try {
    const body = JSON.parse(e.postData.contents);
    const user = verifyToken_(body.token); // lancia "auth: ..." se il token non è valido

    const db = readDb_();
    const mine = db[user.email] || {}; // spazio dati riservato a questo account

    if (body.action === "sync-irunning") {
      // scraping iRunning + merge incrementale delle gare (solo nuove)
      const r = syncIrunning_(mine);
      db[user.email] = mine;
      dbFile_().setContent(JSON.stringify(db));
      return json_(r);
    }

    if (body.replace === true) {
      // sostituzione completa dei SOLI dati di questo account
      const fresh = body.data && typeof body.data === "object" ? body.data : {};
      db[user.email] = fresh;
      dbFile_().setContent(JSON.stringify(db));
      return json_({ ok: true });
    }

    if ("key" in body) {
      if (body.value === null) delete mine[body.key];
      else mine[body.key] = body.value;
      db[user.email] = mine;
      dbFile_().setContent(JSON.stringify(db));
      return json_({ ok: true });
    }
    return json_({ ok: false, error: "richiesta non valida" });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

/* ===== Sincronizzazione gare da iRunning (scraping lato server) =====
 * Scarica la scheda atleta, estrae le gare dalla tabella (tab "scheda"),
 * e le salva SOLO sul cloud (chiave "irunningRaces"), aggiungendo solo
 * le gare non ancora presenti (per irunId): le esistenti non vengono toccate.
 * Restituisce { ok, added, races } con l'elenco aggiornato. */
function syncIrunning_(mine) {
  try {
    const url = IRUNNING_ATLETA_URL + IRUNNING_ATLETA_ID;
    const res = UrlFetchApp.fetch(url, {
      muteHttpExceptions: true,
      headers: { "Accept-Language": "it-IT,it;q=0.9", "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }
    });
    const html = res.getResponseCode() === 200 ? res.getContentText() : "";
    const scraped = scrapeIrunningRaces_(html);
    const existing = Array.isArray(mine.irunningRaces) ? mine.irunningRaces : [];
    const have = new Set(existing.map(r => r.irunId));
    let added = 0;
    scraped.forEach(r => {
      if (!r.irunId || have.has(String(r.irunId))) return;
      have.add(String(r.irunId));
      existing.push(r);
      added++;
    });
    if (added) mine.irunningRaces = existing;
    return { ok: true, added: added, races: existing };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

/* Estrae le righe della tabella risultati della scheda atleta iRunning.
 * Struttura attesa: <tr id="exp_<id>"> … <td>nome</td> <td>specialità</td>
 * <td>ris.</td> <td>età</td> <td>località</td> <td>data gg/mm/aaaa</td> */
function scrapeIrunningRaces_(html) {
  const out = [];
  if (!html) return out;
  const rowRe = /<tr id="exp_(\d+)">([\s\S]*?)<\/tr>/gi;
  let m;
  while ((m = rowRe.exec(html))) {
    const irunId = m[1];
    const cells = [];
    const cellRe = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    let c;
    while ((c = cellRe.exec(m[2]))) {
      cells.push(c[1].replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").trim());
    }
    if (cells.length < 7) continue;
    const name = cells[1];
    const specialty = cells[2];
    const time = cells[3].replace(/\./g, ":");
    const location = cells[5];
    const d = cells[6].split("/");
    const date = d.length === 3 ? d[2] + "-" + d[1] + "-" + d[0] : cells[6];
    if (!name || !time) continue;
    out.push({ irunId: irunId, name: name, specialty: specialty, time: time, location: location, date: date });
  }
  return out;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
