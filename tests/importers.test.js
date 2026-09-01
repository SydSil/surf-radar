import test from "node:test";
import assert from "node:assert/strict";
import { coordinatesFromGoogleUrl, exportBackup, importGoogleTakeout, parseBackup, parseCsv } from "../importers.js";

test("parseCsv gère les virgules et retours ligne entre guillemets", () => {
  const rows = parseCsv('Title,Note,URL\r\n"Wissant, plage","Ligne 1\nLigne 2","https://maps.google.com/@50.888,1.66,14z"');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].title, "Wissant, plage");
  assert.equal(rows[0].note, "Ligne 1\nLigne 2");
});

test("extrait les coordonnées @lat,lon", () => {
  assert.deepEqual(coordinatesFromGoogleUrl("https://www.google.com/maps/place/foo/@50.88825,1.65975,15z"), { lat: 50.88825, lon: 1.65975 });
});

test("extrait les coordonnées Google !3d !4d", () => {
  assert.deepEqual(coordinatesFromGoogleUrl("https://maps.google.com/data=!3d49.56777!4d-1.84302"), { lat: 49.56777, lon: -1.84302 });
});

test("extrait les coordonnées query encodées", () => {
  assert.deepEqual(coordinatesFromGoogleUrl("https://www.google.com/maps/search/?api=1&query=52.1070%2C4.2722"), { lat: 52.107, lon: 4.2722 });
});

test("la sauvegarde Surf Radar fait un aller-retour", () => {
  const state = { profile: { homeName: "Laon" }, spots: [{ id: "a", name: "Spot" }] };
  assert.deepEqual(parseBackup(exportBackup(state)), state);
});

test("un JSON quelconque est refusé comme sauvegarde", () => {
  assert.throws(() => parseBackup('{"spots":[]}'), /pas une sauvegarde/i);
});

test("l’import Takeout ne transforme pas une coordonnée absente en 0,0", async () => {
  const file = {
    name: "spot surf.csv",
    text: async () => 'Title,Note,URL,Tags\n"Sans coordonnées","À compléter","https://maps.app.goo.gl/exemple","spot surf"'
  };
  const result = await importGoogleTakeout([file]);
  assert.equal(result.spots.length, 1);
  assert.equal(result.spots[0].lat, null);
  assert.equal(result.spots[0].lon, null);
  assert.equal(result.spots[0].needsCoordinates, true);
  assert.equal(result.unresolved, 1);
});

test("l’import Takeout extrait les coordonnées de liens Google Maps", async () => {
  const file = {
    name: "spot surf.csv",
    text: async () => 'Title,URL\n"Siouville","https://www.google.com/maps/place/Siouville/@49.56777,-1.84302,14z"\n"Scheveningen","https://www.google.com/maps/search/?api=1&query=52.1070%2C4.2722"'
  };
  const result = await importGoogleTakeout([file]);
  assert.equal(result.resolved, 2);
  assert.deepEqual([result.spots[0].lat, result.spots[0].lon], [49.56777, -1.84302]);
  assert.deepEqual([result.spots[1].lat, result.spots[1].lon], [52.107, 4.2722]);
});
