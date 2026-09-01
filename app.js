import {
  DEFAULT_PROFILE,
  DIRECTION_LABELS,
  cardinalFromDegrees,
  combineForecasts,
  findWindows
} from "./scoring.js";
import { exportBackup, importGoogleTakeout, parseBackup } from "./importers.js";
import { catalogSpot, googleMapsDirectionsUrl, personalStarterSpots, SPOT_CATALOG } from "./catalog.js";
import { matchCatalogSpot, parseShareTarget } from "./share-target.js";
import { fetchJson, forecastUrls } from "./forecast.js";
import { writeWorkerValue } from "./worker-store.js";

const STORAGE_KEY = "surf-radar-state-v1";
const FORECAST_PREFIX = "surf-radar-forecast-";
const KNOWN_WINDOWS_KEY = "surf-radar-known-windows";
const ALERT_MODE_KEY = "surf-radar-alert-mode";
const PERSONAL_SEED_VERSION = 2;
const CACHE_MAX_AGE = 3 * 60 * 60 * 1000;
const app = document.querySelector("#app");
const spotDialog = document.querySelector("#spot-dialog");
const spotForm = document.querySelector("#spot-form");
const catalogDialog = document.querySelector("#catalog-dialog");
const catalogList = document.querySelector("#catalog-list");
const spotSearchInput = document.querySelector("#spot-search-input");
const spotSearchButton = document.querySelector("#spot-search-button");
const spotSearchResults = document.querySelector("#spot-search-results");
const spotLocationStatus = document.querySelector("#spot-location-status");
const takeoutInput = document.querySelector("#takeout-input");
const backupInput = document.querySelector("#backup-input");
const refreshButton = document.querySelector("#refresh-button");
const installButton = document.querySelector("#install-button");
const dataStatus = document.querySelector("#data-status");
const toastElement = document.querySelector("#toast");

let deferredInstallPrompt = null;
let toastTimer = null;
let refreshing = false;
let spotMap = null;
let spotMarker = null;
let lastGeocodeAt = 0;
let currentSearchResults = [];
const geocodeCache = new Map();
const runtime = new Map();

const initialState = {
  profile: { ...DEFAULT_PROFILE },
  spots: personalStarterSpots(),
  personalSeedVersion: PERSONAL_SEED_VERSION
};

function sameSavedSpot(existing, candidate) {
  if (existing.catalogId && existing.catalogId === candidate.catalogId) return true;
  const close = Number.isFinite(Number(existing.lat)) && Number.isFinite(Number(existing.lon))
    && Math.abs(Number(existing.lat) - Number(candidate.lat)) < 0.015
    && Math.abs(Number(existing.lon) - Number(candidate.lon)) < 0.015;
  return close || String(existing.name || "").toLocaleLowerCase("fr").includes(candidate.catalogId.replaceAll("-", " "));
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved?.profile && Array.isArray(saved.spots)) {
      const spots = [...saved.spots];
      if (Number(saved.personalSeedVersion || 0) < PERSONAL_SEED_VERSION) {
        for (const starter of personalStarterSpots()) {
          const existingIndex = spots.findIndex((existing) => sameSavedSpot(existing, starter));
          if (existingIndex < 0) {
            spots.push(starter);
          } else {
            const existing = spots[existingIndex];
            spots[existingIndex] = {
              ...starter,
              ...existing,
              catalogId: starter.catalogId,
              personalStarter: true,
              lat: Number.isFinite(Number(existing.lat)) ? Number(existing.lat) : starter.lat,
              lon: Number.isFinite(Number(existing.lon)) ? Number(existing.lon) : starter.lon,
              needsCoordinates: false,
              enabled: true
            };
          }
        }
      }
      return {
        ...saved,
        profile: { ...DEFAULT_PROFILE, ...saved.profile },
        spots,
        personalSeedVersion: PERSONAL_SEED_VERSION
      };
    }
  } catch (error) {
    console.warn("Sauvegarde illisible", error);
  }
  return structuredClone(initialState);
}

let state = loadState();
localStorage.setItem(STORAGE_KEY, JSON.stringify(state));

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  syncWorkerState();
}

function syncWorkerState() {
  return writeWorkerValue("state", { profile: state.profile, spots: state.spots })
    .catch((error) => console.warn("Synchronisation des alertes indisponible", error));
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
  })[character]);
}

function toast(message, duration = 3600) {
  clearTimeout(toastTimer);
  toastElement.textContent = message;
  toastElement.classList.add("visible");
  toastTimer = setTimeout(() => toastElement.classList.remove("visible"), duration);
}

function setStatus(label, mode = "ready") {
  dataStatus.innerHTML = `<span class="status-dot"></span> ${escapeHtml(label)}`;
  const dot = dataStatus.querySelector(".status-dot");
  if (mode === "loading") dot.style.background = "var(--sun)";
  if (mode === "error") dot.style.background = "var(--danger)";
}

function currentRoute() {
  const route = location.hash.replace(/^#/, "").split("?")[0];
  return ["forecast", "spots", "profile", "about"].includes(route) ? route : "forecast";
}

function updateNavigation(route) {
  document.querySelectorAll("[data-route]").forEach((link) => link.classList.toggle("active", link.dataset.route === route));
}

function render() {
  const route = currentRoute();
  updateNavigation(route);
  if (route === "spots") renderSpots();
  else if (route === "profile") renderProfile();
  else if (route === "about") renderAbout();
  else renderForecast();
}

const routeDate = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" });
const routeTime = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" });
const headlineDate = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

function formatWindowTime(window) {
  const startDate = new Date(window.start.timestamp);
  const endDate = new Date(window.end.timestamp + 60 * 60 * 1000);
  return `${routeDate.format(startDate)} · ${routeTime.format(startDate)}–${routeTime.format(endDate)}`;
}

function relativeDay(timestamp) {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const target = new Date(timestamp);
  target.setHours(0, 0, 0, 0);
  const days = Math.round((target - now) / 86400000);
  if (days === 0) return "aujourd’hui";
  if (days === 1) return "demain";
  return `dans ${days} jours`;
}

function tideLabel(slot) {
  if (!slot.tideTrend) return "marée non résolue";
  return slot.tideTrend === "rising" ? "marée montante" : "marée descendante";
}

function allWindows() {
  return [...runtime.values()]
    .flatMap((entry) => entry.windows ?? [])
    .filter((window) => window.start.timestamp > Date.now() - 60 * 60 * 1000)
    .sort((a, b) => a.start.timestamp - b.start.timestamp || b.score - a.score);
}

function travelLabel(spot) {
  if (!spot.travelHours) return "";
  const easy = Number(spot.travelHours) <= Number(state.profile.maxDriveHours || 5);
  return `${formatTravelHours(spot.travelHours)} aller · ${easy ? "décision la veille" : "escapade"}`;
}

function formatTravelHours(hours) {
  const value = Number(hours);
  if (!Number.isFinite(value)) return "";
  const wholeHours = Math.floor(value);
  const minutes = Math.round((value - wholeHours) * 60);
  return `${wholeHours} h${minutes ? ` ${minutes}` : ""}`;
}

function routeButton(spot, className = "button button-primary") {
  const mapsUrl = googleMapsDirectionsUrl(spot);
  if (!mapsUrl) return "";
  return `<a class="${className}" href="${escapeHtml(mapsUrl)}" target="_blank" rel="noreferrer" aria-label="S’y rendre à ${escapeHtml(spot.name)} avec Google Maps"><i class="ph ph-navigation-arrow" aria-hidden="true"></i><span>S’y rendre</span></a>`;
}

function readableNearMissReason(slot) {
  if (slot.cautions?.length) return slot.cautions[0];
  const labels = {
    height: "taille encore un peu éloignée de ta zone idéale",
    wind: "vent à surveiller",
    period: "houle encore peu organisée",
    direction: "orientation moins favorable",
    tide: "niveau marin moins favorable"
  };
  const weakest = Object.entries(slot.components || {})
    .filter(([key]) => key !== "daylight")
    .sort((a, b) => a[1] - b[1])[0]?.[0];
  return labels[weakest] || "conditions encore un peu irrégulières";
}

function windowCard(window) {
  const peak = window.peak;
  const swellHeight = peak.swellHeight ?? peak.waveHeight;
  const swellPeriod = peak.swellPeriod ?? peak.wavePeriod;
  const swellDirection = peak.swellDirection ?? peak.waveDirection;
  const confidenceClass = window.confidence.key === "high" ? "pill-good" : window.confidence.key === "medium" ? "pill-warning" : "";
  const reason = window.positives[0] || "Créneau cohérent avec tes réglages";
  return `
    <article class="window-card">
      <div class="window-main">
        <h3>${escapeHtml(window.spot.name)}</h3>
        <div class="window-date">${escapeHtml(formatWindowTime(window))}</div>
        <div class="condition-row">
          ${window.spot.travelHours ? `<span>${escapeHtml(travelLabel(window.spot))}</span>` : ""}
          <span>Houle ${Number(swellHeight).toFixed(1)} m · ${Number(swellPeriod).toFixed(0)} s · ${cardinalFromDegrees(swellDirection)}</span>
          <span>Vent ${Number(peak.windSpeed ?? 0).toFixed(0)} km/h · ${cardinalFromDegrees(peak.windDirection)}</span>
          <span>${escapeHtml(tideLabel(peak))}</span>
        </div>
        <p class="window-reason">${escapeHtml(reason)}.</p>
      </div>
      <div class="window-actions">
        <span class="pill ${confidenceClass}">${escapeHtml(window.confidence.label)}</span>
        ${routeButton(window.spot, "route-link")}
      </div>
    </article>`;
}

function nearMisses() {
  return [...runtime.values()].map((entry) => {
    const candidates = (entry.scored ?? []).filter((slot) => slot.timestamp > Date.now() && slot.isDay && !slot.noGoReasons.length);
    if (!candidates.length) return null;
    const best = candidates.reduce((winner, slot) => slot.score > winner.score ? slot : winner, candidates[0]);
    return { spot: entry.spot, slot: best };
  }).filter(Boolean).sort((a, b) => b.slot.score - a.slot.score).slice(0, 4);
}

function nearMissCard({ spot, slot }) {
  const swellHeight = slot.swellHeight ?? slot.waveHeight;
  const mapsUrl = googleMapsDirectionsUrl(spot);
  return `
    <article class="window-card near-miss-card">
      <div class="window-main">
        <h3>${escapeHtml(spot.name)}</h3>
        <div class="window-date">${escapeHtml(relativeDay(slot.timestamp))} · ${escapeHtml(routeTime.format(new Date(slot.timestamp)))}</div>
        <div class="condition-row">
          ${spot.travelHours ? `<span>${escapeHtml(spot.travelHours)} h aller</span>` : ""}
          ${Number.isFinite(Number(swellHeight)) ? `<span>Houle ${Number(swellHeight).toFixed(1)} m</span>` : ""}
          ${Number.isFinite(Number(slot.windSpeed)) ? `<span>Vent ${Number(slot.windSpeed).toFixed(0)} km/h</span>` : ""}
        </div>
        <p class="window-reason">${escapeHtml(readableNearMissReason(slot))}.</p>
      </div>
      <div class="window-actions">
        <span class="pill">À surveiller</span>
        ${mapsUrl ? routeButton(spot, "route-link") : ""}
      </div>
    </article>`;
}

function routeOnlyCard(spot) {
  return `
    <article class="window-card route-only-card">
      <div class="window-main">
        <h3>${escapeHtml(spot.name)}</h3>
        <div class="window-date">Prévision en cours</div>
        <p class="window-reason">Tu peux déjà préparer le trajet pendant la mise à jour des conditions.</p>
      </div>
      <div class="window-actions">${routeButton(spot, "route-link")}</div>
    </article>`;
}

function renderForecast() {
  const enabledSpots = state.spots.filter((spot) => spot.enabled && !spot.needsCoordinates);
  const windows = allWindows();
  const next = windows[0];
  const misses = nearMisses();
  let hero;

  if (!enabledSpots.length) {
    hero = `
      <section class="hero">
        <p class="eyebrow">${escapeHtml(headlineDate.format(new Date()))}</p>
        <h1>Ta prochaine session</h1>
        <p class="hero-intro">Choisis tes plages favorites. Le radar s’occupe ensuite de trouver le bon moment.</p>
        <div class="hero-actions">
          <button class="button button-primary" data-action="open-catalog"><i class="ph ph-map-pin-plus" aria-hidden="true"></i>Choisir un spot connu</button>
          <button class="button button-ghost" data-action="add-spot">Rechercher sur la carte</button>
        </div>
      </section>`;
  } else if (next) {
    const peak = next.peak;
    const swellHeight = peak.swellHeight ?? peak.waveHeight;
    hero = `
      <section class="hero">
        <p class="eyebrow">${escapeHtml(headlineDate.format(new Date()))}</p>
        <h1>Ta prochaine session</h1>
        <p class="hero-intro">Une recommandation simple pour ton niveau et les conditions.</p>
        <div class="primary-session">
          <p class="session-date">${escapeHtml(relativeDay(next.start.timestamp))} · ${escapeHtml(routeTime.format(new Date(next.start.timestamp)))}–${escapeHtml(routeTime.format(new Date(next.end.timestamp + 60 * 60 * 1000)))}</p>
          <h2>${escapeHtml(next.spot.name)}</h2>
          ${next.spot.travelHours ? `<p class="travel-time"><i class="ph ph-clock" aria-hidden="true"></i>${escapeHtml(formatTravelHours(next.spot.travelHours))} aller</p>` : ""}
          <p class="session-verdict"><i class="ph ph-waves" aria-hidden="true"></i>Doux et propre pour ton niveau</p>
          <div class="session-conditions">
            <div><i class="ph ph-waves" aria-hidden="true"></i><strong>${Number(swellHeight).toFixed(1)} m</strong><span>Houle</span></div>
            <div><i class="ph ph-wind" aria-hidden="true"></i><strong>${Number(peak.windSpeed ?? 0).toFixed(0)} km/h</strong><span>Vent</span></div>
            <div><i class="ph ph-compass" aria-hidden="true"></i><strong>${cardinalFromDegrees(peak.swellDirection ?? peak.waveDirection)}</strong><span>Direction</span></div>
            <div><i class="ph ph-wave-sine" aria-hidden="true"></i><strong>${peak.tideTrend === "rising" ? "Montante" : peak.tideTrend === "falling" ? "Descendante" : "À vérifier"}</strong><span>Niveau marin</span></div>
          </div>
          ${routeButton(next.spot, "button button-primary hero-route")}
        </div>
      </section>`;
  } else {
    const loaded = runtime.size > 0;
    hero = `
      <section class="hero">
        <p class="eyebrow">${escapeHtml(headlineDate.format(new Date()))}</p>
        <h1>Ta prochaine session</h1>
        <p class="hero-intro">${loaded ? "Pas encore de feu vert franc. Voici les meilleurs spots à surveiller." : "Lecture des conditions pour tes spots favoris…"}</p>
        <div class="hero-actions"><button class="button button-primary" data-action="refresh"><i class="ph ph-arrow-clockwise" aria-hidden="true"></i>Actualiser</button><a class="button button-ghost" href="#spots">Gérer mes spots</a></div>
      </section>`;
  }

  const windowSpotIds = new Set(windows.map((window) => window.spot.id));
  const additionalWindows = next ? windows.slice(1, 10) : windows.slice(0, 10);
  const additionalMisses = misses.filter(({ spot }) => !windowSpotIds.has(spot.id)).slice(0, Math.max(0, 4 - additionalWindows.length));
  const rows = [
    ...additionalWindows.map((window) => `<div id="window-${escapeHtml(window.id)}">${windowCard(window)}</div>`),
    ...additionalMisses.map(nearMissCard)
  ];
  const fallbackRows = !rows.length && !next ? misses.map(nearMissCard) : rows;
  const visibleRows = fallbackRows.length ? fallbackRows : enabledSpots.slice(0, 4).map(routeOnlyCard);
  const windowsHtml = visibleRows.length
    ? `<div class="window-list">${visibleRows.join("")}</div>`
    : `<section class="panel empty-state"><i class="ph ph-waves" aria-hidden="true"></i><h2>Aucun spot surveillé</h2><p>Choisis un spot connu ou recherche simplement une plage par son nom.</p></section>`;

  app.innerHTML = `<div class="view forecast-view">${hero}<div class="section-title"><div><h2>${next ? "Autres spots à surveiller" : "Spots à surveiller"}</h2><p>Les meilleures possibilités parmi tes favoris.</p></div></div>${windowsHtml}<a class="text-link all-spots-link" href="#spots">Voir tous les spots</a><p class="safety-note"><i class="ph ph-shield-check" aria-hidden="true"></i> Vérifie toujours les conditions sur place avant la mise à l’eau.</p></div>`;
}

function directionLabel(key) {
  return DIRECTION_LABELS[key] || DIRECTION_LABELS.any;
}

function spotCard(spot) {
  const mapsUrl = googleMapsDirectionsUrl(spot);
  return `
    <article class="spot-card ${spot.needsCoordinates ? "needs-coordinates" : ""}">
      <div class="spot-main">
        <h3>${escapeHtml(spot.name)}</h3>
        <div class="spot-meta">
          ${spot.needsCoordinates ? `<span class="pill pill-warning">Lieu à retrouver</span>` : ""}
          ${spot.country ? `<span class="pill">${escapeHtml(spot.country)}</span>` : ""}
          ${spot.travelHours ? `<span class="pill">${escapeHtml(spot.travelHours)} h aller</span>` : ""}
          <span class="pill">Houle ${escapeHtml(spot.sweetMin)}–${escapeHtml(spot.sweetMax)} m</span>
          <span class="pill">Depuis ${escapeHtml(directionLabel(spot.swellSector))}</span>
        </div>
        ${spot.notes ? `<p class="spot-notes">${escapeHtml(spot.notes)}</p>` : ""}
      </div>
      <div class="spot-actions">
        ${mapsUrl ? `<a class="button button-primary button-small" href="${escapeHtml(mapsUrl)}" target="_blank" rel="noreferrer" aria-label="S’y rendre à ${escapeHtml(spot.name)} avec Google Maps">S’y rendre</a>` : ""}
        ${spot.sourceUrl ? `<a class="button button-ghost button-small" href="${escapeHtml(spot.sourceUrl)}" target="_blank" rel="noreferrer">Référence</a>` : ""}
        <button class="button button-ghost button-small" data-action="edit-spot" data-id="${escapeHtml(spot.id)}">${spot.needsCoordinates ? "Compléter" : "Régler"}</button>
        <button class="button button-danger button-small" data-action="delete-spot" data-id="${escapeHtml(spot.id)}">Retirer</button>
      </div>
    </article>`;
}

function renderSpots() {
  const unresolved = state.spots.filter((spot) => spot.needsCoordinates).length;
  app.innerHTML = `
    <div class="view">
      <div class="page-head">
        <div><p class="eyebrow">Ta carte personnelle</p><h1>Mes spots favoris</h1><p>Chaque plage a ses propres règles. Les valeurs de départ sont prudentes pour ton mini-malibu et peuvent être affinées après quelques sessions.</p></div>
        <div class="toolbar"><button class="button button-primary" data-action="open-catalog">Spots connus</button><button class="button button-ghost" data-action="add-spot">Carte / recherche</button><button class="button button-ghost" data-action="import-takeout">Importer un export Google</button></div>
      </div>
      <section class="panel google-share-panel">
        <div><p class="eyebrow">Google Maps sur Android</p><h2>Un spot te plaît ? Partage-le à Surf Radar.</h2><p>Dans Google Maps : ouvre la plage, touche <strong>Partager</strong>, puis choisis <strong>Surf Radar</strong>. L’app reconnaît le nom ou te propose directement le lieu sur la carte — aucune coordonnée à saisir.</p></div>
        <div class="google-share-status"><strong>4 spots de ta liste reconnus</strong><span>Vluchtenburg · Le Rozel · Sciotot · Siouville</span></div>
      </section>
      ${unresolved ? `<div class="callout"><strong>${unresolved} spot${unresolved > 1 ? "s" : ""} importé${unresolved > 1 ? "s" : ""} à retrouver.</strong> Appuie sur « Compléter », recherche simplement son nom, puis choisis le résultat sur la carte.</div>` : ""}
      <div class="section-title"><div><h2>${state.spots.length} spot${state.spots.length > 1 ? "s" : ""}</h2><p>Catalogue, recherche cartographique ou import Google.</p></div><div class="toolbar"><button class="button button-ghost button-small" data-action="export-backup">Sauvegarder</button><button class="button button-ghost button-small" data-action="import-backup">Restaurer</button></div></div>
      ${state.spots.length ? `<div class="spot-list">${state.spots.map(spotCard).join("")}</div>` : `<section class="panel empty-state"><i class="ph ph-map-pin" aria-hidden="true"></i><h2>Ta liste est encore vide</h2><p>Le plus simple : choisis une plage connue. Pour un autre lieu, tape son nom ou son adresse et sélectionne-le sur la carte.</p><div class="hero-actions"><button class="button button-primary" data-action="open-catalog">Voir les spots connus</button><button class="button button-ghost" data-action="add-spot">Rechercher un lieu</button></div><p class="secondary-help">Ta liste Google Maps reste importable quand tu le souhaites.</p></section>`}
    </div>`;
}

function renderProfile() {
  const profile = state.profile;
  app.innerHTML = `
    <div class="view">
      <div class="page-head"><div><p class="eyebrow">Personnalisation</p><h1>Ton surf, pas une note générique</h1><p>Le moteur est volontairement conservateur : take-off acquis, premières directions et remise dans l’axe, sur une planche très permissive.</p></div></div>
      <div class="profile-summary">
        <section class="panel profile-card"><p class="eyebrow">Profil actuel</p><h2>Débutant autonome</h2><p>Take-off régulier · premières trajectoires · priorité aux vagues formées mais raisonnables.</p><div class="profile-facts"><span><i class="ph ph-waves" aria-hidden="true"></i>Mini-malibu 7'3</span><span><i class="ph ph-shield-check" aria-hidden="true"></i>Réglages prudents</span></div></section>
        <section class="panel"><h2>Mes préférences</h2><form id="profile-form" class="form-grid">
          <label class="field field-wide">Point de départ<input name="homeName" value="${escapeHtml(profile.homeName)}"></label>
          <label class="field">Trajet facile sur décision la veille (h aller)<input name="maxDriveHours" type="number" min="1" max="12" step="0.5" value="${escapeHtml(profile.maxDriveHours)}"></label>
          <label class="field">Exigence du radar /100<input name="alertThreshold" type="number" min="55" max="90" step="1" value="${escapeHtml(profile.alertThreshold)}"></label>
          <div class="field-wide toolbar"><button class="button button-primary" type="submit">Enregistrer</button></div>
        </form></section>
      </div>
      <section class="panel" style="margin-top:16px"><h2>Zone de confort initiale</h2><p>Ces réglages servent seulement quand un spot n’a pas encore été calibré.</p><div class="preference-bars">
        <div class="pref-row"><span>Houle idéale</span><div class="bar"><span style="width:64%"></span></div><strong>0,6–1,2 m</strong></div>
        <div class="pref-row"><span>Période utile</span><div class="bar"><span style="width:72%"></span></div><strong>8–13 s</strong></div>
        <div class="pref-row"><span>Vent maximum</span><div class="bar"><span style="width:48%"></span></div><strong>24 km/h</strong></div>
        <div class="pref-row"><span>Limite de houle</span><div class="bar"><span style="width:76%"></span></div><strong>1,5 m</strong></div>
      </div></section>
      <section class="panel"><h2>Alertes quotidiennes</h2><p>${localStorage.getItem(ALERT_MODE_KEY) === "periodic" ? "Le contrôle quotidien est demandé à Android. Le système choisit l’heure exacte selon la batterie et l’usage de l’application." : "Installe d’abord Surf Radar sur Android, puis active ce bouton. Si Android autorise le réveil périodique, le radar vérifiera les spots sans que l’application reste ouverte."}</p><button class="button button-ghost" data-action="enable-daily-alerts">${localStorage.getItem(ALERT_MODE_KEY) === "periodic" ? "Alertes quotidiennes activées" : "Activer les alertes quotidiennes"}</button></section>
    </div>`;
}

function renderAbout() {
  app.innerHTML = `
    <div class="view">
      <div class="page-head"><div><p class="eyebrow">Transparence</p><h1>Comment lire le radar</h1><p>Le score décrit l’adéquation avec tes préférences. Il ne certifie jamais la sécurité d’une mise à l’eau.</p></div></div>
      <section class="panel"><h2>Ajouter depuis Google Maps</h2><p>Sur Android, le plus simple est d’installer Surf Radar puis, depuis la fiche d’une plage dans Google Maps, de choisir <strong>Partager → Surf Radar</strong>. Pour reprendre une liste complète, utilise <a href="https://takeout.google.com/" target="_blank" rel="noreferrer">Google Takeout</a>, exporte <strong>Saved / Enregistrés</strong>, décompresse l’archive puis choisis le CSV avec « Importer un export Google ».</p><p>Google ne fournit pas d’API publique de synchronisation continue des listes enregistrées. Le partage ponctuel et l’export gardent l’application gratuite et évitent de lui donner accès à ton compte.</p></section>
      <section class="panel"><h2>Pourquoi la taille au large n’est pas la taille au bord</h2><p>La pente de la plage, les bancs de sable, l’angle d’arrivée et la période transforment fortement une houle. Une houle longue peut produire des séries bien plus puissantes que sa hauteur seule ne le suggère. Le radar apprend donc spot par spot et plafonne le score lorsqu’une longue période accompagne une houle déjà solide.</p><div class="callout"><strong>Avant de partir :</strong> regarde la vigilance vagues-submersion, la marée locale et une webcam si elle existe. Sur place, observe les courants et demande conseil aux sauveteurs ou aux locaux.</div></section>
      <section class="panel"><h2>Données et coût</h2><p>Le projet est conçu pour rester à 0 € : Open-Meteo, OpenStreetMap, stockage local et hébergement statique gratuit. Aucun contenu Surfline n’est aspiré.</p><div class="source-list"><a href="https://open-meteo.com/en/docs/marine-weather-api" target="_blank" rel="noreferrer">Open-Meteo Marine — houle, période, direction et niveau marin</a><a href="https://open-meteo.com/en/docs" target="_blank" rel="noreferrer">Open-Meteo Forecast — vent et lumière du jour</a><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap — carte et données géographiques</a><a href="https://operations.osmfoundation.org/policies/nominatim/" target="_blank" rel="noreferrer">Nominatim — recherche de lieux à la demande</a><a href="https://vigilance.meteofrance.fr/" target="_blank" rel="noreferrer">Vigilance Météo-France</a><a href="https://support.google.com/maps/answer/7280933" target="_blank" rel="noreferrer">Aide Google — exporter les listes enregistrées</a></div></section>
      <section class="panel"><h2>Vie privée</h2><p>Tes spots et ton profil sont conservés dans le stockage local du navigateur. Seuls les mots saisis — ou le nom d’un lieu que tu partages volontairement depuis Google Maps — sont envoyés à Nominatim pour retrouver la plage. Aucun accès à ton compte Google n’est demandé. Utilise « Sauvegarder » dans Mes spots pour conserver une copie JSON avant de vider les données du navigateur.</p></section>
    </div>`;
}

function renderCatalog() {
  const installed = new Set(state.spots.map((spot) => spot.catalogId).filter(Boolean));
  catalogList.innerHTML = SPOT_CATALOG.map((spot) => `
    <article class="catalog-card">
      <div>
        <p class="eyebrow">${escapeHtml(spot.region)}</p>
        <h3>${escapeHtml(spot.name)}</h3>
        <div class="spot-meta"><span class="pill">${escapeHtml(spot.travelHours)} h aller</span><span class="pill">${escapeHtml(spot.country)}</span></div>
        <p>${escapeHtml(spot.notes)}</p>
        <a class="source-link" href="${escapeHtml(spot.sourceUrl)}" target="_blank" rel="noreferrer">Source : ${escapeHtml(spot.sourceLabel)}</a>
      </div>
      <button class="button ${installed.has(spot.catalogId) ? "button-ghost" : "button-primary"}" data-action="add-catalog-spot" data-id="${escapeHtml(spot.catalogId)}" ${installed.has(spot.catalogId) ? "disabled" : ""}>${installed.has(spot.catalogId) ? "Déjà ajouté" : "Ajouter"}</button>
    </article>`).join("");
}

function openCatalogDialog() {
  renderCatalog();
  catalogDialog.showModal();
}

function setSpotLocation({ lat, lon, name = "", country = "" }, { move = true, overwriteName = false } = {}) {
  const latitude = Number(lat);
  const longitude = Number(lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
  spotForm.elements.lat.value = latitude.toFixed(7);
  spotForm.elements.lon.value = longitude.toFixed(7);
  if (name && (overwriteName || !spotForm.elements.name.value.trim())) spotForm.elements.name.value = name;
  if (country && !spotForm.elements.country.value.trim()) spotForm.elements.country.value = country;
  spotLocationStatus.textContent = `Lieu positionné${name ? ` : ${name}` : ""}. Tu peux enregistrer.`;
  spotLocationStatus.classList.add("selected");
  if (!spotMap || !window.L) return;
  if (!spotMarker) {
    spotMarker = window.L.marker([latitude, longitude], { draggable: true }).addTo(spotMap);
    spotMarker.on("dragend", () => {
      const point = spotMarker.getLatLng();
      setSpotLocation({ lat: point.lat, lon: point.lng }, { move: false });
    });
  } else {
    spotMarker.setLatLng([latitude, longitude]);
  }
  if (move) spotMap.setView([latitude, longitude], 13);
}

function initSpotMap(spot = null) {
  if (!window.L) {
    document.querySelector("#spot-map").innerHTML = '<p class="map-fallback">La carte n’a pas pu se charger. La recherche par nom reste disponible.</p>';
    return;
  }
  if (!spotMap) {
    spotMap = window.L.map("spot-map", { zoomControl: true }).setView([state.profile.homeLat, state.profile.homeLon], 6);
    window.L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(spotMap);
    spotMap.on("click", ({ latlng }) => setSpotLocation({ lat: latlng.lat, lon: latlng.lng }));
  }
  if (spotMarker) {
    spotMap.removeLayer(spotMarker);
    spotMarker = null;
  }
  if (spot && Number.isFinite(Number(spot.lat)) && Number.isFinite(Number(spot.lon))) {
    setSpotLocation(spot, { move: true });
  } else {
    spotMap.setView([state.profile.homeLat, state.profile.homeLon], 6);
  }
  setTimeout(() => spotMap.invalidateSize(), 80);
}

function searchResultName(result) {
  return result.name || String(result.display_name || "Spot personnalisé").split(",")[0];
}

function renderSearchResults(results) {
  if (!results.length) {
    spotSearchResults.innerHTML = '<p class="search-empty">Aucun résultat. Essaie avec le nom de la plage et le pays.</p>';
    return;
  }
  spotSearchResults.innerHTML = results.map((result, index) => `
    <button type="button" class="search-result" data-action="select-search-result" data-index="${index}">
      <strong>${escapeHtml(searchResultName(result))}</strong>
      <span>${escapeHtml(result.display_name)}</span>
    </button>`).join("");
}

async function searchSpotLocation(options = {}) {
  const query = spotSearchInput.value.trim();
  if (query.length < 3) return toast("Tape au moins trois caractères.");
  spotSearchButton.disabled = true;
  spotSearchButton.textContent = "Recherche…";
  spotSearchResults.innerHTML = '<p class="search-empty">Recherche du lieu…</p>';
  try {
    const cacheKey = query.toLocaleLowerCase("fr");
    let results = geocodeCache.get(cacheKey);
    if (!results) {
      const wait = Math.max(0, 1050 - (Date.now() - lastGeocodeAt));
      if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
      const parameters = new URLSearchParams({
        q: query,
        format: "jsonv2",
        addressdetails: "1",
        limit: "6",
        "accept-language": "fr"
      });
      if (options?.global !== true) parameters.set("countrycodes", "fr,be,nl");
      lastGeocodeAt = Date.now();
      const response = await fetch(`https://nominatim.openstreetmap.org/search?${parameters}`);
      if (!response.ok) throw new Error(`Service cartographique indisponible (${response.status})`);
      results = await response.json();
      geocodeCache.set(cacheKey, results);
    }
    currentSearchResults = results;
    renderSearchResults(results);
  } catch (error) {
    currentSearchResults = [];
    spotSearchResults.innerHTML = `<p class="search-empty">${escapeHtml(error.message)}. Tu peux toujours toucher directement la carte.</p>`;
  } finally {
    spotSearchButton.disabled = false;
    spotSearchButton.textContent = "Rechercher";
  }
}

function fillSectorSelects() {
  const options = Object.entries(DIRECTION_LABELS).map(([value, label]) => `<option value="${value}">${label}</option>`).join("");
  spotForm.elements.swellSector.innerHTML = options;
  spotForm.elements.offshoreSector.innerHTML = options;
}

function openSpotDialog(id = null, draft = null) {
  spotForm.reset();
  spotForm.elements.id.value = "";
  spotForm.elements.sweetMin.value = 0.6;
  spotForm.elements.sweetMax.value = 1.2;
  spotForm.elements.hardMax.value = 1.5;
  spotForm.elements.maxWind.value = 24;
  spotForm.elements.swellSector.value = "any";
  spotForm.elements.offshoreSector.value = "any";
  spotForm.elements.tidePreference.value = "any";
  spotSearchInput.value = "";
  spotSearchResults.innerHTML = "";
  spotLocationStatus.textContent = "Cherche un lieu ou touche la carte.";
  spotLocationStatus.classList.remove("selected");
  document.querySelector("#spot-dialog-title").textContent = id ? "Régler le spot" : draft ? "Ajouter depuis Google Maps" : "Ajouter un spot";
  const spot = id ? state.spots.find((item) => item.id === id) : null;
  const values = spot || draft;
  if (values) {
    Object.entries(values).forEach(([key, value]) => {
      if (spotForm.elements[key] && value !== null && value !== undefined) spotForm.elements[key].value = value;
    });
  }
  spotDialog.showModal();
  initSpotMap(values);
}

spotForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const form = new FormData(spotForm);
  const id = form.get("id") || crypto.randomUUID();
  const existing = state.spots.find((spot) => spot.id === id);
  const latValue = String(form.get("lat") ?? "").trim();
  const lonValue = String(form.get("lon") ?? "").trim();
  const lat = latValue ? Number(latValue) : null;
  const lon = lonValue ? Number(lonValue) : null;
  const spot = {
    ...(existing || {}),
    id,
    name: String(form.get("name")).trim(),
    lat,
    lon,
    country: String(form.get("country") || "").trim(),
    travelHours: form.get("travelHours") ? Number(form.get("travelHours")) : null,
    googleMapsUrl: String(form.get("googleMapsUrl") || existing?.googleMapsUrl || (Number.isFinite(lat) && Number.isFinite(lon) ? `https://www.google.com/maps/search/?api=1&query=${lat}%2C${lon}` : "")),
    sweetMin: Number(form.get("sweetMin")),
    sweetMax: Number(form.get("sweetMax")),
    hardMax: Number(form.get("hardMax")),
    maxWind: Number(form.get("maxWind")),
    swellSector: String(form.get("swellSector")),
    offshoreSector: String(form.get("offshoreSector")),
    tidePreference: String(form.get("tidePreference")),
    notes: String(form.get("notes") || "").trim(),
    enabled: true,
    needsCoordinates: false,
    source: String(form.get("source") || existing?.source || "Recherche OpenStreetMap")
  };
  if (!Number.isFinite(spot.lat) || !Number.isFinite(spot.lon)) {
    toast("Choisis d’abord le lieu avec la recherche ou la carte.");
    return;
  }
  const index = state.spots.findIndex((item) => item.id === id);
  if (index >= 0) state.spots[index] = spot;
  else state.spots.push(spot);
  saveState();
  spotDialog.close();
  toast(`${spot.name} est ajouté au radar.`);
  render();
  refreshForecasts(false, [spot]);
});

document.addEventListener("click", async (event) => {
  const target = event.target.closest("[data-action]");
  if (!target) return;
  const { action, id } = target.dataset;
  if (action === "add-spot") openSpotDialog();
  if (action === "close-spot" && spotDialog.open) spotDialog.close();
  if (action === "edit-spot") openSpotDialog(id);
  if (action === "open-catalog") openCatalogDialog();
  if (action === "close-catalog") catalogDialog.close();
  if (action === "add-catalog-spot") {
    const spot = catalogSpot(id);
    if (!spot || state.spots.some((item) => item.catalogId === id)) return;
    state.spots.push(spot);
    saveState();
    catalogDialog.close();
    toast(`${spot.name} est ajouté au radar.`);
    render();
    refreshForecasts(false, [spot]);
  }
  if (action === "select-search-result") {
    const result = currentSearchResults[Number(target.dataset.index)];
    if (result) {
      setSpotLocation({
        lat: result.lat,
        lon: result.lon,
        name: searchResultName(result),
        country: result.address?.country || ""
      }, { overwriteName: true });
      spotSearchResults.innerHTML = "";
    }
  }
  if (action === "import-takeout") takeoutInput.click();
  if (action === "refresh") refreshForecasts(true);
  if (action === "export-backup") downloadText("surf-radar-sauvegarde.json", exportBackup(state), "application/json");
  if (action === "import-backup") backupInput.click();
  if (action === "delete-spot") {
    const spot = state.spots.find((item) => item.id === id);
    if (spot && confirm(`Retirer ${spot.name} de Surf Radar ?`)) {
      state.spots = state.spots.filter((item) => item.id !== id);
      runtime.delete(id);
      localStorage.removeItem(`${FORECAST_PREFIX}${id}`);
      saveState();
      render();
    }
  }
  if (action === "enable-daily-alerts") enableDailyAlerts();
});

spotSearchButton.addEventListener("click", searchSpotLocation);
spotSearchInput.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  event.preventDefault();
  searchSpotLocation();
});

document.addEventListener("submit", (event) => {
  if (event.target.id !== "profile-form") return;
  event.preventDefault();
  const form = new FormData(event.target);
  state.profile = {
    ...state.profile,
    homeName: String(form.get("homeName") || "Laon (02)"),
    maxDriveHours: Number(form.get("maxDriveHours")),
    alertThreshold: Number(form.get("alertThreshold"))
  };
  saveState();
  recomputeRuntime();
  toast("Profil mis à jour.");
  render();
});

takeoutInput.addEventListener("change", async () => {
  if (!takeoutInput.files.length) return;
  setStatus("Import Google…", "loading");
  const result = await importGoogleTakeout([...takeoutInput.files]);
  const existingKeys = new Set(state.spots.map((spot) => `${spot.name.toLowerCase()}|${spot.lat}|${spot.lon}|${spot.googleMapsUrl}`));
  const fresh = result.spots.filter((spot) => !existingKeys.has(`${spot.name.toLowerCase()}|${spot.lat}|${spot.lon}|${spot.googleMapsUrl}`));
  state.spots.push(...fresh);
  saveState();
  takeoutInput.value = "";
  setStatus("Import terminé");
  toast(`${fresh.length} spot${fresh.length > 1 ? "s" : ""} importé${fresh.length > 1 ? "s" : ""} · ${result.unresolved} à compléter`, 5200);
  render();
  if (fresh.some((spot) => spot.enabled)) refreshForecasts(false, fresh.filter((spot) => spot.enabled));
});

backupInput.addEventListener("change", async () => {
  const file = backupInput.files[0];
  if (!file) return;
  try {
    state = parseBackup(await file.text());
    state.profile = { ...DEFAULT_PROFILE, ...state.profile };
    saveState();
    runtime.clear();
    toast("Sauvegarde restaurée.");
    render();
    refreshForecasts(false);
  } catch (error) {
    toast(error.message);
  } finally {
    backupInput.value = "";
  }
});

async function handleSharedSpot() {
  const shared = parseShareTarget(location.search);
  if (!shared) return;
  history.replaceState(null, "", `${location.pathname}#spots`);
  render();

  if (shared.isList) {
    toast("Liste SPOT SURF reconnue : les quatre plages utiles depuis Laon sont déjà prêtes.", 5600);
    return;
  }

  const catalogMatch = matchCatalogSpot(shared, SPOT_CATALOG);
  if (catalogMatch) {
    const existing = state.spots.find((spot) => spot.catalogId === catalogMatch.catalogId);
    if (existing) {
      toast(`${catalogMatch.name} est déjà surveillé.`);
      return;
    }
    const spot = catalogSpot(catalogMatch.catalogId);
    state.spots.push(spot);
    saveState();
    render();
    toast(`${spot.name} a été ajouté depuis Google Maps.`);
    refreshForecasts(false, [spot]);
    return;
  }

  const coordinates = shared.coordinates || {};
  const draft = {
    name: shared.name || "Spot partagé",
    lat: coordinates.lat ?? null,
    lon: coordinates.lon ?? null,
    googleMapsUrl: shared.googleMapsUrl,
    source: "Partage Google Maps"
  };
  openSpotDialog(null, draft);
  spotSearchInput.value = shared.name || "";
  if (!shared.coordinates && shared.name.length >= 3) {
    spotLocationStatus.textContent = "Spot reçu de Google Maps. Choisis le bon résultat ci-dessus.";
    await searchSpotLocation({ global: true });
  } else if (!shared.coordinates) {
    spotLocationStatus.textContent = "Spot reçu. Recherche son nom ou touche la carte pour le placer.";
  }
}

function downloadText(filename, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function enableDailyAlerts() {
  if (!("Notification" in window)) return toast("Notifications non prises en charge sur cet appareil.");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return toast("Notifications non autorisées.");
  const registration = await navigator.serviceWorker?.ready;
  await syncWorkerState();
  if (registration) await registration.showNotification("Surf Radar est prêt", { body: "Les alertes sont autorisées. Je vérifierai automatiquement quand Android me le permet.", icon: "./icon.svg", badge: "./assets/icon-192.png", tag: "surf-radar-test" });
  else new Notification("Surf Radar est prêt", { body: "Les notifications sont autorisées." });
  if (registration?.periodicSync) {
    try {
      const status = await navigator.permissions?.query({ name: "periodic-background-sync" });
      if (status && status.state === "denied") throw new Error("Réveil périodique refusé par Android");
      await registration.periodicSync.register("surf-radar-daily", { minInterval: 24 * 60 * 60 * 1000 });
      localStorage.setItem(ALERT_MODE_KEY, "periodic");
      toast("Alertes quotidiennes activées. Android choisira l’heure du contrôle.", 5200);
      render();
      return;
    } catch (error) {
      console.warn("Réveil périodique indisponible", error);
    }
  }
  localStorage.setItem(ALERT_MODE_KEY, "refresh");
  toast("Notifications activées. Ce téléphone actualisera à chaque ouverture de l’app.", 5200);
  render();
}

function cachedForecast(spot) {
  try { return JSON.parse(localStorage.getItem(`${FORECAST_PREFIX}${spot.id}`)); } catch { return null; }
}


async function forecastForSpot(spot, force = false) {
  const cached = cachedForecast(spot);
  if (!force && cached && Date.now() - cached.fetchedAt < CACHE_MAX_AGE) return cached;
  const urls = forecastUrls(spot);
  try {
    const [marine, weather] = await Promise.all([fetchJson(urls.marine), fetchJson(urls.weather)]);
    const payload = { fetchedAt: Date.now(), marine, weather };
    localStorage.setItem(`${FORECAST_PREFIX}${spot.id}`, JSON.stringify(payload));
    return payload;
  } catch (error) {
    if (cached) return { ...cached, stale: true, error: error.message };
    throw error;
  }
}

function recomputeRuntime() {
  for (const spot of state.spots.filter((item) => item.enabled && !item.needsCoordinates)) {
    const cached = cachedForecast(spot);
    if (!cached?.marine || !cached?.weather) continue;
    const slots = combineForecasts(cached.marine, cached.weather);
    runtime.set(spot.id, { spot, ...findWindows(slots, spot, state.profile), fetchedAt: cached.fetchedAt, stale: cached.stale });
  }
}

async function refreshForecasts(force = false, selectedSpots = null) {
  if (refreshing) return;
  const spots = (selectedSpots || state.spots).filter((spot) => spot.enabled && !spot.needsCoordinates);
  if (!spots.length) return;
  refreshing = true;
  refreshButton.disabled = true;
  setStatus(`Mise à jour 0/${spots.length}`, "loading");
  let completed = 0;
  let errors = 0;
  await Promise.all(spots.map(async (spot) => {
    try {
      const payload = await forecastForSpot(spot, force);
      const slots = combineForecasts(payload.marine, payload.weather);
      runtime.set(spot.id, { spot, ...findWindows(slots, spot, state.profile), fetchedAt: payload.fetchedAt, stale: payload.stale });
    } catch (error) {
      errors += 1;
      console.error(`Prévision impossible pour ${spot.name}`, error);
    } finally {
      completed += 1;
      setStatus(`Mise à jour ${completed}/${spots.length}`, "loading");
      if (currentRoute() === "forecast") renderForecast();
    }
  }));
  refreshing = false;
  refreshButton.disabled = false;
  setStatus(errors ? `${errors} spot${errors > 1 ? "s" : ""} indisponible${errors > 1 ? "s" : ""}` : "Prévisions à jour", errors ? "error" : "ready");
  render();
  notifyNewWindow();
}

async function notifyNewWindow() {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const windows = allWindows();
  if (!windows.length) return;
  let known = [];
  try { known = JSON.parse(localStorage.getItem(KNOWN_WINDOWS_KEY)) || []; } catch { /* ignore */ }
  const fresh = windows.find((window) => !known.includes(window.id));
  const currentIds = windows.slice(0, 30).map((window) => window.id);
  localStorage.setItem(KNOWN_WINDOWS_KEY, JSON.stringify(currentIds));
  writeWorkerValue("background-known-windows", currentIds).catch(() => {});
  if (!fresh) return;
  const registration = await navigator.serviceWorker?.ready;
  registration?.showNotification(`Belle fenêtre ${relativeDay(fresh.start.timestamp)}`, {
    body: `${fresh.spot.name} · ${formatWindowTime(fresh)} · score ${fresh.score}/100`,
    icon: "./icon.svg",
    tag: fresh.id,
    data: { url: `./#forecast` }
  });
}

refreshButton.addEventListener("click", () => refreshForecasts(true));
window.addEventListener("hashchange", render);
window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  installButton.classList.remove("hidden");
});
installButton.addEventListener("click", async () => {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  installButton.classList.add("hidden");
});
window.addEventListener("appinstalled", () => {
  deferredInstallPrompt = null;
  installButton.classList.add("hidden");
  toast("Surf Radar est installé sur cet appareil.");
});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js", { type: "module" })
    .then(() => syncWorkerState())
    .catch((error) => console.warn("Service worker indisponible", error));
}

fillSectorSelects();
recomputeRuntime();
render();
handleSharedSpot()
  .catch((error) => {
    console.warn("Partage Google Maps illisible", error);
    toast("Le spot partagé n’a pas pu être lu. Tu peux le rechercher par son nom.");
  })
  .finally(() => refreshForecasts(false));
