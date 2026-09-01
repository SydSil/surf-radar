import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_PROFILE } from "../scoring.js";
import { backgroundNotification, evaluateStateForecast, forecastUrls } from "../forecast.js";

const spot = {
  id: "wimereux",
  name: "Wimereux",
  lat: 50.763552,
  lon: 1.605747,
  enabled: true,
  needsCoordinates: false,
  sweetMin: 0.6,
  sweetMax: 1.2,
  hardMax: 1.5,
  maxWind: 24,
  swellSector: "nw",
  offshoreSector: "se",
  tidePreference: "rising"
};

const marine = {
  hourly: {
    time: ["2026-09-02T09:00", "2026-09-02T10:00"],
    wave_height: [1, 1], wave_direction: [300, 300], wave_period: [10, 10],
    swell_wave_height: [0.9, 0.9], swell_wave_direction: [300, 300], swell_wave_period: [10, 10],
    sea_level_height_msl: [0.2, 0.6]
  }
};

const weather = {
  hourly: {
    time: ["2026-09-02T09:00", "2026-09-02T10:00"],
    wind_speed_10m: [8, 8], wind_direction_10m: [135, 135], wind_gusts_10m: [12, 12]
  },
  daily: { time: ["2026-09-02"], sunrise: ["2026-09-02T07:00"], sunset: ["2026-09-02T20:30"] }
};

test("forecastUrls demande huit jours de mer, vent et lumière", () => {
  const urls = forecastUrls(spot);
  assert.match(urls.marine, /forecast_days=8/);
  assert.match(urls.marine, /swell_wave_period/);
  assert.match(urls.weather, /wind_gusts_10m/);
  assert.match(urls.weather, /sunrise%2Csunset/);
});

test("le contrôle de fond retrouve un vrai créneau de deux heures", async () => {
  const fetcher = async (url) => ({ ok: true, json: async () => String(url).includes("marine-api") ? marine : weather });
  const now = new Date("2026-09-01T08:00").getTime();
  const result = await evaluateStateForecast({ profile: DEFAULT_PROFILE, spots: [spot] }, { fetcher, now });
  assert.equal(result.errors.length, 0);
  assert.equal(result.windows.length, 1);
  assert.equal(result.windows[0].spot.name, "Wimereux");
  const notification = backgroundNotification(result.windows[0], now);
  assert.match(notification.title, /demain/);
  assert.match(notification.body, /Wimereux/);
});

test("un spot en erreur ne casse pas tout le contrôle quotidien", async () => {
  const fetcher = async () => ({ ok: false, status: 503, json: async () => ({}) });
  const result = await evaluateStateForecast({ profile: DEFAULT_PROFILE, spots: [spot] }, { fetcher });
  assert.equal(result.windows.length, 0);
  assert.equal(result.errors.length, 1);
});
