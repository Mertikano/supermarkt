"use strict";

/* ---------- Konstanten ---------- */
const MEALS = ["Frühstück / Abendessen", "Mittagessen", "Snack / Süßigkeiten", "Sonstiges"];
// Alte Werte aus früheren Versionen auf die neuen Gruppen abbilden
function normalizeMeal(m) {
  if (m === "Frühstück" || m === "Abendessen") return "Frühstück / Abendessen";
  if (m === "Snack" || m === "Süßigkeiten") return "Snack / Süßigkeiten";
  return MEALS.includes(m) ? m : "Sonstiges";
}
const DEFAULT_CATEGORIES = ["Nudeln", "Fleischersatz", "Süßigkeiten", "Snacks"];
const DB_NAME = "supermarkt";

/* ---------- IndexedDB ---------- */
let db;
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const d = req.result;
      d.createObjectStore("products", { keyPath: "id" });
      d.createObjectStore("categories", { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
function tx(store, mode, fn) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    const r = fn(s);
    t.oncomplete = () => resolve(r && r.result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}
const dbAll = (store) => tx(store, "readonly", (s) => s.getAll());
const dbPut = (store, obj) => tx(store, "readwrite", (s) => s.put(obj));
const dbDel = (store, id) => tx(store, "readwrite", (s) => s.delete(id));

/* ---------- State ---------- */
let products = [];
let categories = [];
let sortKey = "name";
let sortDir = 1;
let filterCat = "";
let search = "";
let editing = null; // Produkt oder null
let formRating = 0;
let formImage = null;

const $ = (id) => document.getElementById(id);
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));
const catName = (id) => (categories.find((c) => c.id === id) || {}).name || "";

/* ---------- Hilfsfunktionen ---------- */
function parsePrice(s) {
  const n = parseFloat(String(s).trim().replace(/\s/g, "").replace(",", "."));
  return isNaN(n) ? null : n;
}
function fmtPrice(n) {
  return n == null ? "–" : n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
// Einzelner Stern: "full", "half" oder "off" (Bewertung in 0,5er-Schritten)
function starClass(i, n) {
  return n >= i ? "full" : n >= i - 0.5 ? "half" : "off";
}
function starsHTML(n) {
  let s = "";
  for (let i = 1; i <= 5; i++) s += `<span class="star ${starClass(i, n)}">★</span>`;
  return s;
}
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/* Bild auf max. 1200 px verkleinern -> Data-URL (hält Backups klein) */
function downscale(file, maxSide = 1200) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const c = document.createElement("canvas");
      c.width = w; c.height = h;
      c.getContext("2d").drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL("image/jpeg", 0.8));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Bild konnte nicht gelesen werden")); };
    img.src = url;
  });
}

/* ---------- Laden / Rendern ---------- */
async function load() {
  products = await dbAll("products");
  categories = (await dbAll("categories")).sort((a, b) => a.name.localeCompare(b.name, "de"));
  // Einmalige Anpassung alter Daten (idempotent)
  for (const p of products) {
    const m = normalizeMeal(p.meal);
    if (m !== p.meal) { p.meal = m; await dbPut("products", p); }
  }
}

function sortValue(p, key) {
  switch (key) {
    case "price": return p.price ?? -1;
    case "rating": return p.rating || 0;
    case "category": return catName(p.categoryId).toLowerCase();
    case "meal": return (p.meal || "").toLowerCase();
    case "supermarket": return (p.supermarket || "").toLowerCase();
    case "notes": return (p.notes || "").toLowerCase();
    default: return (p.name || "").toLowerCase();
  }
}

function visibleProducts() {
  const q = search.trim().toLowerCase();
  let list = products.filter((p) => {
    if (filterCat === "__none") { if (p.categoryId) return false; }
    else if (filterCat && p.categoryId !== filterCat) return false;
    if (!q) return true;
    return [p.name, p.supermarket, p.notes, catName(p.categoryId), p.meal].some((v) => (v || "").toLowerCase().includes(q));
  });
  list.sort((a, b) => {
    const x = sortValue(a, sortKey), y = sortValue(b, sortKey);
    const r = typeof x === "number" ? x - y : x.localeCompare(y, "de");
    return (r || a.name.localeCompare(b.name, "de")) * sortDir;
  });
  return list;
}

function renderProducts() {
  document.querySelectorAll("#table th").forEach((th) => {
    const on = th.dataset.key === sortKey;
    th.classList.toggle("sorted", on);
    th.classList.toggle("desc", on && sortDir < 0);
  });
  const list = visibleProducts();
  $("tbody").innerHTML = list.map((p) => `
    <tr data-id="${p.id}">
      <td class="name">${p.image ? `<img class="thumb" src="${p.image}" alt="">` : `<div class="thumb ph">🛒</div>`}<span>${esc(p.name)}</span></td>
      <td>${esc(p.supermarket)}</td>
      <td class="num">${fmtPrice(p.price)}</td>
      <td>${esc(catName(p.categoryId))}</td>
      <td>${esc(p.meal)}</td>
      <td><span class="stars">${starsHTML(p.rating || 0)}</span></td>
      <td class="notes">${esc(p.notes)}</td>
    </tr>`).join("");
  $("empty").hidden = products.length > 0;
  $("count").textContent = products.length ? `${list.length} von ${products.length} Produkten` : "";
}

function renderFilter() {
  const sel = $("filterCat");
  const cur = filterCat;
  sel.innerHTML = `<option value="">Alle Kategorien</option><option value="__none">Ohne Kategorie</option>` +
    categories.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join("");
  sel.value = cur;
  if (sel.value !== cur) { filterCat = ""; sel.value = ""; }
}

function renderCategories() {
  const count = {};
  products.forEach((p) => { if (p.categoryId) count[p.categoryId] = (count[p.categoryId] || 0) + 1; });
  $("catList").innerHTML = categories.length
    ? categories.map((c) => `
      <li data-id="${c.id}">
        <span class="grow">${esc(c.name)}</span>
        <span class="n">${count[c.id] || 0}</span>
        <button data-act="rename" aria-label="Umbenennen">✎</button>
        <button data-act="delete" aria-label="Löschen">🗑</button>
      </li>`).join("")
    : `<li><span class="grow n">Noch keine Kategorien.</span></li>`;
}

function renderMarkets() {
  const names = [...new Set(products.map((p) => p.supermarket).filter(Boolean))].sort((a, b) => a.localeCompare(b, "de"));
  $("markets").innerHTML = names.map((n) => `<option value="${esc(n)}">`).join("");
}

function renderAll() {
  renderFilter();
  renderProducts();
  renderCategories();
  renderMarkets();
  const last = localStorage.getItem("lastBackup");
  $("lastBackup").textContent = last ? "Letztes Backup: " + new Date(last).toLocaleString("de-DE") : "Noch kein Backup erstellt.";
}

/* ---------- Tabs ---------- */
const titles = { products: "Produkte", categories: "Kategorien", backup: "Mehr" };
document.querySelectorAll(".tabs button").forEach((b) => {
  b.onclick = () => {
    document.querySelectorAll(".tabs button").forEach((x) => x.classList.toggle("active", x === b));
    for (const v of Object.keys(titles)) $("view-" + v).hidden = v !== b.dataset.view;
    $("title").textContent = titles[b.dataset.view];
    $("addBtn").hidden = b.dataset.view !== "products";
    window.scrollTo(0, 0);
  };
});

/* ---------- Tabelle: Sortieren, Suche, Filter, Öffnen ---------- */
document.querySelectorAll("#table th").forEach((th) => {
  th.onclick = () => {
    if (sortKey === th.dataset.key) sortDir = -sortDir;
    else { sortKey = th.dataset.key; sortDir = th.dataset.key === "rating" ? -1 : 1; }
    renderProducts();
  };
});
$("search").oninput = (e) => { search = e.target.value; renderProducts(); };
$("filterCat").onchange = (e) => { filterCat = e.target.value; renderProducts(); };
$("tbody").onclick = (e) => {
  const tr = e.target.closest("tr");
  if (tr) openForm(products.find((p) => p.id === tr.dataset.id));
};
$("addBtn").onclick = () => openForm(null);

/* ---------- Produkt-Formular ---------- */
function renderFormStars() {
  $("f-stars").innerHTML = [1, 2, 3, 4, 5].map((i) => `<span data-v="${i}" class="star ${starClass(i, formRating)}">★</span>`).join("");
  $("f-ratingText").textContent = formRating ? String(formRating).replace(".", ",") + " von 5" : "keine Bewertung";
}
// Linke Hälfte eines Sterns = halber Stern, rechte Hälfte = ganzer Stern
$("f-stars").onclick = (e) => {
  const star = e.target.closest("[data-v]");
  if (!star) return;
  const rect = star.getBoundingClientRect();
  const left = e.clientX - rect.left < rect.width / 2;
  const v = +star.dataset.v - (left ? 0.5 : 0);
  formRating = formRating === v ? 0 : v;
  renderFormStars();
};
function showFormImage() {
  $("f-img").hidden = !formImage;
  $("f-imgRemove").hidden = !formImage;
  if (formImage) $("f-img").src = formImage;
}
function openForm(p) {
  editing = p;
  $("dlgTitle").textContent = p ? "Produkt bearbeiten" : "Neues Produkt";
  $("f-name").value = p ? p.name : "";
  $("f-market").value = p ? p.supermarket || "" : "";
  $("f-price").value = p && p.price != null ? String(p.price).replace(".", ",") : "";
  $("f-cat").innerHTML = `<option value="">Keine</option>` + categories.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join("");
  $("f-cat").value = p ? p.categoryId || "" : "";
  $("f-meal").innerHTML = MEALS.map((m) => `<option>${m}</option>`).join("");
  $("f-meal").value = p ? normalizeMeal(p.meal) : "Mittagessen";
  $("f-notes").value = p ? p.notes || "" : "";
  formRating = p ? p.rating || 0 : 0;
  formImage = p ? p.image || null : null;
  $("f-file").value = "";
  $("f-delete").hidden = !p;
  renderFormStars();
  showFormImage();
  $("dlg").showModal();
}
$("f-file").onchange = async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try { formImage = await downscale(file); showFormImage(); }
  catch (err) { alert(err.message); }
};
$("f-imgRemove").onclick = () => { formImage = null; $("f-file").value = ""; showFormImage(); };
$("f-img").onclick = () => { $("imgBig").src = formImage; $("imgDlg").showModal(); };
$("imgDlg").onclick = () => $("imgDlg").close();
$("f-cancel").onclick = () => $("dlg").close();
$("f-delete").onclick = async () => {
  if (!editing || !confirm(`„${editing.name}" wirklich löschen?`)) return;
  await dbDel("products", editing.id);
  $("dlg").close();
  await load(); renderAll();
};
$("form").onsubmit = async (e) => {
  e.preventDefault();
  const name = $("f-name").value.trim();
  if (!name) return;
  const p = editing || { id: uid(), created: Date.now() };
  p.name = name;
  p.supermarket = $("f-market").value.trim();
  p.price = parsePrice($("f-price").value);
  p.categoryId = $("f-cat").value || null;
  p.meal = $("f-meal").value;
  p.rating = formRating;
  p.notes = $("f-notes").value.trim();
  p.image = formImage;
  await dbPut("products", p);
  $("dlg").close();
  await load(); renderAll();
};

/* ---------- Kategorien ---------- */
$("addCat").onclick = async () => {
  const n = (prompt("Name der neuen Kategorie:") || "").trim();
  if (!n) return;
  if (categories.some((c) => c.name.toLowerCase() === n.toLowerCase())) return alert("Diese Kategorie gibt es schon.");
  await dbPut("categories", { id: uid(), name: n });
  await load(); renderAll();
};
$("catList").onclick = async (e) => {
  const btn = e.target.closest("button");
  const li = e.target.closest("li[data-id]");
  if (!btn || !li) return;
  const cat = categories.find((c) => c.id === li.dataset.id);
  if (btn.dataset.act === "rename") {
    const n = (prompt("Neuer Name:", cat.name) || "").trim();
    if (!n) return;
    cat.name = n;
    await dbPut("categories", cat);
  } else if (btn.dataset.act === "delete") {
    if (!confirm(`Kategorie „${cat.name}" löschen? Die Produkte bleiben erhalten.`)) return;
    for (const p of products.filter((p) => p.categoryId === cat.id)) { p.categoryId = null; await dbPut("products", p); }
    await dbDel("categories", cat.id);
  }
  await load(); renderAll();
};

/* ---------- Backup ---------- */
function msg(t) { $("backupMsg").textContent = t; }

$("exportBtn").onclick = async () => {
  const data = {
    app: "supermarkt", version: 1, exported: new Date().toISOString(),
    categories, products,
  };
  const json = JSON.stringify(data);
  const name = `Supermarkt-Backup-${new Date().toISOString().slice(0, 10)}.json`;
  const file = new File([json], name, { type: "application/json" });
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: name }); // iOS: "In Dateien sichern", AirDrop, Mail …
    } else {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(file);
      a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    }
    localStorage.setItem("lastBackup", new Date().toISOString());
    renderAll();
    msg("Backup erstellt.");
  } catch (err) {
    if (err && err.name !== "AbortError") msg("Export fehlgeschlagen: " + err.message);
  }
};

$("importFile").onchange = async (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (data.app !== "supermarkt" || !Array.isArray(data.products)) throw new Error("Das ist keine Supermarkt-Backup-Datei.");
    // Kategorien per Name zusammenführen
    const byName = new Map(categories.map((c) => [c.name.toLowerCase(), c]));
    const idMap = new Map();
    for (const c of data.categories || []) {
      let ex = byName.get(c.name.toLowerCase());
      if (!ex) { ex = { id: c.id || uid(), name: c.name }; await dbPut("categories", ex); byName.set(c.name.toLowerCase(), ex); }
      idMap.set(c.id, ex.id);
    }
    for (const p of data.products) {
      p.categoryId = p.categoryId ? idMap.get(p.categoryId) || null : null;
      p.meal = normalizeMeal(p.meal);
      await dbPut("products", p); // gleiche ID wird aktualisiert, neue werden ergänzt
    }
    await load(); renderAll();
    msg(`${data.products.length} Produkte importiert.`);
  } catch (err) {
    msg("Import fehlgeschlagen: " + err.message);
  }
};


/* ---------- Design nach Jahreszeit ---------- */
const THEMES = {
  fruehling:   { label: "Frühling",   emoji: "🌸" },
  sommer:      { label: "Sommer",     emoji: "☀️" },
  herbst:      { label: "Herbst",     emoji: "🍂" },
  winter:      { label: "Winter",     emoji: "❄️" },
  ostern:      { label: "Ostern",     emoji: "🐣" },
  weihnachten: { label: "Weihnachten", emoji: "🎄" },
};
function easterSunday(y) { // Gaußsche Osterformel
  const a = y % 19, b = Math.floor(y / 100), c = y % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(y, month - 1, day);
}
function autoTheme(now = new Date()) {
  const y = now.getFullYear();
  const today = new Date(y, now.getMonth(), now.getDate());
  const e = easterSunday(y);
  const from = new Date(e); from.setDate(e.getDate() - 14);  // 2 Wochen vor Ostern
  const to = new Date(e); to.setDate(e.getDate() + 1);       // bis Ostermontag
  if (today >= from && today <= to) return "ostern";
  const md = (now.getMonth() + 1) * 100 + now.getDate();
  if (md >= 1201 && md <= 1226) return "weihnachten";
  if (md >= 1227 || md <= 320) return "winter";
  if (md <= 620) return "fruehling";
  if (md <= 922) return "sommer";
  return "herbst";
}
function themePref() {
  try { return localStorage.getItem("theme") || "auto"; } catch { return "auto"; }
}
const APP_VERSION = "4";
function applyTheme() {
  const pref = themePref();
  const name = THEMES[pref] ? pref : autoTheme();
  document.documentElement.dataset.theme = name;
  $("version").textContent = `Version ${APP_VERSION} · aktives Design: ${THEMES[name].label}`;
  $("themeEmoji").textContent = THEMES[name].emoji;
  $("emptyEmoji").textContent = THEMES[name].emoji;
  const bg = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim();
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta && bg) meta.content = bg;
  const sel = $("themeSel");
  sel.innerHTML = `<option value="auto">Automatisch (jetzt: ${THEMES[autoTheme()].emoji} ${THEMES[autoTheme()].label})</option>` +
    Object.entries(THEMES).map(([k, t]) => `<option value="${k}">${t.emoji} ${t.label}</option>`).join("");
  sel.value = THEMES[pref] ? pref : "auto";
}
$("themeSel").onchange = (e) => {
  try { localStorage.setItem("theme", e.target.value); } catch {}
  applyTheme();
};
document.addEventListener("visibilitychange", () => { if (!document.hidden) applyTheme(); });
try {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  if (mq.addEventListener) mq.addEventListener("change", applyTheme);
  else if (mq.addListener) mq.addListener(applyTheme);
} catch {}
applyTheme();

/* ---------- Start ---------- */
(async function init() {
  db = await openDB();
  if (!localStorage.getItem("seeded")) {
    for (const n of DEFAULT_CATEGORIES) await dbPut("categories", { id: uid(), name: n });
    localStorage.setItem("seeded", "1");
  }
  await load();
  renderAll();
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
})();
