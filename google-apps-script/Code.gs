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

const DEFAULT_CLIENT_ID = "1032131529172-r0nv5sfbua09ihd3lagaj2mkoklgdsl7.apps.googleusercontent.com";

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

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
