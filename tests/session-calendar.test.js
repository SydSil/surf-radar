import test from "node:test";
import assert from "node:assert/strict";
import { reminderForWindow, sessionCalendarFile, sessionCalendarFilename } from "../session-calendar.js";

const start = Date.UTC(2026, 8, 12, 8, 0, 0);
const session = {
  id: "wissant-2026-09-12T08:00",
  score: 88,
  confidence: { label: "Fiable" },
  positives: ["vent favorable"],
  start: { timestamp: start },
  end: { timestamp: start + 60 * 60 * 1000 },
  peak: {
    swellHeight: 0.9,
    swellPeriod: 10,
    swellDirection: 275,
    windSpeed: 7,
    windDirection: 110,
    tideTrend: "rising"
  },
  spot: {
    name: "Wissant — plage",
    lat: 50.886111,
    lon: 1.663611,
    address: "Plage de Wissant, 62179 Wissant, France",
    notes: "Observer les courants.",
    webcamUrl: "https://example.com/webcam"
  }
};

test("le fichier agenda contient le lieu, les conditions, l’itinéraire et deux rappels", () => {
  const file = sessionCalendarFile(session);
  assert.match(file, /BEGIN:VCALENDAR/);
  assert.match(file, /LOCATION:Plage de Wissant\\, 62179 Wissant\\, France/);
  assert.match(file, /Houle : 0\.9 m/);
  assert.match(file, /google\.com\/maps\/dir/);
  assert.equal((file.match(/BEGIN:VALARM/g) || []).length, 2);
  assert.equal(sessionCalendarFilename(session), "surf-wissant-plage.ics");
});

test("le rappel privilégie la veille puis se rapproche du créneau", () => {
  const dayBefore = reminderForWindow(session, start - 48 * 60 * 60 * 1000);
  const near = reminderForWindow(session, start - 3 * 60 * 60 * 1000);
  assert.equal(dayBefore.label, "la veille");
  assert.equal(near.label, "2 h avant");
  assert.equal(reminderForWindow(session, start - 10 * 60 * 1000), null);
});
