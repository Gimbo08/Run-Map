/* ===== Run Map — autenticazione Google (GIS) + client cloud Apps Script ===== */
"use strict";

/* --- stato auth --- */
const auth = {
  user: null,        // { email, name, picture }
  idToken: null,     // JWT Google, inviato allo script ad ogni richiesta
  ready: false
};

function authConfigured() {
  return GOOGLE_CLIENT_ID && !GOOGLE_CLIENT_ID.startsWith("INSERISCI")
      && APPS_SCRIPT_URL && !APPS_SCRIPT_URL.includes("XXXXXXXX");
}

function decodeJwtPayload_(token) {
  try {
    const b = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(decodeURIComponent(atob(b).split("").map(c =>
      "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2)).join("")));
  } catch { return {}; }
}

/* memorizza l'utente dopo un login riuscito */
function setAuthUser_(resp) {
  auth.idToken = resp.credential;
  const p = decodeJwtPayload_(resp.credential);
  auth.user = { email: p.email, name: p.name || p.email, picture: p.picture };
  sessionStorage.setItem("runmap:idToken", resp.credential);
  renderAuthUi();
}

/* ripristina la sessione se il token è ancora valido (max 1 h) */
function restoreAuth_() {
  const t = sessionStorage.getItem("runmap:idToken");
  if (!t) return;
  const p = decodeJwtPayload_(t);
  if (p.exp && p.exp > Date.now() / 1000) {
    auth.idToken = t;
    auth.user = { email: p.email, name: p.name || p.email, picture: p.picture };
  } else sessionStorage.removeItem("runmap:idToken");
}

/* inizializza Google Identity Services */
function initAuth() {
  if (!authConfigured()) { renderAuthUi(); return; }
  restoreAuth_();
  google.accounts.id.initialize({
    client_id: GOOGLE_CLIENT_ID,
    callback: setAuthUser_,
    auto_select: true
  });
  auth.ready = true;
  renderAuthUi();
}

function logout() {
  auth.user = null; auth.idToken = null;
  sessionStorage.removeItem("runmap:idToken");
  google.accounts.id.disableAutoSelect();
  renderAuthUi();
}

/* --- UI login/logout nel header --- */
function renderAuthUi() {
  const box = document.getElementById("authBox");
  if (!box) return;
  box.hidden = false;
  if (auth.user) {
    box.innerHTML =
      `<button id="logoutBtn" class="logout-btn" title="Esci">Logout</button>`;
    document.getElementById("logoutBtn").addEventListener("click", logout);
  } else if (authConfigured()) {
    box.innerHTML = `<div id="googleBtn"></div>`;
    if (auth.ready) google.accounts.id.renderButton(
      document.getElementById("googleBtn"),
      { theme: "outline", size: "medium", text: "signin_with", locale: "it" });
  } else {
    box.innerHTML = `<span class="auth-name muted" title="Configura js/cloud-config.js">☁️ cloud non configurato</span>`;
  }
}

/* avvia l'autenticazione quando sia il DOM sia lo script GIS sono pronti */
if (document.readyState === "complete") initAuth();
else window.addEventListener("load", initAuth);

/* login esplicito (usato quando serve il cloud e non si è loggati) */
function promptGoogleLogin() {
  if (!authConfigured()) {
    alert("Cloud non configurato: compila js/cloud-config.js con CLIENT_ID e URL dello script.");
    return;
  }
  google.accounts.id.prompt(); // One Tap
  renderAuthUi();
}

/* ===== client cloud (Apps Script con verifica token) =====
 * API dello script: GET  → intero DB; POST {key,value} | {replace:true,data} */
async function cloudGet() {
  if (!authConfigured()) return null;
  if (!auth.idToken) throw new Error("non autenticato");
  const res = await fetch(APPS_SCRIPT_URL + "?token=" + encodeURIComponent(auth.idToken),
    { cache: "no-store" });
  if (!res.ok) throw new Error("cloud GET " + res.status);
  const data = await res.json();
  if (data && data.error && String(data.error).startsWith("auth:")) throw new Error(data.error);
  return data;
}

async function cloudPost(payload) {
  if (!authConfigured() || !auth.idToken) throw new Error("non autenticato");
  const res = await fetch(APPS_SCRIPT_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" }, // evita preflight CORS
    body: JSON.stringify({ ...payload, token: auth.idToken })
  });
  if (!res.ok) throw new Error("cloud POST " + res.status);
  return res.json();
}
