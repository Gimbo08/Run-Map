/* ===== Run Map — tema, mappa, card PB, popup dettaglio, foto e note ===== */
"use strict";

const DIST_BUCKETS = [
  { key: "pb-42", label: "42 km", min: 42, max: 43 },
  { key: "pb-21", label: "21 km", min: 21,  max: 22 },
  { key: "pb-10", label: "10 km", min: 10, max: 11 },
  { key: "pb-5",  label: "5 km",  min: 5, max: 5.5 }
];

/* --- distanza (km) dal nome gara --- */
function raceId(r) { return r.irunId ?? r.manualId; }
function kmKey(r) { return "km-" + raceId(r); }
function raceKm(r) {
  // 1) distanza inserita manualmente nel modal (persistente, priorità massima)
  const manual = store.get(kmKey(r), null);
  if (manual != null) return manual;
  // 2) distanza salvata sulla gara (inserimento manuale della gara)
  if (r.km != null) return r.km;
  // 3) distanza dal nome
  const m = r.name.match(/(\d+(?:[.,]\d+)?)\s*km/i);
  if (m) return parseFloat(m[1].replace(",", "."));
  if (/vertical/i.test(r.name)) return 0.5;
  if (/mezza|half|21/i.test(r.name)) return 21.1;
  return null; // distanza sconosciuta
}
function kmKnown(r) { return raceKm(r) != null; }
function fmtPace(r) {
  const km = raceKm(r);
  if (!km) return null;
  const secPerKm = timeToSec(r.time) / km;
  const m = Math.floor(secPerKm / 60), s = Math.round(secPerKm % 60);
  return m + "'" + String(s).padStart(2, "0") + '"/km';
}
function timeToSec(t) {
  const [h, m, s] = t.split(":").map(Number);
  return h * 3600 + m * 60 + s;
}
function fmtTime(t) {
  const p = t.split(":").map(x => parseInt(x, 10));
  if (p[0]) return p[0] + ":" + String(p[1]).padStart(2, "0") + ":" + String(p[2]).padStart(2, "0");
  return p[1] + ":" + String(p[2]).padStart(2, "0");
}
function fmtDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/* --- storage foto/note/tema --- */
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem("runmap:" + k)) ?? d; } catch { return d; } },
  set(k, v) { localStorage.setItem("runmap:" + k, JSON.stringify(v)); }
};
function raceKey(r) { return "race-" + raceId(r); }
function getNotes(r) { return store.get(raceKey(r), { note: "", photos: [] }); }

/* --- tema chiaro/scuro --- */
const themeBtn = document.getElementById("themeToggle");
function applyTheme(t) {
  document.body.classList.toggle("dark", t === "dark");
  themeBtn.textContent = t === "dark" ? "\u2600\uFE0F" : "\uD83C\uDF19";
  if (window.mapTiles) mapTiles.setUrl(t === "dark" ? DARK_TILES : LIGHT_TILES);
}
themeBtn.addEventListener("click", () => {
  const t = document.body.classList.contains("dark") ? "light" : "dark";
  store.set("theme", t); applyTheme(t);
});

/* --- mappa --- */
const LIGHT_TILES = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const DARK_TILES  = LIGHT_TILES; // stessa mappa in entrambi i temi (no watermark scuro)
const map = L.map("map", { scrollWheelZoom: true }).setView([44.72, 10.72], 9);
const mapTiles = L.tileLayer(LIGHT_TILES, {
  maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);
window.mapTiles = mapTiles;

let markers = {};
// --- sovrapposizioni: primo tocco allarga il gruppo, poi si sceglie quello voluto ---
let spreadKey = null; // gruppo attualmente allargato

function spreadGroup(key, origin) {
  const group = Object.values(markers).filter(mk => mk.options.posKey === key);
  if (group.length < 2) return false;
  const [lat0, lng0] = origin;
  const R = 0.007; // raggio del ventaglio (gradi)
  group.forEach((mk, i) => {
    const a = (2 * Math.PI * i) / group.length - Math.PI / 2;
    mk.setLatLng([lat0 + R * Math.sin(a), lng0 + R * Math.cos(a)]);
    mk.getElement()?.classList.add("pin-spread");
  });
  spreadKey = key;
  L.popup({ closeButton: false, autoPan: false, className: "spread-hint" })
    .setLatLng([lat0, lng0])
    .setContent(group.length + " gare qui — toccane una")
    .openOn(map);
  return true;
}

function restoreSpread() {
  if (!spreadKey) return;
  Object.values(markers).forEach(mk => {
    if (mk.options.posKey === spreadKey) {
      mk.setLatLng(mk.options.origin);
      mk.getElement()?.classList.remove("pin-spread");
    }
  });
  spreadKey = null;
  map.closePopup();
}

function drawMarkers() {
  restoreSpread();
  Object.values(markers).forEach(mk => map.removeLayer(mk));
  markers = {};
  RACES.forEach(r => {
    if (r.lat == null || r.lng == null) return; // senza coordinate: skip
    const known = kmKnown(r);
    const mk = L.marker([r.lat, r.lng], {
      title: r.name + (known ? "" : " — distanza da impostare"),
      posKey: r.lat.toFixed(4) + "," + r.lng.toFixed(4),
      origin: [r.lat, r.lng],
      icon: L.divIcon({
        className: "run-pin" + (known ? "" : " pin-unknown"),
        html: "<span>" + (known ? "\uD83D\uDCCD" : "\u2753") + "</span>",
        iconSize: [34, 34], iconAnchor: [17, 32]
      })
    }).addTo(map);
    mk.on("click", () => {
      if (spreadKey !== mk.options.posKey) {
        // primo tocco su un gruppo sovrapposto: allarga, non aprire il modal
        restoreSpread();
        if (spreadGroup(mk.options.posKey, mk.options.origin)) return;
      }
      restoreSpread();
      openRaceModal(r);
    });
    markers[raceId(r)] = mk;
  });
  map.on("click", restoreSpread);
  const pts = Object.values(markers).map(mk => mk.getLatLng());
  if (pts.length) map.fitBounds(L.latLngBounds(pts).pad(0.15));
}

/* --- card PB in home --- */
function renderPbCards() {
  DIST_BUCKETS.forEach(b => {
    // range richiesti: 5km [5–5,5) · 10km [10–11) · 21km [21–22) · 42km [42–43)
    const inRange = RACES.filter(r => { const km = raceKm(r); return km != null && km >= b.min && km < b.max; });
    const best = inRange.reduce((a, r) => !a || timeToSec(r.time) < timeToSec(a.time) ? r : a, null);
    const el = document.getElementById(b.key);
    const fresh = el.cloneNode(true);
    el.replaceWith(fresh);
    if (!best) { fresh.querySelector(".pb-time").textContent = "\u2014"; fresh.querySelector(".pb-meta").textContent = "Nessuna gara"; return; }
    fresh.querySelector(".pb-time").innerHTML = fmtTime(best.time) + (fmtPace(best) ? ' <span class="pb-pace">' + fmtPace(best) + '</span>' : "");
    fresh.querySelector(".pb-meta").textContent = fmtDate(best.date) + " \u00B7 " + best.name;
    fresh.addEventListener("click", () => openRaceModal(best));
    fresh.style.cursor = "pointer";
  });
}

/* --- elenco gare --- */
function renderRaceList() {
  const list = document.getElementById("raceList");
  document.getElementById("raceCount").textContent = RACES.length;
  list.innerHTML = "";
  [...RACES].sort((a, b) => b.date.localeCompare(a.date)).forEach(r => {
    const d = document.createElement("div");
    d.className = "race-row";
    d.innerHTML = `<div class="race-info"><strong>${r.name}</strong>
      <span class="muted">${fmtDate(r.date)} \u00B7 ${r.location || "—"} \u00B7 ${r.specialty}${r.source === "manuale" ? ' · <span class="src-badge">manuale</span>' : ""}${kmKnown(r) ? "" : ' \u00B7 <span class="km-missing">distanza da impostare</span>'}</span></div>
      <div class="race-time">${r.time}${r.pb ? ' <span class="pb-badge">P.B.</span>' : ""}</div>
      <button class="race-del" title="Elimina gara dall'elenco" aria-label="Elimina gara">\u{1F5D1}</button>`;
    d.querySelector(".race-del").addEventListener("click", e => {
      e.stopPropagation();
      if (!confirm(`Eliminare "${r.name}" (${fmtDate(r.date)}) dall'elenco?`)) return;
      deleteRace(r);
    });
    d.addEventListener("click", () => openRaceModal(r));
    list.appendChild(d);
  });
}

/* --- eliminazione gara dall'elenco (con conferma) --- */
function deleteRace(r) {
  const id = raceId(r);
  const idx = RACES.findIndex(x => raceId(x) === id);
  if (idx === -1) return;
  RACES.splice(idx, 1);
  // pulizia dei dati salvati per quella gara
  localStorage.removeItem("runmap:" + kmKey(r));
  localStorage.removeItem("runmap:" + raceKey(r));
  localStorage.removeItem("runmap:loc-" + id);
  if (r.source === "manuale") {
    store.set(MANUAL_KEY, store.get(MANUAL_KEY, []).filter(x => raceId(x) !== id));
  }
  renderPbCards();
  renderRaceList();
  drawMarkers();
}

/* --- refresh gare: refetch data.js --- */
async function refreshRaces(btn) {
  btn.classList.add("spinning");
  let added = 0;
  try {
    const src = await fetch("js/data.js?ts=" + Date.now(), { cache: "no-store" }).then(r => r.text());
    const fresh = new Function(src + "; return RACES;")();
    if (Array.isArray(fresh)) {
      // merge incrementale: aggiunge SOLO le gare nuove, non ricarica le esistenti
      // (le distanze inserite manualmente restano al loro posto)
      const have = new Set(RACES.map(raceId));
      fresh.forEach(r => { if (!have.has(raceId(r))) { RACES.push(r); added++; } });
    }
  } catch (e) {
    /* aperto via file://: il fetch è bloccato da CORS, si tengono i dati correnti. Servi la cartella via HTTP (`npm start`) per il refresh dinamico. */
    console.error(e);
  }
  if (added) {
    renderPbCards();
    renderRaceList();
    drawMarkers();
    btn.title = added + " nuova" + (added === 1 ? " gara" : " gare") + " aggiunta" + (added === 1 ? "" : "e");
  }
  setTimeout(() => btn.classList.remove("spinning"), 600);
}

const refreshBtn = document.getElementById("refreshBtn");
refreshBtn.addEventListener("click", () => refreshRaces(refreshBtn));

/* --- modal dettaglio gara: tempi per anno + P.B., foto e note --- */
const modal = document.getElementById("modal");
const modalBody = document.getElementById("modalBody");
document.getElementById("modalClose").addEventListener("click", () => modal.hidden = true);
modal.addEventListener("click", e => { if (e.target === modal) modal.hidden = true; });
document.addEventListener("keydown", e => { if (e.key === "Escape") modal.hidden = true; });

/* --- link ai risultati: iRunning di default, URL custom se presenti --- */
function resultsLink(r) {
  if (r.resultsUrl)
    return `<a href="${r.resultsUrl}" target="_blank" rel="noopener">risultati \u2197</a>`;
  return `<a href="https://www.irunning.it/risultato_realtime.php?id=${r.irunId}" target="_blank" rel="noopener">risultati su iRunning \u2197</a>`;
}

function openRaceModal(race) {
  if (!race) { modal.hidden = true; return; }
  // raggruppa per GARA (stesso nome, normalizzato), non per città:
  // gare diverse nella stessa città restano separate
  const norm = n => n.toLowerCase().replace(/[^a-z0-9]/g, "").replace(/(\d+[.,]?\d*)km/, "$1");
  const sameRace = RACES.filter(x => norm(x.name) === norm(race.name));
  const byYear = {};
  sameRace.forEach(x => { (byYear[x.date.slice(0, 4)] ||= []).push(x); });

  let rows = "";
  const bestTime = sameRace.reduce((m, x) => Math.min(m, timeToSec(x.time)), Infinity);
  Object.keys(byYear).sort().reverse().forEach(y => {
    byYear[y].forEach(x => {
      const isBest = timeToSec(x.time) === bestTime;
      rows += `<tr><td>${y}</td><td>${x.name}</td><td>${x.time}</td><td>${isBest ? '<span class="pb-badge">P.B.</span>' : ""}</td></tr>`;
    });
  });

  const s = getNotes(race);
  const known = kmKnown(race);
  const manualKm = store.get(kmKey(race), null);
  const distanzaAttuale = raceKm(race);
  modalBody.innerHTML = `
    <h2>${race.name}</h2>
    <p class="muted">${fmtDate(race.date)} \u00B7 ${race.location} \u00B7 specialit\u00E0: ${race.specialty}
      \u00B7 ${resultsLink(race)}</p>
    <div class="km-box">
      <label for="kmField">${known
        ? `Distanza: <strong>${distanzaAttuale} km</strong>${manualKm != null ? " (inserita manualmente: " + manualKm + " km)" : " (dalla nome della gara)"} \u2014 modificabile`
        : "Distanza non rilevata dal nome: inseriscila manualmente (km)"}</label>
      <div class="km-row">
        <input type="number" id="kmField" min="0.5" max="200" step="0.1" value="${manualKm != null ? manualKm : (distanzaAttuale != null ? distanzaAttuale : "")}" placeholder="es. 10">
        <button id="kmSave" class="km-save">Salva</button>
        ${manualKm != null ? '<button id="kmReset" class="km-reset">Ripristina dal nome</button>' : ""}
      </div>
    </div>
    <table class="times"><thead><tr><th>Anno</th><th>Gara</th><th>Tempo</th><th></th></tr></thead><tbody>${rows}</tbody></table>
    <h3>Città</h3>
    <div class="km-box">
      <label for="cityEditField">Modifica la città per posizionare il pin sulla mappa</label>
      <div class="km-row">
        <input type="text" id="cityEditField" autocomplete="off" placeholder="es. Roma" value="${(effLoc(race).location || "").replace(/"/g, "&quot;")}">
        <button id="cityEditSave" class="km-save">Salva città</button>
      </div>
      <p id="cityEditMsg" class="muted" hidden></p>
    </div>
    ${race.source === "manuale" ? `
    <h3>Modifica gara</h3>
    <div class="km-box">
      <label for="nameEditField">Nome della gara (modificabile)</label>
      <div class="km-row">
        <input type="text" id="nameEditField" autocomplete="off" value="${escapeHtml(race.name)}">
        <button id="nameEditSave" class="km-save">Salva nome</button>
      </div>
      <label for="resDateField">Aggiungi risultato di un altro anno</label>
      <div class="km-row">
        <input type="date" id="resDateField" required>
        <input type="text" id="resTimeField" autocomplete="off" placeholder="es. 1:45:30" required>
        <button id="resAddBtn" class="km-save">Aggiungi</button>
      </div>
      <p id="resMsg" class="muted" hidden></p>
    </div>` : ""}
    <h3>Note</h3>
    <textarea id="noteField" rows="3" placeholder="Aggiungi una nota\u2026">${s.note.replace(/</g, "&lt;")}</textarea>
    <h3>Foto</h3>
    <input type="file" id="photoInput" accept="image/*" multiple>
    <div id="photoGrid" class="photo-grid"></div>`;

  renderPhotos(race, s.photos);
  const kmSave = document.getElementById("kmSave");
  if (kmSave) kmSave.addEventListener("click", () => {
    const v = parseFloat(document.getElementById("kmField").value.replace(",", "."));
    if (!v || v <= 0) return;
    store.set(kmKey(race), v);
    modal.hidden = true;
    renderPbCards();
    renderRaceList();
    drawMarkers();
    openRaceModal(race); // riapri per mostrare il valore aggiornato
  });
  const kmReset = document.getElementById("kmReset");
  if (kmReset) kmReset.addEventListener("click", () => {
    localStorage.removeItem("runmap:" + kmKey(race));
    modal.hidden = true;
    renderPbCards();
    renderRaceList();
    drawMarkers();
    openRaceModal(race);
  });
  /* --- modifica città: autocomplete + geocoding di riserva, come in creazione --- */
  const cityField = document.getElementById("cityEditField");
  const cityMsg = document.getElementById("cityEditMsg");
  let cityPick = null;
  attachCityAutocomplete(cityField, pick => { cityPick = pick; cityMsg.hidden = true; });
  document.getElementById("cityEditSave").addEventListener("click", async () => {
    const typed = cityField.value.trim();
    if (!typed) return;
    let location, lat, lng;
    if (cityPick && normId(cityPick.name) === normId(typed)) {
      ({ name: location, lat, lng } = cityPick);       // scelta dai suggerimenti
    } else {
      const res = await geocodeQuery(typed);           // di riserva: geocoding
      if (!res.length) {
        cityMsg.textContent = "Città non trovata. Seleziona un suggerimento dall'elenco mentre digiti.";
        cityMsg.hidden = false;
        return;
      }
      location = shortPlaceName(res[0]);
      lat = parseFloat(res[0].lat); lng = parseFloat(res[0].lon);
      cityField.value = location;
    }
    setRaceLocation(race, location, lat, lng);
    cityPick = null;
    modal.hidden = true;
    renderPbCards();
    renderRaceList();
    drawMarkers();
    openRaceModal(race);
  });
  /* --- modifica nome + aggiunta risultato per gare manuali --- */
  const nameEditSave = document.getElementById("nameEditSave");
  if (nameEditSave) nameEditSave.addEventListener("click", () => {
    const newName = document.getElementById("nameEditField").value.trim();
    if (!newName || newName === race.name) return;
    renameManualRace(race, newName);
    modal.hidden = true;
    refreshAfterManual();
    openRaceModal(race);
  });
  const resAddBtn = document.getElementById("resAddBtn");
  if (resAddBtn) resAddBtn.addEventListener("click", () => {
    const msg = document.getElementById("resMsg");
    const date = document.getElementById("resDateField").value;
    const time = document.getElementById("resTimeField").value.trim();
    if (!date || !time) { msg.textContent = "Inserisci data e tempo."; msg.hidden = false; return; }
    if (!/^\d{1,2}:\d{2}(:\d{2})?$/.test(time)) { msg.textContent = "Formato tempo: mm:ss oppure h:mm:ss."; msg.hidden = false; return; }
    if (RACES.some(x => raceId(x) === manualRaceId(race.name, date))) { msg.textContent = "Risultato gi\u00e0 presente per quella data."; msg.hidden = false; return; }
    const added = addManualResult(race, date, time);
    modal.hidden = true;
    refreshAfterManual();
    if (added.pb) alert("Complimenti! Nuovo P.B. per questa gara \uD83C\uDF89");
    openRaceModal(added);
  });
  document.getElementById("noteField").addEventListener("input", e => {
    const d = getNotes(race); d.note = e.target.value; store.set(raceKey(race), d);
  });
  document.getElementById("photoInput").addEventListener("change", e => {
    [...e.target.files].forEach(f => {
      const reader = new FileReader();
      reader.onload = () => {
        const d = getNotes(race);
        d.photos.push(reader.result);
        if (d.photos.length > 12) d.photos.shift(); // limite memoria
        store.set(raceKey(race), d);
        renderPhotos(race, d.photos);
      };
      reader.readAsDataURL(f);
    });
  });
  modal.hidden = false;
  modalBody.scrollTop = 0;
}

function renderPhotos(race, photos) {
  const grid = document.getElementById("photoGrid");
  grid.innerHTML = "";
  photos.forEach((src, i) => {
    const w = document.createElement("div");
    w.className = "photo-item";
    w.innerHTML = `<img src="${src}" alt="foto gara"><button class="photo-del" title="Elimina">\u2715</button>`;
    w.querySelector(".photo-del").addEventListener("click", () => {
      const d = getNotes(race); d.photos.splice(i, 1); store.set(raceKey(race), d); renderPhotos(race, d.photos);
    });
    grid.appendChild(w);
  });
}

/* --- geocoding / autocomplete città (Nominatim / OpenStreetMap) --- */
async function geocodeQuery(q) {
  const url = "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&accept-language=it&countrycodes=it&q=" + encodeURIComponent(q);
  try {
    const res = await fetch(url, { headers: { "Accept-Language": "it" } });
    if (!res.ok) return [];
    return await res.json();
  } catch { return []; }
}
function shortPlaceName(item) {
  // nome breve: città/comune quando disponibile
  const a = item.address || {};
  return a.city || a.town || a.village || a.municipality || a.hamlet || (item.display_name || "").split(",")[0];
}
// aggancia un autocomplete all'input: mostra i suggerimenti e chiama onPick({name,lat,lng})
function attachCityAutocomplete(input, onPick) {
  let box = input.parentElement.querySelector(".city-suggest");
  if (!box) {
    box = document.createElement("div");
    box.className = "city-suggest";
    input.parentElement.appendChild(box);
  }
  let timer = null, current = [];
  const hide = () => { box.innerHTML = ""; box.hidden = true; };
  const show = items => {
    current = items;
    box.innerHTML = items.map((it, i) => `<div class="city-opt" data-i="${i}">${it.display_name}</div>`).join("");
    box.hidden = items.length === 0;
    box.querySelectorAll(".city-opt").forEach(el => el.addEventListener("mousedown", e => {
      e.preventDefault();
      const it = current[+el.dataset.i];
      input.value = shortPlaceName(it);
      hide();
      onPick({ name: shortPlaceName(it), lat: parseFloat(it.lat), lng: parseFloat(it.lon) });
    }));
  };
  input.addEventListener("input", () => {
    clearTimeout(timer);
    const q = input.value.trim();
    if (q.length < 2) { hide(); return; }
    timer = setTimeout(async () => { show(await geocodeQuery(q)); }, 350);
  });
  input.addEventListener("blur", () => setTimeout(hide, 150));
}

/* --- località effettiva di una gara (con eventuale override salvato) --- */
function locOverride(r) { return store.get("loc-" + raceId(r), null); }
function effLoc(r) {
  const o = locOverride(r);
  return o ? { location: o.location, lat: o.lat, lng: o.lng }
           : { location: r.location, lat: r.lat, lng: r.lng };
}
function setRaceLocation(r, location, lat, lng) {
  r.location = location; r.lat = lat; r.lng = lng;
  store.set("loc-" + raceId(r), { location, lat, lng });
  if (r.source === "manuale") saveManualRace(r);
}

function escapeHtml(s) { return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }

/* --- ricalcolo P.B. per tutte le gare con lo stesso nome (persistite quelle manuali) --- */
function recomputePb(name) {
  const group = RACES.filter(x => normId(x.name) === normId(name));
  const best = group.reduce((a, x) => !a || timeToSec(x.time) < timeToSec(a.time) ? x : a, null);
  group.forEach(x => { x.pb = x === best; if (x.source === "manuale") saveManualRace(x); });
}
function renameManualRace(race, newName) {
  const old = race.name;
  race.name = newName;
  saveManualRace(race);
  recomputePb(old);       // ricalcola il gruppo col vecchio nome
  recomputePb(newName);   // e quello col nuovo nome
}
function addManualResult(base, date, time) {
  const normTime = time.split(":").length === 2 ? "00:" + time : time;
  const race = {
    date,
    location: base.location,
    name: base.name,
    specialty: base.specialty,
    manualId: manualRaceId(base.name, date),
    time: normTime,
    pb: false,
    km: base.km,
    source: "manuale",
    lat: base.lat, lng: base.lng
  };
  if (base.lat != null) {
    const o = locOverride(base);
    if (o) { race.location = o.location; race.lat = o.lat; race.lng = o.lng; }
  }
  RACES.push(race);
  saveManualRace(race);
  recomputePb(base.name);
  return race;
}

/* --- aggiunta manuale di una gara non presente sui portali --- */
const MANUAL_KEY = "manualRaces";
function loadManualRaces() {
  // 1) gare manuali "di serie" incluse nella versione (seed statico)
  (window.SEED_MANUAL_RACES || []).forEach(r => {
    if (!RACES.some(x => raceId(x) === raceId(r))) RACES.push(r);
  });
  // 2) gare inserite a mano nel browser (localStorage)
  store.get(MANUAL_KEY, []).forEach(r => {
    if (!RACES.some(x => raceId(x) === raceId(r))) RACES.push(r);
  });
}
function saveManualRace(race) {
  const list = store.get(MANUAL_KEY, []).filter(x => raceId(x) !== raceId(race));
  list.push(race);
  store.set(MANUAL_KEY, list);
}
function manualRaceId(name, date) { return "man-" + normId(name) + "-" + date; }
function normId(s) { return s.toLowerCase().replace(/[^a-z0-9]/g, ""); }

const toggleManualBtn = document.getElementById("toggleManualBtn");
const manualCard = document.getElementById("manualCard");
toggleManualBtn.addEventListener("click", () => {
  manualCard.hidden = !manualCard.hidden;
});
document.getElementById("closeManualBtn").addEventListener("click", () => {
  manualCard.hidden = true;
});
const manualForm = document.getElementById("manualForm");
let mLocPick = null; // città scelta dai suggerimenti {name,lat,lng}
attachCityAutocomplete(document.getElementById("mLoc"), pick => { mLocPick = pick; });
manualForm.addEventListener("submit", async e => {
  e.preventDefault();
  const name = document.getElementById("mName").value.trim();
  const date = document.getElementById("mDate").value;
  const km = parseFloat(document.getElementById("mKm").value.replace(",", "."));
  const time = document.getElementById("mTime").value.trim();
  if (!name || !date || !km || !time) return;
  if (!/^\d{1,2}:\d{2}(:\d{2})?$/.test(time)) { alert("Formato tempo: mm:ss oppure h:mm:ss (es. 45:30 o 1:45:30)"); return; }
  const normTime = time.split(":").length === 2 ? "00:" + time : time;

  let locName = document.getElementById("mLoc").value.trim() || "";
  let lat = null, lng = null;
  if (mLocPick && locName && normId(mLocPick.name) === normId(locName)) {
    // città scelta dai suggerimenti: coordinate affidabili
    ({ lat, lng } = mLocPick);
    locName = mLocPick.name;
  } else if (locName) {
    // solo testo digitato: prova il geocoding; se fallisce la gara viene comunque salvata (senza pin)
    const res = await geocodeQuery(locName);
    if (res.length) {
      locName = shortPlaceName(res[0]);
      lat = parseFloat(res[0].lat); lng = parseFloat(res[0].lon);
    } else {
      alert("Città \"" + locName + "\" non trovata: la gara viene salvata ma senza pin sulla mappa. Potrai correggerla in seguito dal dettaglio gara (sezione Città).");
    }
  }

  const race = {
    date,
    location: locName,
    name,
    specialty: document.getElementById("mSpec").value,
    manualId: manualRaceId(name, date),
    time: normTime,
    pb: false,                       // P.B. calcolato automaticamente sotto
    km,                              // distanza nota al momento dell'inserimento
    source: "manuale",
    lat, lng            // con coordinate: pin sulla mappa; senza (geocoding fallito): solo lista/PB
  };

  // P.B. in automatico: segna pb=true se è il migliore tra le gare con lo stesso nome
  const same = RACES.filter(x => normId(x.name) === normId(name));
  const bestPrev = same.reduce((m, x) => Math.min(m, timeToSec(x.time)), Infinity);
  if (timeToSec(normTime) < bestPrev) race.pb = true;

  RACES.push(race);
  saveManualRace(race);

  // note (dalla form) e foto: persistite nello stesso storage delle gare importate
  const note = document.getElementById("mNote").value.trim();
  const photos = [...document.getElementById("mPhoto").files];
  const d = getNotes(race);
  if (note) d.note = note;
  let pending = photos.length;
  photos.forEach(f => {
    const reader = new FileReader();
    reader.onload = () => {
      d.photos.push(reader.result);
      store.set(raceKey(race), d);
      if (--pending === 0) refreshAfterManual();
    };
    reader.readAsDataURL(f);
  });
  if (note) store.set(raceKey(race), d);

  manualForm.reset();
  mLocPick = null;
  if (pending === 0) refreshAfterManual();
  if (race.pb) setTimeout(() => alert("Complimenti! Nuovo P.B. per questa gara 🎉"), 100);
});

function refreshAfterManual() {
  renderPbCards();
  renderRaceList();
  drawMarkers();
}

/* --- init --- */
window.RACES = RACES;
loadManualRaces();
applyTheme(store.get("theme", "light"));
renderPbCards();
renderRaceList();
drawMarkers();

