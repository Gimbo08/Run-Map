/* ===== Run Map — bridge cloud: usa auth.js (Google GIS + Apps Script) =====
 * Espone window.cloudLoad() e window.cloudSave(key, value) usati da app.js.
 * - cloudLoad: scarica l'intero DB dallo script (chiavi "manualRaces", "race-*", …)
 * - cloudSave: invia {key, value}; value === null cancella la chiave sul cloud.
 * Se l'utente non è loggato, prova prima il login One Tap (una sola volta). */
"use strict";

window.cloudLoad = async function () {
  if (!authConfigured()) return null;
  if (!auth.idToken) {
    promptGoogleLogin();
    if (!auth.idToken) return null; // l'utente non ha completato il login
  }
  try {
    return await cloudGet();
  } catch (e) {
    // token scaduto (max 1 h): ritenta dopo un nuovo login silenzioso
    if (String(e.message).startsWith("auth:") && auth.ready) {
      logout();
      google.accounts.id.prompt();
      if (auth.idToken) return await cloudGet();
    }
    return null;
  }
};

window.cloudSave = async function (key, value) {
  if (!authConfigured()) return;
  if (!auth.idToken) return; // offline: i dati restano in localStorage e verranno
                             // replicati al prossimo syncFromBackend dopo il login
  if (value === null) await cloudPost({ key, replace: true, data: {} }); // cancellazione
  else await cloudPost({ key, value });
};
