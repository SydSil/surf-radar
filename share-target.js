import { coordinatesFromGoogleUrl } from "./importers.js";

const clean = (value) => String(value ?? "").trim();

export function normalizeSpotName(value) {
  return clean(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function firstSharedUrl(...values) {
  for (const value of values) {
    const direct = clean(value);
    if (/^https?:\/\//i.test(direct)) return direct;
    const match = direct.match(/https?:\/\/[^\s]+/i);
    if (match) return match[0].replace(/[),.;]+$/, "");
  }
  return "";
}

function usefulTitle(title) {
  const value = clean(title);
  if (!value || /^(google maps|maps|partager|share)$/i.test(value)) return "";
  return value;
}

function firstTextLine(text) {
  return clean(text)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line && !/^https?:\/\//i.test(line)) || "";
}

export function parseShareTarget(search) {
  const parameters = new URLSearchParams(String(search || "").replace(/^\?/, ""));
  if (parameters.get("share") !== "spot") return null;
  const title = clean(parameters.get("title"));
  const text = clean(parameters.get("text"));
  const url = clean(parameters.get("url"));
  const googleMapsUrl = firstSharedUrl(url, text, title);
  const name = usefulTitle(title) || firstTextLine(text);
  const normalized = normalizeSpotName(name);
  return {
    title,
    text,
    name,
    googleMapsUrl,
    coordinates: coordinatesFromGoogleUrl(googleMapsUrl || text),
    isList: normalized === "spot surf" || /\b(?:liste partag[eé]e|\d+\s+(?:lieux|places))\b/i.test(text)
  };
}

function distanceKm(a, b) {
  const radians = (degrees) => degrees * Math.PI / 180;
  const lat1 = radians(Number(a.lat));
  const lat2 = radians(Number(b.lat));
  const deltaLat = lat2 - lat1;
  const deltaLon = radians(Number(b.lon) - Number(a.lon));
  const value = Math.sin(deltaLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

export function matchCatalogSpot(shared, catalog) {
  if (!shared) return null;
  if (shared.coordinates) {
    const nearby = catalog
      .map((spot) => ({ spot, distance: distanceKm(shared.coordinates, spot) }))
      .filter(({ distance }) => distance <= 3)
      .sort((a, b) => a.distance - b.distance)[0];
    if (nearby) return nearby.spot;
  }

  const sharedName = normalizeSpotName(shared.name);
  if (sharedName.length < 4) return null;
  return catalog.find((spot) => {
    const full = normalizeSpotName(spot.name);
    const core = normalizeSpotName(String(spot.name).split("—")[0]);
    const id = normalizeSpotName(spot.catalogId);
    return [full, core, id].some((candidate) => candidate.length >= 4 && (sharedName.includes(candidate) || candidate.includes(sharedName)));
  }) || null;
}
