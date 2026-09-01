const MS_HOUR = 60 * 60 * 1000;

export const DEFAULT_PROFILE = {
  homeName: "Laon (02)",
  homeLat: 49.563,
  homeLon: 3.624,
  level: "beginner_autonomous",
  board: "Mini-malibu SOUL 7'3 en résine",
  maxDriveHours: 5,
  alertThreshold: 72,
  defaultSweetMin: 0.6,
  defaultSweetMax: 1.2,
  defaultHardMax: 1.5,
  defaultMaxWind: 24
};

export const DIRECTION_SECTORS = {
  any: null,
  n: [315, 45],
  ne: [0, 90],
  e: [45, 135],
  se: [90, 180],
  s: [135, 225],
  sw: [180, 270],
  w: [225, 315],
  nw: [270, 360]
};

export const DIRECTION_LABELS = {
  any: "Inconnu / toutes directions",
  n: "Nord",
  ne: "Nord-est",
  e: "Est",
  se: "Sud-est",
  s: "Sud",
  sw: "Sud-ouest",
  w: "Ouest",
  nw: "Nord-ouest"
};

const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const validNumber = (value) => typeof value === "number" && Number.isFinite(value);

export function angularDistance(a, b) {
  const delta = Math.abs((((a - b) % 360) + 360) % 360);
  return Math.min(delta, 360 - delta);
}

function sectorContains(angle, sector) {
  if (!sector || !validNumber(angle)) return false;
  const [start, end] = sector;
  const normalized = ((angle % 360) + 360) % 360;
  return start <= end
    ? normalized >= start && normalized <= end
    : normalized >= start || normalized <= end;
}

function sectorEdgeDistance(angle, sector) {
  return Math.min(angularDistance(angle, sector[0]), angularDistance(angle, sector[1]));
}

export function directionScore(angle, sectorKey, neutral = 0.65) {
  const sector = DIRECTION_SECTORS[sectorKey] ?? null;
  if (!sector || !validNumber(angle)) return neutral;
  if (sectorContains(angle, sector)) return 1;
  const distance = sectorEdgeDistance(angle, sector);
  if (distance <= 35) return clamp(1 - distance / 55, 0.35, 0.9);
  return 0.12;
}

export function rangeScore(value, hardMin, sweetMin, sweetMax, hardMax) {
  if (!validNumber(value)) return 0.45;
  if (value <= hardMin || value >= hardMax) return 0;
  if (value >= sweetMin && value <= sweetMax) return 1;
  if (value < sweetMin) return clamp((value - hardMin) / (sweetMin - hardMin));
  return clamp((hardMax - value) / (hardMax - sweetMax));
}

export function cardinalFromDegrees(value) {
  if (!validNumber(value)) return "—";
  const labels = ["N", "NE", "E", "SE", "S", "SO", "O", "NO"];
  return labels[Math.round((((value % 360) + 360) % 360) / 45) % 8];
}

function dailyTideStats(marine) {
  const groups = new Map();
  const times = marine?.hourly?.time ?? [];
  const levels = marine?.hourly?.sea_level_height_msl ?? [];
  times.forEach((time, index) => {
    const level = levels[index];
    if (!validNumber(level)) return;
    const key = String(time).slice(0, 10);
    const values = groups.get(key) ?? [];
    values.push(level);
    groups.set(key, values);
  });
  return new Map([...groups].map(([day, values]) => [day, {
    min: Math.min(...values),
    max: Math.max(...values)
  }]));
}

function daylightMap(weather) {
  const result = new Map();
  const days = weather?.daily?.time ?? [];
  const sunrise = weather?.daily?.sunrise ?? [];
  const sunset = weather?.daily?.sunset ?? [];
  days.forEach((day, index) => result.set(day, { sunrise: sunrise[index], sunset: sunset[index] }));
  return result;
}

export function combineForecasts(marine, weather) {
  const weatherIndex = new Map((weather?.hourly?.time ?? []).map((time, index) => [time, index]));
  const tideStats = dailyTideStats(marine);
  const daylight = daylightMap(weather);
  const times = marine?.hourly?.time ?? [];
  const h = marine?.hourly ?? {};
  const w = weather?.hourly ?? {};

  return times.map((time, index) => {
    const weatherPosition = weatherIndex.get(time);
    const day = String(time).slice(0, 10);
    const tideLevel = h.sea_level_height_msl?.[index];
    const stats = tideStats.get(day);
    const previousLevel = h.sea_level_height_msl?.[Math.max(0, index - 1)];
    const tideFraction = validNumber(tideLevel) && stats && stats.max > stats.min
      ? clamp((tideLevel - stats.min) / (stats.max - stats.min))
      : null;
    const sun = daylight.get(day);
    const isDay = sun?.sunrise && sun?.sunset
      ? time >= sun.sunrise && time <= sun.sunset
      : Number(String(time).slice(11, 13)) >= 7 && Number(String(time).slice(11, 13)) <= 20;

    return {
      time,
      timestamp: new Date(time).getTime(),
      waveHeight: h.wave_height?.[index] ?? null,
      waveDirection: h.wave_direction?.[index] ?? null,
      wavePeriod: h.wave_period?.[index] ?? null,
      swellHeight: h.swell_wave_height?.[index] ?? null,
      swellDirection: h.swell_wave_direction?.[index] ?? null,
      swellPeriod: h.swell_wave_period?.[index] ?? null,
      secondarySwellHeight: h.secondary_swell_wave_height?.[index] ?? null,
      secondarySwellDirection: h.secondary_swell_wave_direction?.[index] ?? null,
      secondarySwellPeriod: h.secondary_swell_wave_period?.[index] ?? null,
      tideLevel: validNumber(tideLevel) ? tideLevel : null,
      tideFraction,
      tideTrend: validNumber(tideLevel) && validNumber(previousLevel)
        ? tideLevel >= previousLevel ? "rising" : "falling"
        : null,
      windSpeed: weatherPosition === undefined ? null : w.wind_speed_10m?.[weatherPosition] ?? null,
      windDirection: weatherPosition === undefined ? null : w.wind_direction_10m?.[weatherPosition] ?? null,
      windGust: weatherPosition === undefined ? null : w.wind_gusts_10m?.[weatherPosition] ?? null,
      isDay
    };
  });
}

function windComponent(slot, spot) {
  const maxWind = Number(spot.maxWind || 24);
  const speed = validNumber(slot.windSpeed) ? slot.windSpeed : maxWind * 0.55;
  const speedScore = speed <= 8 ? 1 : clamp((maxWind - speed) / Math.max(1, maxWind - 8));
  const orientationScore = directionScore(slot.windDirection, spot.offshoreSector, 0.62);
  return 0.48 * speedScore + 0.52 * orientationScore;
}

function tideComponent(slot, spot) {
  if (!validNumber(slot.tideFraction)) return 0.62;
  const middleTide = rangeScore(slot.tideFraction, 0, 0.22, 0.78, 1);
  if (!spot.tidePreference || spot.tidePreference === "any" || !slot.tideTrend) {
    return 0.7 + middleTide * 0.3;
  }
  const trendMatch = slot.tideTrend === spot.tidePreference ? 1 : 0.38;
  return trendMatch * 0.7 + middleTide * 0.3;
}

export function confidenceFor(timestamp, now = Date.now()) {
  const leadHours = Math.max(0, (timestamp - now) / MS_HOUR);
  if (leadHours <= 48) return { key: "high", label: "Élevée", detail: "0–2 jours" };
  if (leadHours <= 96) return { key: "medium", label: "Moyenne", detail: "3–4 jours" };
  return { key: "low", label: "Tendance", detail: "5 jours et +" };
}

export function scoreSlot(slot, spot, profile = DEFAULT_PROFILE, now = Date.now()) {
  const swellHeight = validNumber(slot.swellHeight) ? slot.swellHeight : slot.waveHeight;
  const swellPeriod = validNumber(slot.swellPeriod) ? slot.swellPeriod : slot.wavePeriod;
  const swellDirection = validNumber(slot.swellDirection) ? slot.swellDirection : slot.waveDirection;
  const sweetMin = Number(spot.sweetMin || profile.defaultSweetMin || 0.6);
  const sweetMax = Number(spot.sweetMax || profile.defaultSweetMax || 1.2);
  const hardMax = Number(spot.hardMax || profile.defaultHardMax || 1.5);
  const hardMin = Math.min(0.3, sweetMin * 0.45);

  const components = {
    height: rangeScore(swellHeight, hardMin, sweetMin, sweetMax, hardMax),
    period: rangeScore(swellPeriod, 5.5, 8, 13, 16.5),
    direction: directionScore(swellDirection, spot.swellSector, 0.68),
    wind: windComponent(slot, spot),
    tide: tideComponent(slot, spot),
    daylight: slot.isDay ? 1 : 0
  };

  let score = Math.round(100 * (
    components.height * 0.32 +
    components.period * 0.13 +
    components.direction * 0.16 +
    components.wind * 0.24 +
    components.tide * 0.10 +
    components.daylight * 0.05
  ));

  const cautions = [];
  const noGoReasons = [];
  if (validNumber(swellHeight) && swellHeight >= hardMax) {
    noGoReasons.push(`houle ${swellHeight.toFixed(1)} m au-dessus de ta limite`);
  }
  if (validNumber(slot.waveHeight) && slot.waveHeight >= Math.max(1.8, hardMax * 1.22)) {
    noGoReasons.push("mer totale trop forte pour le profil débutant");
  }
  if (validNumber(slot.windSpeed) && slot.windSpeed > Number(spot.maxWind || profile.defaultMaxWind || 24)) {
    noGoReasons.push("vent trop fort");
  }
  if (validNumber(slot.windGust) && slot.windGust >= 38) {
    noGoReasons.push("rafales fortes");
  }
  if (validNumber(swellPeriod) && swellPeriod < 5.5) {
    cautions.push("période trop courte pour des vagues bien formées");
    score = Math.min(score, 58);
  } else if (validNumber(swellPeriod) && swellPeriod < 6.5) {
    cautions.push("période courte, vagues probablement peu organisées");
    score = Math.min(score, 69);
  }
  if (validNumber(swellPeriod) && swellPeriod >= 14.5 && validNumber(swellHeight) && swellHeight >= 1) {
    cautions.push("houle longue et plus puissante qu’elle n’en a l’air");
    score = Math.min(score, 68);
  }
  if (!slot.isDay) noGoReasons.push("hors lumière du jour");
  if (noGoReasons.length) score = Math.min(score, 44);

  const positives = [];
  if (components.height >= 0.8) positives.push("taille dans ta zone de confort");
  if (components.period >= 0.8) positives.push("houle assez organisée");
  if (components.direction >= 0.85 && spot.swellSector !== "any") positives.push("bonne orientation de houle");
  if (components.wind >= 0.8) positives.push("vent favorable");
  if (components.tide >= 0.82) positives.push("marée favorable");

  const label = score >= 82 ? "Excellent potentiel" : score >= 72 ? "Très bon pour toi" : score >= 60 ? "Prometteur" : score >= 45 ? "Moyen" : "À éviter";
  return {
    ...slot,
    score,
    label,
    components,
    confidence: confidenceFor(slot.timestamp, now),
    positives,
    cautions,
    noGoReasons,
    qualified: score >= Number(profile.alertThreshold || 72) && noGoReasons.length === 0
  };
}

function finalizeWindow(slots, spot) {
  if (slots.length < 2) return null;
  const peak = slots.reduce((best, slot) => slot.score > best.score ? slot : best, slots[0]);
  const mean = Math.round(slots.reduce((sum, slot) => sum + slot.score, 0) / slots.length);
  const positives = [...new Set(slots.flatMap((slot) => slot.positives))];
  return {
    id: `${spot.id}-${slots[0].time}`,
    spot,
    start: slots[0],
    end: slots[slots.length - 1],
    peak,
    score: Math.max(mean, peak.score - 4),
    positives,
    confidence: slots[0].confidence,
    durationHours: Math.max(1, Math.round((slots[slots.length - 1].timestamp - slots[0].timestamp) / MS_HOUR) + 1)
  };
}

export function findWindows(slots, spot, profile = DEFAULT_PROFILE, now = Date.now()) {
  const scored = slots.map((slot) => scoreSlot(slot, spot, profile, now));
  const windows = [];
  let current = [];
  for (const slot of scored) {
    const previous = current[current.length - 1];
    const consecutive = !previous || slot.timestamp - previous.timestamp <= 1.5 * MS_HOUR;
    if (slot.qualified && consecutive) {
      current.push(slot);
      continue;
    }
    if (current.length) {
      const window = finalizeWindow(current, spot);
      if (window) windows.push(window);
    }
    current = slot.qualified ? [slot] : [];
  }
  if (current.length) {
    const window = finalizeWindow(current, spot);
    if (window) windows.push(window);
  }
  return { scored, windows };
}
