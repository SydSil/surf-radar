import { cardinalFromDegrees } from "./scoring.js";
import { googleMapsDirectionsUrl } from "./catalog.js";

const HOUR = 60 * 60 * 1000;

function icsEscape(value) {
  return String(value ?? "")
    .replaceAll("\\", "\\\\")
    .replaceAll(";", "\\;")
    .replaceAll(",", "\\,")
    .replace(/\r?\n/g, "\\n");
}

function icsTimestamp(timestamp) {
  return new Date(timestamp).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function safeNumber(value, digits = 0) {
  return Number.isFinite(Number(value)) ? Number(value).toFixed(digits) : "—";
}

export function sessionEndTimestamp(window) {
  return Number(window.end.timestamp) + HOUR;
}

export function sessionLocation(spot) {
  return spot.address || [spot.name, spot.country].filter(Boolean).join(", ");
}

export function sessionCalendarFilename(window) {
  const slug = String(window.spot.name || "session-surf")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "session-surf";
  return `surf-${slug}.ics`;
}

export function sessionCalendarFile(window, { reminders = [1440, 120] } = {}) {
  const peak = window.peak;
  const spot = window.spot;
  const swellHeight = peak.swellHeight ?? peak.waveHeight;
  const swellPeriod = peak.swellPeriod ?? peak.wavePeriod;
  const swellDirection = peak.swellDirection ?? peak.waveDirection;
  const routeUrl = googleMapsDirectionsUrl(spot);
  const tide = peak.tideTrend === "rising" ? "montante" : peak.tideTrend === "falling" ? "descendante" : "à vérifier";
  const description = [
    `Potentiel Surf Radar : ${window.score}/100 (${window.confidence.label}).`,
    `Houle : ${safeNumber(swellHeight, 1)} m · ${safeNumber(swellPeriod)} s · ${cardinalFromDegrees(swellDirection)}.`,
    `Vent : ${safeNumber(peak.windSpeed)} km/h · ${cardinalFromDegrees(peak.windDirection)}.`,
    `Marée : ${tide}.`,
    window.positives?.length ? `Points favorables : ${window.positives.join(", ")}.` : "",
    spot.notes ? `À savoir : ${spot.notes}` : "",
    routeUrl ? `Itinéraire Google Maps : ${routeUrl}` : "",
    spot.webcamUrl ? `Webcam : ${spot.webcamUrl}` : ""
  ].filter(Boolean).join("\n");
  const alarms = reminders.map((minutes) => [
    "BEGIN:VALARM",
    `TRIGGER:-PT${minutes}M`,
    "ACTION:DISPLAY",
    `DESCRIPTION:${icsEscape(`Session surf à ${spot.name}`)}`,
    "END:VALARM"
  ].join("\r\n"));

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "PRODID:-//Surf Radar//Session surf//FR",
    "BEGIN:VEVENT",
    `UID:${icsEscape(`${window.id}@surf-radar`)}`,
    `DTSTAMP:${icsTimestamp(Date.now())}`,
    `DTSTART:${icsTimestamp(window.start.timestamp)}`,
    `DTEND:${icsTimestamp(sessionEndTimestamp(window))}`,
    `SUMMARY:${icsEscape(`Surf · ${spot.name}`)}`,
    `LOCATION:${icsEscape(sessionLocation(spot))}`,
    `DESCRIPTION:${icsEscape(description)}`,
    routeUrl ? `URL:${routeUrl}` : "",
    ...alarms,
    "END:VEVENT",
    "END:VCALENDAR",
    ""
  ].filter(Boolean).join("\r\n");
}

export function reminderForWindow(window, now = Date.now()) {
  const start = Number(window.start.timestamp);
  const options = [
    { offset: 24 * HOUR, label: "la veille" },
    { offset: 2 * HOUR, label: "2 h avant" },
    { offset: 30 * 60 * 1000, label: "30 min avant" }
  ];
  const choice = options.find(({ offset }) => start - offset > now);
  if (!choice) return null;
  return {
    id: window.id,
    windowId: window.id,
    spotName: window.spot.name,
    start,
    remindAt: start - choice.offset,
    label: choice.label,
    routeUrl: googleMapsDirectionsUrl(window.spot),
    sent: false
  };
}
