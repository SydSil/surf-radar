import test from "node:test";
import assert from "node:assert/strict";
import { catalogSpot, googleMapsDirectionsUrl, personalStarterSpots, SPOT_CATALOG } from "../catalog.js";

test("le catalogue couvre les quatre zones demandées", () => {
  const regions = new Set(SPOT_CATALOG.map((spot) => spot.region));
  assert.ok(regions.has("Côte d’Opale"));
  assert.ok(regions.has("Flandre"));
  assert.ok(regions.has("Zélande"));
  assert.ok(regions.has("Cotentin"));
});

test("chaque spot du catalogue est directement exploitable", () => {
  const ids = new Set();
  for (const spot of SPOT_CATALOG) {
    assert.ok(spot.catalogId && !ids.has(spot.catalogId));
    ids.add(spot.catalogId);
    assert.ok(Number.isFinite(spot.lat) && spot.lat >= 49 && spot.lat <= 53);
    assert.ok(Number.isFinite(spot.lon) && spot.lon >= -3 && spot.lon <= 6);
    assert.ok(spot.name && spot.country && spot.sourceUrl);
    assert.ok(spot.sweetMin < spot.sweetMax && spot.sweetMax < spot.hardMax);
    assert.equal(spot.needsCoordinates, false);
    assert.equal(spot.enabled, true);
  }
});

test("catalogSpot crée une copie avec un identifiant local", () => {
  const spot = catalogSpot("wimereux", () => "local-id");
  assert.equal(spot.id, "local-id");
  assert.equal(spot.catalogId, "wimereux");
  assert.notEqual(spot, SPOT_CATALOG[0]);
  assert.equal(catalogSpot("inconnu", () => "x"), null);
});

test("chaque spot positionné ouvre un itinéraire Google Maps en voiture", () => {
  const url = new URL(googleMapsDirectionsUrl(SPOT_CATALOG[0]));
  assert.equal(url.origin, "https://www.google.com");
  assert.equal(url.pathname, "/maps/dir/");
  assert.equal(url.searchParams.get("api"), "1");
  assert.equal(url.searchParams.get("destination"), `${SPOT_CATALOG[0].lat},${SPOT_CATALOG[0].lon}`);
  assert.equal(url.searchParams.get("travelmode"), "driving");
});

test("un spot sans position ne propose pas d’itinéraire", () => {
  assert.equal(googleMapsDirectionsUrl({ name: "À retrouver" }), "");
});

test("les quatre lieux proches de la liste Google sont prêts au premier lancement", () => {
  let index = 0;
  const starters = personalStarterSpots(() => `starter-${index += 1}`);
  assert.deepEqual(starters.map((spot) => spot.catalogId), ["vluchtenburg", "le-rozel", "siouville", "sciotot"]);
  assert.ok(starters.every((spot) => spot.enabled && !spot.needsCoordinates));
});
