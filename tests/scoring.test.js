import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_PROFILE,
  angularDistance,
  combineForecasts,
  directionScore,
  findWindows,
  rangeScore,
  scoreSlot
} from "../scoring.js";

const spot = {
  id: "test",
  name: "Plage test",
  sweetMin: 0.6,
  sweetMax: 1.2,
  hardMax: 1.5,
  maxWind: 24,
  swellSector: "nw",
  offshoreSector: "se",
  tidePreference: "rising"
};

function slot(overrides = {}) {
  return {
    time: "2026-09-02T10:00",
    timestamp: new Date("2026-09-02T10:00").getTime(),
    waveHeight: 1,
    waveDirection: 300,
    wavePeriod: 10,
    swellHeight: 0.9,
    swellDirection: 300,
    swellPeriod: 10,
    secondarySwellHeight: 0.2,
    secondarySwellDirection: 280,
    secondarySwellPeriod: 7,
    tideLevel: 1.2,
    tideFraction: 0.55,
    tideTrend: "rising",
    windSpeed: 8,
    windDirection: 135,
    windGust: 13,
    isDay: true,
    ...overrides
  };
}

test("angularDistance gère le passage par le nord", () => {
  assert.equal(angularDistance(350, 10), 20);
  assert.equal(angularDistance(10, 350), 20);
});

test("les secteurs enveloppants reconnaissent le nord", () => {
  assert.equal(directionScore(350, "n"), 1);
  assert.equal(directionScore(20, "n"), 1);
  assert.ok(directionScore(180, "n") < 0.2);
});

test("rangeScore favorise la zone idéale", () => {
  assert.equal(rangeScore(0.9, 0.3, 0.6, 1.2, 1.5), 1);
  assert.equal(rangeScore(1.6, 0.3, 0.6, 1.2, 1.5), 0);
  assert.ok(rangeScore(0.45, 0.3, 0.6, 1.2, 1.5) > 0);
});

test("un créneau doux et offshore dépasse le seuil", () => {
  const scored = scoreSlot(slot(), spot, DEFAULT_PROFILE, new Date("2026-09-01T08:00").getTime());
  assert.ok(scored.score >= 72, `score obtenu: ${scored.score}`);
  assert.equal(scored.qualified, true);
  assert.equal(scored.noGoReasons.length, 0);
});

test("une houle hors limite débutant est bloquée", () => {
  const scored = scoreSlot(slot({ swellHeight: 1.8, waveHeight: 2.1 }), spot, DEFAULT_PROFILE);
  assert.ok(scored.score <= 44);
  assert.equal(scored.qualified, false);
  assert.ok(scored.noGoReasons.some((reason) => reason.includes("limite")));
});

test("une houle de quatre secondes n’est pas présentée comme une belle session", () => {
  const scored = scoreSlot(slot({ swellPeriod: 4, wavePeriod: 4 }), spot, DEFAULT_PROFILE);
  assert.ok(scored.score <= 58);
  assert.equal(scored.qualified, false);
  assert.ok(scored.cautions.some((reason) => reason.includes("trop courte")));
});

test("un créneau demande deux heures consécutives", () => {
  const base = new Date("2026-09-02T09:00").getTime();
  const one = findWindows([slot({ timestamp: base, time: "2026-09-02T09:00" })], spot, DEFAULT_PROFILE, base - 86400000);
  const two = findWindows([
    slot({ timestamp: base, time: "2026-09-02T09:00" }),
    slot({ timestamp: base + 3600000, time: "2026-09-02T10:00" })
  ], spot, DEFAULT_PROFILE, base - 86400000);
  assert.equal(one.windows.length, 0);
  assert.equal(two.windows.length, 1);
  assert.equal(two.windows[0].durationHours, 2);
});

test("combineForecasts aligne mer, vent, marée et lumière", () => {
  const marine = {
    hourly: {
      time: ["2026-09-02T09:00", "2026-09-02T10:00", "2026-09-02T11:00"],
      wave_height: [0.8, 0.9, 1],
      wave_direction: [300, 300, 300],
      wave_period: [9, 10, 10],
      swell_wave_height: [0.7, 0.8, 0.9],
      swell_wave_direction: [300, 300, 300],
      swell_wave_period: [9, 10, 10],
      sea_level_height_msl: [0.2, 0.5, 0.8]
    }
  };
  const weather = {
    hourly: {
      time: ["2026-09-02T09:00", "2026-09-02T10:00", "2026-09-02T11:00"],
      wind_speed_10m: [8, 9, 10],
      wind_direction_10m: [135, 140, 145],
      wind_gusts_10m: [12, 13, 14]
    },
    daily: { time: ["2026-09-02"], sunrise: ["2026-09-02T07:10"], sunset: ["2026-09-02T20:30"] }
  };
  const combined = combineForecasts(marine, weather);
  assert.equal(combined.length, 3);
  assert.equal(combined[1].windSpeed, 9);
  assert.equal(combined[1].tideTrend, "rising");
  assert.ok(Math.abs(combined[1].tideFraction - 0.5) < 1e-9);
  assert.equal(combined[1].isDay, true);
});
