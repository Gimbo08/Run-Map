/* ===== Server locale per Run Map (backend condiviso) =====
 * Serve il sito in statico ED espone una piccola API REST che
 * persiste su disco (data/db.json) le gare manuali e le note/foto,
 * così sono condivise tra tutti i dispositivi che usano lo stesso server.
 *
 * Uso:  npm start   →  http://localhost:3000
 *
 * API:
 *   GET    /api/manual-races      → elenco gare manuali condivise
 *   PUT    /api/manual-races      → sostituisce l'elenco (body: array JSON)
 *   GET    /api/notes             → mappa completa { id: {note, photos} }
 *   GET    /api/notes/:id         → note/foto di una gara
 *   PUT    /api/notes/:id         → salva note/foto di una gara (body: {note, photos})
 *   DELETE /api/notes/:id         → cancella note/foto di una gara
 */
import { createServer } from "node:http";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, extname, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const port = process.env.PORT || 3000;

const mime = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg", ".gif": "image/gif", ".svg": "image/svg+xml", ".webp": "image/webp", ".ico": "image/x-icon"
};

/* --- piccolo database su file (data/db.json) --- */
const DB_DIR = join(root, "data");
const DB_FILE = join(DB_DIR, "db.json");
const emptyDb = () => ({ manualRaces: [], notes: {} });

function loadDb() {
  try {
    if (!existsSync(DB_FILE)) return emptyDb();
    const db = JSON.parse(readFileSync(DB_FILE, "utf8"));
    return {
      manualRaces: Array.isArray(db.manualRaces) ? db.manualRaces : [],
      notes: db.notes && typeof db.notes === "object" ? db.notes : {}
    };
  } catch (e) {
    console.error("db.json illeggibile, riparto da vuoto:", e.message);
    return emptyDb();
  }
}
function saveDb(db) {
  mkdirSync(DB_DIR, { recursive: true });
  writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

function readBody(req) {
  return new Promise((res, rej) => {
    let b = "";
    req.on("data", c => { b += c; if (b.length > 20 * 1024 * 1024) { rej(new Error("body troppo grande")); req.destroy(); } });
    req.on("end", () => res(b));
    req.on("error", rej);
  });
}
function json(res, code, obj) {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(obj));
}

const server = createServer(async (req, res) => {
  const url = decodeURIComponent(req.url.split("?")[0]);

  /* --- API condivisa --- */
  if (url === "/api" || url.startsWith("/api/")) {
    const db = loadDb();
    try {
      if (url === "/api/manual-races") {
        if (req.method === "GET") return json(res, 200, db.manualRaces);
        if (req.method === "PUT") {
          const body = JSON.parse((await readBody(req)) || "null");
          if (!Array.isArray(body)) return json(res, 400, { error: "atteso array JSON" });
          db.manualRaces = body; saveDb(db);
          return json(res, 200, { ok: true });
        }
      }
      const m = url.match(/^\/api\/notes(?:\/(.+))?$/);
      if (m) {
        const id = m[1] ? decodeURIComponent(m[1]) : null;
        if (!id) {
          if (req.method === "GET") return json(res, 200, db.notes);
          return json(res, 405, { error: "metodo non consentito" });
        }
        if (req.method === "GET") return json(res, 200, db.notes[id] ?? { note: "", photos: [] });
        if (req.method === "PUT") {
          const body = JSON.parse((await readBody(req)) || "null");
          if (!body || typeof body !== "object") return json(res, 400, { error: "body non valido" });
          db.notes[id] = { note: String(body.note ?? ""), photos: Array.isArray(body.photos) ? body.photos : [] };
          saveDb(db);
          return json(res, 200, { ok: true });
        }
        if (req.method === "DELETE") {
          delete db.notes[id]; saveDb(db);
          return json(res, 200, { ok: true });
        }
      }
      return json(res, 404, { error: "endpoint sconosciuto" });
    } catch (e) {
      return json(res, 500, { error: e.message });
    }
  }

  // --- file statici ---
  let file = join(root, url === "/" ? "index.html" : url);
  if (!file.startsWith(root) || !existsSync(file)) { res.writeHead(404); res.end("Not found"); return; }
  try {
    res.writeHead(200, { "Content-Type": mime[extname(file).toLowerCase()] || "application/octet-stream", "Cache-Control": "no-store" });
    res.end(readFileSync(file));
  } catch {
    res.writeHead(500); res.end();
  }
});

server.listen(port, () => console.log(`Run Map su http://localhost:${port} (backend condiviso: data/db.json)`));
