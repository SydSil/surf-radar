const clean = (value) => String(value ?? "").replace(/^\uFEFF/, "").trim();
const normalizedKey = (value) => clean(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

function detectDelimiter(text) {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const counts = [[",", 0], [";", 0], ["\t", 0]];
  let quoted = false;
  for (const character of firstLine) {
    if (character === '"') quoted = !quoted;
    if (!quoted) {
      const candidate = counts.find(([delimiter]) => delimiter === character);
      if (candidate) candidate[1] += 1;
    }
  }
  return counts.sort((a, b) => b[1] - a[1])[0][0];
}

export function parseCsv(text) {
  const delimiter = detectDelimiter(text);
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  const source = String(text).replace(/^\uFEFF/, "");

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];
    if (character === '"' && quoted && next === '"') {
      field += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === delimiter && !quoted) {
      row.push(field);
      field = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && next === "\n") index += 1;
      row.push(field);
      field = "";
      if (row.some((value) => clean(value))) rows.push(row);
      row = [];
    } else {
      field += character;
    }
  }
  if (field.length || row.length) {
    row.push(field);
    if (row.some((value) => clean(value))) rows.push(row);
  }
  if (rows.length < 2) return [];

  const headers = rows[0].map(normalizedKey);
  return rows.slice(1).map((values) => Object.fromEntries(headers.map((header, index) => [header || `column_${index}`, clean(values[index])])));
}

export function coordinatesFromGoogleUrl(rawUrl) {
  const url = clean(rawUrl);
  if (!url) return null;
  const decoded = (() => {
    try { return decodeURIComponent(url); } catch { return url; }
  })();
  const patterns = [
    /@(-?\d{1,2}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)(?:,|\/|$)/,
    /!3d(-?\d{1,2}(?:\.\d+)?).*?!4d(-?\d{1,3}(?:\.\d+)?)/,
    /(?:query|q|destination)=(-?\d{1,2}(?:\.\d+)?)[,%20+ ]+(-?\d{1,3}(?:\.\d+)?)/i
  ];
  for (const pattern of patterns) {
    const match = decoded.match(pattern);
    if (!match) continue;
    const lat = Number(match[1]);
    const lon = Number(match[2]);
    if (Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) return { lat, lon };
  }
  return null;
}

function firstValue(row, candidates) {
  for (const candidate of candidates) {
    const key = normalizedKey(candidate);
    if (clean(row[key])) return clean(row[key]);
  }
  return "";
}

function numberValue(row, candidates) {
  const raw = firstValue(row, candidates).replace(",", ".");
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function defaultSpot({ name, lat, lon, url, notes, source }) {
  const resolved = Number.isFinite(lat) && Number.isFinite(lon);
  return {
    id: crypto.randomUUID(),
    name: name || "Spot importé",
    lat: resolved ? lat : null,
    lon: resolved ? lon : null,
    country: "",
    travelHours: null,
    googleMapsUrl: url || "",
    notes: notes || "",
    source: source || "Google Takeout",
    enabled: resolved,
    needsCoordinates: !resolved,
    sweetMin: 0.6,
    sweetMax: 1.2,
    hardMax: 1.5,
    maxWind: 24,
    swellSector: "any",
    offshoreSector: "any",
    tidePreference: "any"
  };
}

function spotsFromCsv(text, filename) {
  return parseCsv(text).map((row) => {
    const name = firstValue(row, ["title", "name", "nom", "place", "lieu"]);
    const url = firstValue(row, ["url", "google maps url", "location url", "link", "lien"]);
    const notes = [
      firstValue(row, ["note", "notes"]),
      firstValue(row, ["comment", "commentaire"]),
      firstValue(row, ["tags", "list", "liste"])
    ].filter(Boolean).join(" · ");
    let lat = numberValue(row, ["latitude", "lat"]);
    let lon = numberValue(row, ["longitude", "lon", "lng"]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      const coordinates = coordinatesFromGoogleUrl(url);
      lat = coordinates?.lat ?? null;
      lon = coordinates?.lon ?? null;
    }
    return defaultSpot({ name, lat, lon, url, notes, source: filename });
  }).filter((spot) => spot.name || spot.googleMapsUrl);
}

function spotsFromGeoJson(json, filename) {
  const features = Array.isArray(json?.features) ? json.features : [];
  return features.map((feature) => {
    const coordinates = feature?.geometry?.type === "Point" ? feature.geometry.coordinates : [];
    const lon = Number(coordinates?.[0]);
    const lat = Number(coordinates?.[1]);
    const properties = feature?.properties ?? {};
    const name = properties.name || properties.title || properties.location?.name || "Spot importé";
    const url = properties.url || properties.google_maps_url || "";
    const notes = properties.description || properties.note || properties.comment || "";
    return defaultSpot({
      name: clean(name),
      lat: Number.isFinite(lat) ? lat : null,
      lon: Number.isFinite(lon) ? lon : null,
      url: clean(url),
      notes: clean(notes),
      source: filename
    });
  });
}

function spotsFromJson(json, filename) {
  if (json?.type === "FeatureCollection") return spotsFromGeoJson(json, filename);
  const items = Array.isArray(json) ? json : Array.isArray(json?.locations) ? json.locations : Array.isArray(json?.places) ? json.places : [];
  return items.map((item) => {
    const url = item.url || item.googleMapsUrl || item.google_maps_url || "";
    const fromUrl = coordinatesFromGoogleUrl(url);
    const location = item.location || {};
    const lat = Number(item.lat ?? item.latitude ?? location.lat ?? location.latitude ?? fromUrl?.lat);
    const lon = Number(item.lon ?? item.lng ?? item.longitude ?? location.lon ?? location.lng ?? location.longitude ?? fromUrl?.lon);
    return defaultSpot({
      name: clean(item.name || item.title || location.name),
      lat: Number.isFinite(lat) ? lat : null,
      lon: Number.isFinite(lon) ? lon : null,
      url: clean(url),
      notes: clean(item.notes || item.note || item.comment || item.description),
      source: filename
    });
  });
}

function deduplicate(spots) {
  const seen = new Set();
  return spots.filter((spot) => {
    const coordinateKey = Number.isFinite(spot.lat) && Number.isFinite(spot.lon) ? `${spot.lat.toFixed(5)},${spot.lon.toFixed(5)}` : "";
    const key = `${spot.name.toLowerCase()}|${coordinateKey}|${spot.googleMapsUrl}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function importGoogleTakeout(files) {
  const imported = [];
  const errors = [];
  for (const file of files) {
    try {
      const text = await file.text();
      const extension = file.name.toLowerCase().split(".").pop();
      if (extension === "csv") imported.push(...spotsFromCsv(text, file.name));
      else imported.push(...spotsFromJson(JSON.parse(text), file.name));
    } catch (error) {
      errors.push(`${file.name}: ${error.message}`);
    }
  }
  const spots = deduplicate(imported);
  return {
    spots,
    errors,
    resolved: spots.filter((spot) => !spot.needsCoordinates).length,
    unresolved: spots.filter((spot) => spot.needsCoordinates).length
  };
}

export function exportBackup(state) {
  return JSON.stringify({
    format: "surf-radar-backup",
    version: 1,
    exportedAt: new Date().toISOString(),
    profile: state.profile,
    spots: state.spots
  }, null, 2);
}

export function parseBackup(text) {
  const backup = JSON.parse(text);
  if (backup?.format !== "surf-radar-backup" || !Array.isArray(backup.spots) || !backup.profile) {
    throw new Error("Ce fichier n’est pas une sauvegarde Surf Radar valide.");
  }
  return { profile: backup.profile, spots: backup.spots };
}
