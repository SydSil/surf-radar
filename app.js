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
import { reminderForWindow, sessionCalendarFile, sessionCalendarFilename } from "./session-calendar.js";

const STORAGE_KEY = "surf-radar-state-v1";
const FORECAST_PREFIX = "surf-radar-forecast-";
const KNOWN_WINDOWS_KEY = "surf-radar-known-windows";
const ALERT_MODE_KEY = "surf-radar-alert-mode";
const SESSION_REMINDERS_KEY = "surf-radar-session-reminders";
const PERSONAL_SEED_VERSION = 2;
const CACHE_MAX_AGE = 3 * 60 * 60 * 1000;
const app = document.querySelector("#app");
const spotDialog = document.querySelector("#spot-dialog");
const spotForm = document.querySelector("#spot-form");
const catalogDialog = document.querySelector("#catalog-dialog");
const catalogList = document.querySelector("#catalog-list");
const googleImportDialog = document.querySelector("#google-import-dialog");
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
const spotDetailDialog = document.querySelector("#spot-detail-dialog");
const spotDetailContent = document.querySelector("#spot-detail-content");

let deferredInstallPrompt = null;
let toastTimer = null;
let refreshing = false;
let spotMap = null;
let spotMarker = null;
let lastGeocodeAt = 0;
let currentSearchResults = [];
const geocodeCache = new Map();
const runtime = new Map();
let spotsOverviewMap = null;
let spotsOverviewMapFrame = null;

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
        spots: spots.map((spot) => ({
          ...spot,
          enabled: spot.enabled !== false && !spot.needsCoordinates
        })),
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
  if (route !== "spots" && spotsOverviewMap) {
    spotsOverviewMap.remove();
    spotsOverviewMap = null;
  }
  if (route !== "spots" && spotsOverviewMapFrame) {
    cancelAnimationFrame(spotsOverviewMapFrame);
    spotsOverviewMapFrame = null;
  }
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
  const activeSpotIds = new Set(state.spots.filter((spot) => spot.enabled && !spot.needsCoordinates).map((spot) => spot.id));
  return [...runtime.values()]
    .filter((entry) => activeSpotIds.has(entry.spot.id))
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

function spotDetails(spot) {
  const known = SPOT_CATALOG.find((candidate) => candidate.catalogId === spot.catalogId);
  if (!known) return { ...spot, photo: null, webcamUrl: null, webcamLabel: null };
  return {
    ...known,
    ...spot,
    photo: known.photo || null,
    webcamUrl: known.webcamUrl || null,
    webcamLabel: known.webcamLabel || null,
    address: spot.address || known.address
  };
}

function closeDialog(dialog) {
  if (!dialog?.open) return;
  resetDialogDrag(dialog);
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    dialog.close();
    return;
  }
  dialog.classList.add("is-closing");
  window.setTimeout(() => {
    dialog.close();
    dialog.classList.remove("is-closing");
  }, 190);
}

function resetDialogDrag(dialog) {
  dialog.classList.remove("is-dragging", "is-returning", "is-swipe-closing");
  dialog.style.removeProperty("--dialog-drag-y");
}

function bindSwipeToClose(dialog) {
  let pointerId = null;
  let startY = 0;
  let startedAt = 0;
  let offset = 0;
  let settleTimer = null;

  const settle = (shouldClose) => {
    if (pointerId === null) return;
    const activePointerId = pointerId;
    pointerId = null;
    try {
      if (dialog.hasPointerCapture?.(activePointerId)) dialog.releasePointerCapture(activePointerId);
    } catch {}
    dialog.classList.remove("is-dragging");
    window.clearTimeout(settleTimer);
    if (shouldClose) {
      dialog.classList.add("is-swipe-closing");
      requestAnimationFrame(() => dialog.style.setProperty("--dialog-drag-y", "110vh"));
      settleTimer = window.setTimeout(() => {
        dialog.close();
        resetDialogDrag(dialog);
      }, 230);
      return;
    }
    dialog.classList.add("is-returning");
    dialog.style.setProperty("--dialog-drag-y", "0px");
    settleTimer = window.setTimeout(() => resetDialogDrag(dialog), 190);
  };

  dialog.addEventListener("pointerdown", (event) => {
    if (!dialog.open || window.innerWidth > 620 || (event.pointerType !== "touch" && event.button !== 0)) return;
    if (event.target.closest("button, a, input, select, textarea, summary")) return;
    const bounds = dialog.getBoundingClientRect();
    const dragSurface = event.target.closest(".dialog-drag-handle, .dialog-head, .spot-detail-chrome, .spot-detail-photo, .spot-detail-drag-region");
    if (!dragSurface && event.clientY - bounds.top > 72) return;
    pointerId = event.pointerId;
    startY = event.clientY;
    startedAt = performance.now();
    offset = 0;
    dialog.classList.remove("is-returning", "is-swipe-closing");
    dialog.classList.add("is-dragging");
    try {
      dialog.setPointerCapture?.(pointerId);
    } catch {}
    event.preventDefault();
  });

  dialog.addEventListener("pointermove", (event) => {
    if (event.pointerId !== pointerId) return;
    offset = Math.max(0, event.clientY - startY);
    dialog.style.setProperty("--dialog-drag-y", `${offset}px`);
    if (offset > 4) event.preventDefault();
  });

  dialog.addEventListener("pointerup", (event) => {
    if (event.pointerId !== pointerId) return;
    const elapsed = Math.max(performance.now() - startedAt, 1);
    const isSpotDetail = dialog.classList.contains("spot-detail-dialog");
    const closeDistance = isSpotDetail ? 72 : 96;
    const fastDistance = isSpotDetail ? 28 : 36;
    const fastVelocity = isSpotDetail ? .5 : .65;
    settle(offset >= closeDistance || (offset >= fastDistance && offset / elapsed >= fastVelocity));
  });

  dialog.addEventListener("pointercancel", (event) => {
    if (event.pointerId === pointerId) settle(false);
  });
}

function decorateWindow(window) {
  return { ...window, spot: spotDetails(window.spot) };
}

function localDayKey(timestamp) {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function featuredWindows(windows = allWindows()) {
  if (!windows.length) return [];
  const firstDay = localDayKey(windows[0].start.timestamp);
  const bestBySpot = new Map();
  for (const window of windows.filter((candidate) => localDayKey(candidate.start.timestamp) === firstDay)) {
    const previous = bestBySpot.get(window.spot.id);
    if (!previous || window.score > previous.score) bestBySpot.set(window.spot.id, window);
  }
  return [...bestBySpot.values()]
    .sort((a, b) => b.score - a.score || a.start.timestamp - b.start.timestamp)
    .slice(0, 6)
    .map(decorateWindow);
}

function windowById(id) {
  const window = allWindows().find((candidate) => candidate.id === id);
  return window ? decorateWindow(window) : null;
}

function sessionSlide(window, index, total) {
  const peak = window.peak;
  const swellHeight = peak.swellHeight ?? peak.waveHeight;
  const swellPeriod = peak.swellPeriod ?? peak.wavePeriod;
  const swellDirection = cardinalFromDegrees(peak.swellDirection ?? peak.waveDirection);
  const tide = peak.tideTrend === "rising" ? "Montante" : peak.tideTrend === "falling" ? "Descendante" : "À vérifier";
  return `
    <article class="primary-session session-slide" data-session-slide aria-label="Option ${index + 1} sur ${total}">
      <div class="session-heading">
        <p class="session-date">${escapeHtml(relativeDay(window.start.timestamp))} · ${escapeHtml(routeTime.format(new Date(window.start.timestamp)))}–${escapeHtml(routeTime.format(new Date(window.end.timestamp + 60 * 60 * 1000)))}</p>
        <span class="session-score">${window.score}/100</span>
      </div>
      <h2>${escapeHtml(window.spot.name)}</h2>
      ${window.spot.travelHours ? `<p class="travel-time"><i class="ph ph-clock" aria-hidden="true"></i>${escapeHtml(formatTravelHours(window.spot.travelHours))} aller</p>` : ""}
      <p class="session-verdict"><i class="ph ph-waves" aria-hidden="true"></i>${escapeHtml(window.positives[0] || "Créneau cohérent avec tes réglages")}</p>
      <div class="session-conditions">
        <div><i class="ph ph-waves" aria-hidden="true"></i><strong>${Number(swellHeight).toFixed(1)} m</strong><span>Houle</span></div>
        <div><i class="ph ph-timer" aria-hidden="true"></i><strong>${Number(swellPeriod).toFixed(0)} s</strong><span>Période</span></div>
        <div><i class="ph ph-wind" aria-hidden="true"></i><strong>${Number(peak.windSpeed ?? 0).toFixed(0)} km/h</strong><span>Vent</span></div>
        <div><i class="ph ph-compass" aria-hidden="true"></i><strong>${escapeHtml(swellDirection)}</strong><span>Direction</span></div>
        <div><i class="ph ph-wave-sine" aria-hidden="true"></i><strong>${tide}</strong><span>Marée</span></div>
      </div>
      <div class="session-actions">
        ${routeButton(window.spot, "button button-primary hero-route")}
        <div class="session-utilities">
          <button class="button button-ghost" data-action="add-reminder" data-window-id="${escapeHtml(window.id)}" type="button"><i class="ph ph-bell" aria-hidden="true"></i>Rappel</button>
          <button class="button button-ghost" data-action="add-calendar" data-window-id="${escapeHtml(window.id)}" type="button"><i class="ph ph-calendar-plus" aria-hidden="true"></i>Agenda</button>
        </div>
      </div>
    </article>`;
}

function sessionCarousel(windows) {
  const count = windows.length;
  return `
    <div class="session-carousel-shell">
      <div class="session-carousel" data-session-carousel>${windows.map((window, index) => sessionSlide(window, index, count)).join("")}</div>
      ${count > 1 ? `
        <div class="session-switcher" aria-label="Changer de spot recommandé">
          <div class="carousel-dots">${windows.map((window, index) => `<button class="carousel-dot ${index === 0 ? "active" : ""}" data-action="show-session" data-index="${index}" type="button" aria-label="Voir ${escapeHtml(window.spot.name)}" ${index === 0 ? 'aria-current="true"' : ""}></button>`).join("")}</div>
        </div>` : ""}
    </div>`;
}

function initSessionCarousel() {
  const carousel = document.querySelector("[data-session-carousel]");
  if (!carousel) return;
  const slides = [...carousel.querySelectorAll("[data-session-slide]")];
  const dots = [...document.querySelectorAll(".carousel-dot")];
  const update = () => {
    const index = Math.max(0, Math.min(slides.length - 1, Math.round(carousel.scrollLeft / Math.max(1, carousel.clientWidth))));
    dots.forEach((dot, dotIndex) => {
      dot.classList.toggle("active", dotIndex === index);
      if (dotIndex === index) dot.setAttribute("aria-current", "true");
      else dot.removeAttribute("aria-current");
    });
  };
  carousel.addEventListener("scroll", update, { passive: true });
  update();
}

function scrollToSession(index) {
  const carousel = document.querySelector("[data-session-carousel]");
  const slides = carousel ? [...carousel.querySelectorAll("[data-session-slide]")] : [];
  if (!carousel || !slides.length) return;
  const destination = Math.max(0, Math.min(slides.length - 1, index));
  carousel.scrollTo({ left: destination * carousel.clientWidth, behavior: "smooth" });
}

function nearMisses() {
  const activeSpotIds = new Set(state.spots.filter((spot) => spot.enabled && !spot.needsCoordinates).map((spot) => spot.id));
  return [...runtime.values()].filter((entry) => activeSpotIds.has(entry.spot.id)).map((entry) => {
    const candidates = (entry.scored ?? []).filter((slot) => slot.timestamp > Date.now() && slot.isDay && !slot.noGoReasons.length);
    if (!candidates.length) return null;
    const best = candidates.reduce((winner, slot) => slot.score > winner.score ? slot : winner, candidates[0]);
    return { spot: spotDetails(entry.spot), slot: best };
  }).filter(Boolean).sort((a, b) => b.slot.score - a.slot.score);
}

function trendHero({ spot, slot }) {
  const swellHeight = slot.swellHeight ?? slot.waveHeight;
  const swellPeriod = slot.swellPeriod ?? slot.wavePeriod;
  const tide = slot.tideTrend === "rising" ? "Montante" : slot.tideTrend === "falling" ? "Descendante" : "À vérifier";
  return `
    <div class="session-carousel-shell">
      <article class="primary-session trend-session">
        <div class="session-heading"><p class="session-date">Meilleure tendance · ${escapeHtml(relativeDay(slot.timestamp))} à ${escapeHtml(routeTime.format(new Date(slot.timestamp)))}</p><span class="session-score trend-score">${slot.score}/100</span></div>
        <h2>${escapeHtml(spot.name)}</h2>
        ${spot.travelHours ? `<p class="travel-time"><i class="ph ph-clock" aria-hidden="true"></i>${escapeHtml(formatTravelHours(spot.travelHours))} aller</p>` : ""}
        <p class="session-verdict"><i class="ph ph-binoculars" aria-hidden="true"></i>${escapeHtml(readableNearMissReason(slot))}</p>
        <div class="session-conditions">
          <div><i class="ph ph-waves" aria-hidden="true"></i><strong>${Number(swellHeight).toFixed(1)} m</strong><span>Houle</span></div>
          <div><i class="ph ph-timer" aria-hidden="true"></i><strong>${Number(swellPeriod ?? 0).toFixed(0)} s</strong><span>Période</span></div>
          <div><i class="ph ph-wind" aria-hidden="true"></i><strong>${Number(slot.windSpeed ?? 0).toFixed(0)} km/h</strong><span>Vent</span></div>
          <div><i class="ph ph-compass" aria-hidden="true"></i><strong>${cardinalFromDegrees(slot.swellDirection ?? slot.waveDirection)}</strong><span>Direction</span></div>
          <div><i class="ph ph-wave-sine" aria-hidden="true"></i><strong>${tide}</strong><span>Marée</span></div>
        </div>
        <div class="trend-actions">
          ${routeButton(spot, "button button-primary hero-route")}
          <button class="button button-ghost trend-detail" data-action="open-spot-detail" data-spot-id="${escapeHtml(spot.id)}" type="button"><i class="ph ph-info" aria-hidden="true"></i>Voir le détail</button>
        </div>
      </article>
    </div>`;
}

function watchEntries(enabledSpots, featured, windows, misses, trendSpotId = "") {
  const excludedIds = new Set([...featured.map((window) => window.spot.id), trendSpotId].filter(Boolean));
  const missesBySpot = new Map(misses.map((entry) => [entry.spot.id, entry]));
  return enabledSpots
    .filter((spot) => !excludedIds.has(spot.id))
    .map((savedSpot) => {
      const spot = spotDetails(savedSpot);
      const window = windows.find((candidate) => candidate.spot.id === spot.id);
      const miss = missesBySpot.get(spot.id);
      return { spot, window: window ? decorateWindow(window) : null, slot: window?.peak || miss?.slot || null };
    })
    .sort((a, b) => {
      if (a.window && !b.window) return -1;
      if (!a.window && b.window) return 1;
      return Number(b.slot?.score || 0) - Number(a.slot?.score || 0);
    });
}

function watchCard({ spot, window, slot }) {
  const swellHeight = slot ? slot.swellHeight ?? slot.waveHeight : null;
  const swellPeriod = slot ? slot.swellPeriod ?? slot.wavePeriod : null;
  const date = window
    ? `${relativeDay(window.start.timestamp)} · ${routeTime.format(new Date(window.start.timestamp))}`
    : slot
      ? `${relativeDay(slot.timestamp)} · ${routeTime.format(new Date(slot.timestamp))}`
      : "Prévision en cours";
  const quality = window ? `${window.score}/100 · ${window.confidence.label}` : slot ? `${slot.score}/100 · À surveiller` : "Mise à jour";
  const reason = window ? window.positives[0] || "Créneau prometteur" : slot ? readableNearMissReason(slot) : "Lecture des conditions en cours";
  const signal = Number.isFinite(Number(swellHeight))
    ? `Houle ${Number(swellHeight).toFixed(1)} m${Number.isFinite(Number(swellPeriod)) ? ` · ${Number(swellPeriod).toFixed(0)} s` : ""}`
    : "Houle en cours d’analyse";
  return `
    <article class="window-card watch-card">
      <button class="watch-card-main" data-action="open-spot-detail" data-spot-id="${escapeHtml(spot.id)}" ${window ? `data-window-id="${escapeHtml(window.id)}"` : ""} type="button" aria-label="Voir le détail de ${escapeHtml(spot.name)}">
        <div class="watch-heading"><h3>${escapeHtml(spot.name)}</h3><span class="watch-quality ${window ? "good" : ""}">${escapeHtml(quality)}</span></div>
        <div class="window-date">${escapeHtml(date)} · ${escapeHtml(signal)}</div>
        <p class="window-reason">${escapeHtml(reason)}.</p>
      </button>
      <div class="window-actions">${routeButton(spot, "route-link")}</div>
    </article>`;
}

function renderForecast() {
  const enabledSpots = state.spots.filter((spot) => spot.enabled && !spot.needsCoordinates);
  const windows = allWindows();
  const featured = featuredWindows(windows);
  const misses = nearMisses();
  const trend = !featured.length && misses.length ? misses[0] : null;
  let hero;

  if (!enabledSpots.length) {
    const hasSavedSpots = state.spots.length > 0;
    hero = `
      <section class="hero">
        <p class="eyebrow">${escapeHtml(headlineDate.format(new Date()))}</p>
        <h1>Ta prochaine session</h1>
        <p class="hero-intro">${hasSavedSpots ? "Aucun spot n’est actuellement analysé. Réactive ceux que tu veux surveiller." : "Choisis tes plages favorites. Le radar s’occupe ensuite de trouver le bon moment."}</p>
        <div class="hero-actions">
          ${hasSavedSpots ? `<a class="button button-primary" href="#spots"><i class="ph ph-toggle-right" aria-hidden="true"></i>Réactiver un spot</a>` : `<button class="button button-primary" data-action="open-catalog"><i class="ph ph-map-pin-plus" aria-hidden="true"></i>Choisir un spot connu</button>`}
          <button class="button button-ghost" data-action="add-spot">Rechercher sur la carte</button>
        </div>
      </section>`;
  } else {
    const content = featured.length
      ? sessionCarousel(featured)
      : trend
        ? trendHero(trend)
        : `<div class="hero-actions"><button class="button button-primary" data-action="refresh"><i class="ph ph-arrow-clockwise" aria-hidden="true"></i>Actualiser</button><a class="button button-ghost" href="#spots">Gérer mes spots</a></div>`;
    hero = `
      <section class="hero">
        <p class="eyebrow">${escapeHtml(headlineDate.format(new Date()))}</p>
        <h1>Ta prochaine session</h1>
        <p class="hero-intro">${featured.length ? `Le meilleur créneau en premier${featured.length > 1 ? ` · ${featured.length} spots valent le détour ce jour-là` : ""}.` : trend ? "Pas encore de feu vert franc. Voici la meilleure tendance à surveiller." : "Lecture des conditions pour tes spots favoris…"}</p>
        ${content}
      </section>`;
  }

  const entries = watchEntries(enabledSpots, featured, windows, misses, trend?.spot.id);
  const windowsHtml = entries.length
    ? `<div class="window-list">${entries.map(watchCard).join("")}</div>`
    : featured.length
      ? `<p class="all-clear-note">Tous tes spots prometteurs de la journée sont proposés ci-dessus.</p>`
      : `<section class="panel empty-state"><i class="ph ph-waves" aria-hidden="true"></i><h2>Aucun autre spot à surveiller</h2><p>Le radar continuera à analyser tes favoris.</p></section>`;

  app.innerHTML = `<div class="view forecast-view">${hero}<div class="section-title"><div><h2>Autres spots à surveiller</h2><p>Leur meilleure tendance à venir, sans surcharger l’écran.</p></div></div>${windowsHtml}<a class="text-link all-spots-link" href="#spots">Voir tous les spots</a><p class="safety-note"><i class="ph ph-shield-check" aria-hidden="true"></i> Vérifie toujours les conditions sur place avant la mise à l’eau.</p></div>`;
  requestAnimationFrame(initSessionCarousel);
}

function bestFutureSlot(spotId) {
  const entry = runtime.get(spotId);
  const candidates = (entry?.scored || []).filter((slot) => slot.timestamp > Date.now() && slot.isDay && !slot.noGoReasons.length);
  if (!candidates.length) return null;
  return candidates.reduce((winner, slot) => slot.score > winner.score ? slot : winner, candidates[0]);
}

function detailMetric(icon, value, label) {
  return `<div><i class="ph ${icon}" aria-hidden="true"></i><strong>${escapeHtml(value)}</strong><span>${escapeHtml(label)}</span></div>`;
}

function openSpotDetail(spotId, windowId = "") {
  const savedSpot = state.spots.find((spot) => spot.id === spotId);
  if (!savedSpot) return;
  const spot = spotDetails(savedSpot);
  const selectedWindow = windowId ? windowById(windowId) : allWindows().find((candidate) => candidate.spot.id === spotId);
  const decoratedWindow = selectedWindow ? decorateWindow(selectedWindow) : null;
  const slot = decoratedWindow?.peak || bestFutureSlot(spotId);
  const swellHeight = slot ? slot.swellHeight ?? slot.waveHeight : null;
  const swellPeriod = slot ? slot.swellPeriod ?? slot.wavePeriod : null;
  const forecastLabel = decoratedWindow
    ? formatWindowTime(decoratedWindow)
    : slot
      ? `Meilleure tendance ${relativeDay(slot.timestamp)} à ${routeTime.format(new Date(slot.timestamp))}`
      : "Prévision en cours de chargement";
  const quality = decoratedWindow ? `${decoratedWindow.score}/100 · ${decoratedWindow.confidence.label}` : slot ? `${slot.score}/100 · À surveiller` : "En attente";
  const photo = spot.photo ? `
    <figure class="spot-detail-photo">
      <img src="${escapeHtml(spot.photo.src)}" alt="${escapeHtml(spot.photo.alt)}" loading="lazy">
      <figcaption>Photo réelle · <a href="${escapeHtml(spot.photo.sourceUrl)}" target="_blank" rel="noreferrer">${escapeHtml(spot.photo.credit)} · ${escapeHtml(spot.photo.license)}</a></figcaption>
    </figure>` : "";
  const metrics = slot ? [
    detailMetric("ph-waves", `${Number(swellHeight).toFixed(1)} m`, "Houle"),
    detailMetric("ph-timer", `${Number(swellPeriod ?? 0).toFixed(0)} s`, "Période"),
    detailMetric("ph-compass", cardinalFromDegrees(slot.swellDirection ?? slot.waveDirection), "Direction houle"),
    detailMetric("ph-wind", `${Number(slot.windSpeed ?? 0).toFixed(0)} km/h`, "Vent"),
    detailMetric("ph-navigation-arrow", cardinalFromDegrees(slot.windDirection), "Direction vent"),
    detailMetric("ph-wave-sine", slot.tideTrend === "rising" ? "Montante" : slot.tideTrend === "falling" ? "Descendante" : "À vérifier", "Marée")
  ].join("") : `<p class="detail-loading">Les prévisions détaillées seront disponibles après la prochaine actualisation.</p>`;

  spotDetailContent.innerHTML = `
    <div class="spot-detail-sheet ${spot.photo ? "has-photo" : "no-photo"}">
      <div class="spot-detail-chrome">
        <span class="dialog-drag-handle" aria-hidden="true"></span>
        <button class="icon-button dialog-close detail-close" data-action="close-spot-detail" aria-label="Fermer" type="button"><i class="ph ph-x" aria-hidden="true"></i></button>
      </div>
      <div class="spot-detail-scroll">
        ${photo}
        <div class="spot-detail-body">
          <div class="spot-detail-drag-region">
            <p class="eyebrow">${escapeHtml(spot.region || "Spot favori")}</p>
            <div class="detail-title-row"><h2 id="spot-detail-title">${escapeHtml(spot.name)}</h2><span class="detail-quality ${decoratedWindow ? "good" : ""}">${escapeHtml(quality)}</span></div>
            <p class="detail-forecast-date">${escapeHtml(forecastLabel)}</p>
          </div>
          <div class="detail-metrics">${metrics}</div>
          <div class="detail-practical">
            <div><i class="ph ph-map-pin" aria-hidden="true"></i><span><strong>Adresse</strong>${escapeHtml(spot.address || [spot.name, spot.country].filter(Boolean).join(", "))}</span></div>
            ${spot.travelHours ? `<div><i class="ph ph-car" aria-hidden="true"></i><span><strong>Depuis ton départ</strong>${escapeHtml(formatTravelHours(spot.travelHours))} aller</span></div>` : ""}
          </div>
          ${spot.notes ? `<p class="detail-note"><i class="ph ph-info" aria-hidden="true"></i><span>${escapeHtml(spot.notes)}</span></p>` : ""}
          ${spot.webcamUrl ? `<a class="webcam-link" href="${escapeHtml(spot.webcamUrl)}" target="_blank" rel="noreferrer"><i class="ph ph-video-camera" aria-hidden="true"></i><span><strong>${escapeHtml(spot.webcamLabel || "Voir la webcam")}</strong><small>Vérifier les conditions en direct</small></span><i class="ph ph-arrow-up-right" aria-hidden="true"></i></a>` : ""}
          <div class="detail-actions">
            ${routeButton(spot, "button button-primary detail-route")}
            ${decoratedWindow ? `<button class="button button-ghost" data-action="add-reminder" data-window-id="${escapeHtml(decoratedWindow.id)}" type="button"><i class="ph ph-bell" aria-hidden="true"></i>Rappel</button><button class="button button-ghost" data-action="add-calendar" data-window-id="${escapeHtml(decoratedWindow.id)}" type="button"><i class="ph ph-calendar-plus" aria-hidden="true"></i>Agenda</button>` : ""}
          </div>
        </div>
      </div>
    </div>`;
  spotDetailDialog.showModal();
}

function directionLabel(key) {
  return DIRECTION_LABELS[key] || DIRECTION_LABELS.any;
}

function spotCard(spot) {
  const mapsUrl = googleMapsDirectionsUrl(spot);
  const isActive = spot.enabled && !spot.needsCoordinates;
  return `
    <article class="spot-card ${spot.needsCoordinates ? "needs-coordinates" : ""} ${isActive ? "is-active" : "is-paused"}">
      <div class="spot-main">
        <div class="spot-card-heading">
          <h3>${escapeHtml(spot.name)}</h3>
          <label class="analysis-toggle ${spot.needsCoordinates ? "is-disabled" : ""}" title="${isActive ? `Mettre ${escapeHtml(spot.name)} en pause` : `Activer l’analyse de ${escapeHtml(spot.name)}`}">
            <input type="checkbox" role="switch" data-action="toggle-spot-analysis" data-id="${escapeHtml(spot.id)}" aria-label="${isActive ? `Mettre ${escapeHtml(spot.name)} en pause` : `Activer l’analyse de ${escapeHtml(spot.name)}`}" ${isActive ? "checked" : ""} ${spot.needsCoordinates ? "disabled" : ""}>
            <span class="toggle-track" aria-hidden="true"><span class="toggle-thumb"></span></span>
          </label>
        </div>
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
      </div>
    </article>`;
}

function renderSpots() {
  if (spotsOverviewMapFrame) {
    cancelAnimationFrame(spotsOverviewMapFrame);
    spotsOverviewMapFrame = null;
  }
  if (spotsOverviewMap) {
    spotsOverviewMap.remove();
    spotsOverviewMap = null;
  }
  const unresolved = state.spots.filter((spot) => spot.needsCoordinates).length;
  const mappedSpots = state.spots.filter((spot) => !spot.needsCoordinates && Number.isFinite(Number(spot.lat)) && Number.isFinite(Number(spot.lon)));
  const activeSpots = state.spots.filter((spot) => spot.enabled && !spot.needsCoordinates);
  const pausedSpots = state.spots.filter((spot) => !spot.enabled || spot.needsCoordinates);
  const mappedActiveCount = mappedSpots.filter((spot) => spot.enabled).length;
  const mappedPausedCount = mappedSpots.length - mappedActiveCount;
  app.innerHTML = `
    <div class="view">
      <div class="page-head spots-page-head">
        <div><p class="eyebrow">Ta carte personnelle</p><h1>Mes spots favoris</h1><p>Visualise tous tes favoris, puis ajoute un spot par son nom, son adresse ou directement sur la carte.</p></div>
      </div>
      <section class="spots-overview" aria-labelledby="spots-map-title">
        <div class="spots-map-head">
          <div class="spots-map-copy"><p class="eyebrow">Vue d’ensemble</p><h2 id="spots-map-title">Tous tes spots</h2><p>${mappedSpots.length} repère${mappedSpots.length > 1 ? "s" : ""} · ${mappedActiveCount} analysé${mappedActiveCount > 1 ? "s" : ""} · ${mappedPausedCount} en pause</p><div class="map-legend" aria-label="Légende de la carte"><span><i class="map-legend-marker is-active" aria-hidden="true"></i>Analysé</span><span><i class="map-legend-marker is-paused" aria-hidden="true"></i>En pause</span></div></div>
          <div class="spots-map-controls">
            <button class="button button-primary button-small" data-action="add-spot" type="button"><i class="ph ph-plus" aria-hidden="true"></i>Ajouter</button>
            <details class="android-help">
              <summary aria-label="Comment ajouter un spot depuis Google Maps"><i class="ph ph-question" aria-hidden="true"></i></summary>
              <div class="android-help-popover" role="note">
                <p class="eyebrow">Google Maps sur Android</p>
                <h3>Ajouter un spot en deux gestes</h3>
                <p>Dans Google Maps, ouvre la plage, touche <strong>Partager</strong>, puis choisis <strong>Surf Radar</strong>. L’app retrouve le lieu sans te demander de coordonnées.</p>
              </div>
            </details>
          </div>
        </div>
        <div id="spots-overview-map" class="spots-overview-map" role="application" aria-label="Carte de mes spots enregistrés"></div>
      </section>
      ${unresolved ? `<div class="callout"><strong>${unresolved} spot${unresolved > 1 ? "s" : ""} importé${unresolved > 1 ? "s" : ""} à retrouver.</strong> Appuie sur « Compléter », recherche simplement son nom, puis choisis le résultat sur la carte.</div>` : ""}
      <div class="section-title spots-section-title"><div><p class="eyebrow">Surveillance active</p><h2>Spots analysés</h2><p>${activeSpots.length} spot${activeSpots.length > 1 ? "s" : ""} utilisé${activeSpots.length > 1 ? "s" : ""} par le Radar et les alertes.</p></div><div class="toolbar"><button class="button button-ghost button-small" data-action="export-backup">Sauvegarder</button><button class="button button-ghost button-small" data-action="import-backup">Restaurer</button></div></div>
      ${activeSpots.length ? `<div class="spot-list active-spot-list">${activeSpots.map(spotCard).join("")}</div>` : state.spots.length ? `<section class="panel empty-state compact-empty"><i class="ph ph-radar" aria-hidden="true"></i><h2>Aucun spot analysé</h2><p>Réactive un spot dans la section ci-dessous pour le faire revenir dans le Radar et les alertes.</p></section>` : `<section class="panel empty-state"><i class="ph ph-map-pin" aria-hidden="true"></i><h2>Ta liste est encore vide</h2><p>Utilise « Ajouter » sur la carte pour rechercher un spot ou placer précisément ton repère.</p></section>`}
      ${pausedSpots.length ? `<section class="paused-spots-section" aria-labelledby="paused-spots-title"><div class="section-title spots-section-title"><div><p class="eyebrow">Toujours enregistrés</p><h2 id="paused-spots-title">Spots en pause</h2><p>Ils restent sur ta carte et conservent leurs réglages. Réactive-les quand tu veux.</p></div><span class="paused-count">${pausedSpots.length}</span></div><div class="spot-list paused-spot-list">${pausedSpots.map(spotCard).join("")}</div></section>` : ""}
    </div>`;
  spotsOverviewMapFrame = requestAnimationFrame(() => {
    spotsOverviewMapFrame = null;
    initSpotsOverviewMap(mappedSpots);
  });
}

function initSpotsOverviewMap(spots) {
  const container = document.querySelector("#spots-overview-map");
  if (!container) return;
  if (spotsOverviewMap || container._leaflet_id) return;
  if (!window.L) {
    container.innerHTML = '<p class="map-fallback">La carte n’a pas pu se charger. Tes spots restent disponibles dans la liste ci-dessous.</p>';
    return;
  }
  spotsOverviewMap = window.L.map(container, { zoomControl: true, scrollWheelZoom: false });
  window.L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(spotsOverviewMap);

  const bounds = [];
  for (const savedSpot of spots) {
    const spot = spotDetails(savedSpot);
    const isActive = spot.enabled && !spot.needsCoordinates;
    const point = [Number(spot.lat), Number(spot.lon)];
    const mapsUrl = googleMapsDirectionsUrl(spot);
    const practical = [spot.country, spot.travelHours ? `${formatTravelHours(spot.travelHours)} aller` : ""].filter(Boolean).join(" · ");
    const popup = `<div class="overview-popup"><strong>${escapeHtml(spot.name)}</strong>${practical ? `<span>${escapeHtml(practical)}</span>` : ""}${mapsUrl ? `<a href="${escapeHtml(mapsUrl)}" target="_blank" rel="noreferrer">Itinéraire Google Maps</a>` : ""}</div>`;
    const markerIcon = window.L.divIcon({
      className: "overview-marker-shell",
      html: `<i class="overview-marker ${isActive ? "is-active" : "is-paused"}" aria-hidden="true"></i>`,
      iconSize: [30, 49],
      iconAnchor: [15, 49],
      popupAnchor: [0, -43]
    });
    window.L.marker(point, { icon: markerIcon, title: `${spot.name} · ${isActive ? "analysé" : "en pause"}` }).addTo(spotsOverviewMap).bindPopup(popup);
    bounds.push(point);
  }

  if (bounds.length > 1) spotsOverviewMap.fitBounds(bounds, { padding: [34, 34], maxZoom: 8 });
  else if (bounds.length === 1) spotsOverviewMap.setView(bounds[0], 10);
  else spotsOverviewMap.setView([state.profile.homeLat, state.profile.homeLon], 5);
  setTimeout(() => spotsOverviewMap?.invalidateSize(), 80);
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
      <section class="panel"><h2>Ajouter depuis Google Maps</h2><p>Sur Android, le plus simple est d’installer Surf Radar puis, depuis la fiche d’une plage dans Google Maps, de choisir <strong>Partager → Surf Radar</strong>. Pour reprendre une liste complète, utilise <a href="https://takeout.google.com/" target="_blank" rel="noreferrer">Google Takeout</a>, exporte <strong>Saved / Enregistrés</strong>, décompresse l’archive puis choisis le CSV avec « Importer ma liste Google Maps ».</p><p>Google ne fournit pas d’API publique de synchronisation continue des listes enregistrées. Le partage ponctuel et l’export gardent l’application gratuite et évitent de lui donner accès à ton compte.</p></section>
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

function setSpotLocation({ lat, lon, name = "", country = "", address = "" }, { move = true, overwriteName = false } = {}) {
  const latitude = Number(lat);
  const longitude = Number(lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
  spotForm.elements.lat.value = latitude.toFixed(7);
  spotForm.elements.lon.value = longitude.toFixed(7);
  if (address) spotForm.elements.address.value = address;
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
  const deleteZone = document.querySelector("#delete-spot-zone");
  const deleteButton = deleteZone?.querySelector('[data-action="delete-spot"]');
  deleteZone?.classList.toggle("hidden", !spot);
  if (deleteButton) deleteButton.dataset.id = spot?.id || "";
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
    address: String(form.get("address") || existing?.address || "").trim(),
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
    enabled: existing ? existing.enabled !== false : true,
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
  if (action === "close-spot" && spotDialog.open) closeDialog(spotDialog);
  if (action === "open-spot-detail") openSpotDetail(target.dataset.spotId, target.dataset.windowId);
  if (action === "close-spot-detail" && spotDetailDialog.open) closeDialog(spotDetailDialog);
  if (action === "show-session") scrollToSession(Number(target.dataset.index));
  if (action === "add-calendar") {
    const selectedWindow = windowById(target.dataset.windowId);
    if (selectedWindow) addSessionToCalendar(selectedWindow);
  }
  if (action === "add-reminder") {
    const selectedWindow = windowById(target.dataset.windowId);
    if (selectedWindow) await addSessionReminder(selectedWindow);
  }
  if (action === "edit-spot") openSpotDialog(id);
  if (action === "open-catalog") openCatalogDialog();
  if (action === "close-catalog") closeDialog(catalogDialog);
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
        country: result.address?.country || "",
        address: result.display_name || ""
      }, { overwriteName: true });
      spotSearchResults.innerHTML = "";
    }
  }
  if (action === "open-google-import") {
    if (spotDialog.open) spotDialog.close();
    googleImportDialog.showModal();
  }
  if (action === "close-google-import") closeDialog(googleImportDialog);
  if (action === "choose-takeout-file") {
    googleImportDialog.close();
    takeoutInput.click();
  }
  if (action === "refresh") refreshForecasts(true);
  if (action === "export-backup") downloadText("surf-radar-sauvegarde.json", exportBackup(state), "application/json");
  if (action === "import-backup") backupInput.click();
  if (action === "toggle-spot-analysis") {
    const spot = state.spots.find((item) => item.id === id);
    if (!spot || spot.needsCoordinates) return;
    spot.enabled = target.checked;
    if (!spot.enabled) runtime.delete(spot.id);
    saveState();
    render();
    if (spot.enabled) {
      toast(`${spot.name} est de nouveau analysé.`);
      refreshForecasts(false, [spot]);
    } else {
      toast(`${spot.name} est en pause · aucune alerte ne sera envoyée.`);
    }
  }
  if (action === "delete-spot") {
    const spot = state.spots.find((item) => item.id === id);
    if (spot && confirm(`Supprimer définitivement ${spot.name} ? Ses réglages enregistrés seront perdus.`)) {
      state.spots = state.spots.filter((item) => item.id !== id);
      runtime.delete(id);
      localStorage.removeItem(`${FORECAST_PREFIX}${id}`);
      saveState();
      if (spotDialog.open) spotDialog.close();
      toast(`${spot.name} a été supprimé.`);
      render();
    }
  }
  if (action === "enable-daily-alerts") enableDailyAlerts();
});

[spotDialog, catalogDialog, googleImportDialog, spotDetailDialog].forEach((dialog) => {
  dialog.addEventListener("click", (event) => {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    const outside = event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom;
    if (outside) closeDialog(dialog);
  });
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeDialog(dialog);
  });
  bindSwipeToClose(dialog);
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

function readSessionReminders() {
  try { return JSON.parse(localStorage.getItem(SESSION_REMINDERS_KEY)) || []; } catch { return []; }
}

async function saveSessionReminders(reminders) {
  localStorage.setItem(SESSION_REMINDERS_KEY, JSON.stringify(reminders));
  await writeWorkerValue("session-reminders", reminders).catch((error) => console.warn("Synchronisation du rappel indisponible", error));
}

function addSessionToCalendar(window) {
  downloadText(sessionCalendarFilename(window), sessionCalendarFile(window), "text/calendar;charset=utf-8");
  toast("Événement créé avec l’adresse, les conditions et deux alertes.", 4800);
}

async function addSessionReminder(session) {
  const reminder = reminderForWindow(session);
  if (!reminder) {
    toast("Ce créneau est trop proche pour programmer un rappel utile.");
    return;
  }
  if (!("Notification" in window)) {
    downloadText(sessionCalendarFilename(session), sessionCalendarFile(session, { reminders: [1440] }), "text/calendar;charset=utf-8");
    toast("Les notifications ne sont pas disponibles : un rappel agenda a été préparé.", 5200);
    return;
  }
  const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
  if (permission !== "granted") {
    downloadText(sessionCalendarFilename(session), sessionCalendarFile(session, { reminders: [1440] }), "text/calendar;charset=utf-8");
    toast("Notifications refusées : un rappel agenda a été préparé à la place.", 5200);
    return;
  }
  const reminders = readSessionReminders().filter((item) => item.id !== reminder.id);
  reminders.push(reminder);
  await saveSessionReminders(reminders);
  navigator.serviceWorker?.controller?.postMessage({ type: "SURF_RADAR_REMINDERS_CHECK" });
  toast(`Rappel enregistré ${reminder.label}.`, 4800);
}

async function notifyDueSessionReminders() {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const reminders = readSessionReminders();
  const due = reminders.filter((reminder) => !reminder.sent && reminder.remindAt <= Date.now());
  if (!due.length) return;
  const registration = await navigator.serviceWorker?.ready;
  for (const reminder of due) {
    await registration?.showNotification(`Session surf · ${reminder.spotName}`, {
      body: "Ton créneau approche. Vérifie une dernière fois les conditions avant de partir.",
      icon: "./assets/icon-192.png",
      badge: "./assets/icon-192.png",
      tag: `session-${reminder.id}`,
      data: { url: reminder.routeUrl || "./#forecast" }
    });
    reminder.sent = true;
  }
  await saveSessionReminders(reminders);
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
  runtime.clear();
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
    .then(() => Promise.all([
      syncWorkerState(),
      writeWorkerValue("session-reminders", readSessionReminders()),
      notifyDueSessionReminders()
    ]))
    .catch((error) => console.warn("Service worker indisponible", error));
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") notifyDueSessionReminders();
});

fillSectorSelects();
recomputeRuntime();
render();
handleSharedSpot()
  .catch((error) => {
    console.warn("Partage Google Maps illisible", error);
    toast("Le spot partagé n’a pas pu être lu. Tu peux le rechercher par son nom.");
  })
  .finally(() => refreshForecasts(false));
