import { backgroundNotification, evaluateStateForecast } from "./forecast.js";
import { readWorkerValue, writeWorkerValue } from "./worker-store.js";

const CACHE_NAME = "surf-radar-shell-v22";
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./scoring.js",
  "./importers.js",
  "./catalog.js",
  "./share-target.js",
  "./forecast.js",
  "./session-calendar.js",
  "./worker-store.js",
  "./vendor/leaflet/leaflet.js",
  "./vendor/leaflet/leaflet.css",
  "./vendor/leaflet/images/marker-icon.png",
  "./vendor/leaflet/images/marker-icon-2x.png",
  "./vendor/leaflet/images/marker-shadow.png",
  "./vendor/phosphor/style.css",
  "./vendor/phosphor/Phosphor.woff2",
  "./manifest.webmanifest",
  "./icon.svg",
  "./assets/design/header-ambient.png",
  "./assets/design/brand-mark.png",
  "./assets/spots/wimereux.jpg",
  "./assets/spots/wissant.jpg",
  "./assets/spots/le-rozel.jpg",
  "./assets/spots/siouville.jpg",
  "./assets/spots/sciotot.jpg",
  "./assets/icon-192.png",
  "./assets/icon-512.png"
];

async function runBackgroundCheck() {
  const state = await readWorkerValue("state");
  if (!state?.spots?.some((spot) => spot.enabled && !spot.needsCoordinates)) return;
  const { windows } = await evaluateStateForecast(state);
  const currentIds = windows.slice(0, 30).map((window) => window.id);
  const known = await readWorkerValue("background-known-windows") || [];
  const fresh = windows.find((window) => !known.includes(window.id));
  await writeWorkerValue("background-known-windows", currentIds);
  if (!fresh) return;
  const notification = backgroundNotification(fresh);
  await self.registration.showNotification(notification.title, {
    body: notification.body,
    icon: "./assets/icon-192.png",
    badge: "./assets/icon-192.png",
    tag: fresh.id,
    data: { url: "./#forecast" }
  });
}

async function sendDueSessionReminders() {
  const reminders = await readWorkerValue("session-reminders") || [];
  const due = reminders.filter((reminder) => !reminder.sent && reminder.remindAt <= Date.now());
  if (!due.length) return;
  for (const reminder of due) {
    await self.registration.showNotification(`Session surf · ${reminder.spotName}`, {
      body: "Ton créneau approche. Vérifie une dernière fois les conditions avant de partir.",
      icon: "./assets/icon-192.png",
      badge: "./assets/icon-192.png",
      tag: `session-${reminder.id}`,
      data: { url: reminder.routeUrl || "./#forecast" }
    });
    reminder.sent = true;
  }
  await writeWorkerValue("session-reminders", reminders);
}

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(
    fetch(event.request).then((response) => {
      if (response.ok) {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
      }
      return response;
    }).catch(() => caches.match(event.request).then((cached) => cached || caches.match("./index.html")))
  );
});

self.addEventListener("periodicsync", (event) => {
  if (event.tag === "surf-radar-daily") event.waitUntil(Promise.all([runBackgroundCheck(), sendDueSessionReminders()]));
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SURF_RADAR_CHECK_NOW") event.waitUntil(runBackgroundCheck());
  if (event.data?.type === "SURF_RADAR_REMINDERS_CHECK") event.waitUntil(sendDueSessionReminders());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "./#forecast";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const existing = clients[0];
      if (existing) {
        existing.navigate(url);
        return existing.focus();
      }
      return self.clients.openWindow(url);
    })
  );
});
