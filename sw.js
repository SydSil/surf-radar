import { backgroundNotification, evaluateStateForecast } from "./forecast.js";
import { readWorkerValue, writeWorkerValue } from "./worker-store.js";

const CACHE_NAME = "surf-radar-shell-v7";
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
  "./worker-store.js",
  "./vendor/leaflet/leaflet.js",
  "./vendor/leaflet/leaflet.css",
  "./vendor/leaflet/images/marker-icon.png",
  "./vendor/leaflet/images/marker-icon-2x.png",
  "./vendor/leaflet/images/marker-shadow.png",
  "./manifest.webmanifest",
  "./icon.svg",
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
  if (event.tag === "surf-radar-daily") event.waitUntil(runBackgroundCheck());
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SURF_RADAR_CHECK_NOW") event.waitUntil(runBackgroundCheck());
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
