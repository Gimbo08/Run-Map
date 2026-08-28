/* ===== Server statico locale per Run Map =====
 * Serve il sito in statico (index.html, css, js, …).
 *
 * Uso:  npm start  →  http://localhost:3000
 */
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
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

const server = createServer((req, res) => {
  const url = decodeURIComponent(req.url.split("?")[0]);
  let file = join(root, url === "/" ? "index.html" : url);
  if (!file.startsWith(root) || !existsSync(file)) { res.writeHead(404); res.end("Not found"); return; }
  try {
    res.writeHead(200, { "Content-Type": mime[extname(file).toLowerCase()] || "application/octet-stream", "Cache-Control": "no-store" });
    res.end(readFileSync(file));
  } catch {
    res.writeHead(500); res.end();
  }
});

server.listen(port, () => console.log(`Run Map su http://localhost:${port}`));
