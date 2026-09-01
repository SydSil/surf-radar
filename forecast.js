import { combineForecasts, findWindows } from "./scoring.js";

export function forecastUrls(spot) {
  const common = { latitude: spot.lat, longitude: spot.lon, forecast_days: 8, timezone: "auto" };
  const marine = new URL("https://marine-api.open-meteo.com/v1/marine");
  marine.search = new URLSearchParams({
    ...common,
    hourly: "wave_height,wave_direction,wave_period,swell_wave_height,swell_wave_direction,swell_wave_period,secondary_swell_wave_height,secondary_swell_wave_direction,secondary_swell_wave_period,sea_level_height_msl",
    cell_selection: "sea"
  });
  const weather = new URL("https://api.open-meteo.com/v1/forecast");
  weather.search = new URLSearchParams({
    ...common,
    hourly: "wind_speed_10m,wind_direction_10m,wind_gusts_10m",
    daily: "sunrise,sunset",
    wind_speed_unit: "kmh"
  });
  return { marine: marine.toString(), weather: weather.toString() };
}

export async function fetchJson(url, fetcher = fetch) {
  const response = await fetcher(url);
  if (!response.ok) throw new Error(`Erreur HTTP ${response.status}`);
  return response.json();
}

export async function evaluateStateForecast(state, { fetcher = fetch, now = Date.now() } = {}) {
  const spots = (state?.spots || []).filter((spot) => spot.enabled && !spot.needsCoordinates && Number.isFinite(spot.lat) && Number.isFinite(spot.lon));
  const entries = await Promise.all(spots.map(async (spot) => {
    try {
      const urls = forecastUrls(spot);
      const [marine, weather] = await Promise.all([
        fetchJson(urls.marine, fetcher),
        fetchJson(urls.weather, fetcher)
      ]);
      const { windows } = findWindows(combineForecasts(marine, weather), spot, state.profile, now);
      return { spot, windows, error: null };
    } catch (error) {
      return { spot, windows: [], error: error.message };
    }
  }));
  const windows = entries
    .flatMap((entry) => entry.windows)
    .filter((window) => window.start.timestamp > now - 60 * 60 * 1000)
    .sort((a, b) => a.start.timestamp - b.start.timestamp || b.score - a.score);
  return { windows, errors: entries.filter((entry) => entry.error).map((entry) => ({ spotId: entry.spot.id, message: entry.error })) };
}

export function backgroundNotification(window, now = Date.now()) {
  const start = new Date(window.start.timestamp);
  const end = new Date(window.end.timestamp + 60 * 60 * 1000);
  const day = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" }).format(start);
  const time = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" });
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const target = new Date(start);
  target.setHours(0, 0, 0, 0);
  const days = Math.round((target - today) / 86400000);
  const relative = days === 0 ? "aujourd’hui" : days === 1 ? "demain" : `dans ${days} jours`;
  return {
    title: `Belle fenêtre ${relative}`,
    body: `${window.spot.name} · ${day} ${time.format(start)}–${time.format(end)} · ${window.score}/100`
  };
}
