import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [html, app] = await Promise.all([
  readFile(new URL("../index.html", import.meta.url), "utf8"),
  readFile(new URL("../app.js", import.meta.url), "utf8")
]);

test("la croix et Annuler ferment le panneau sans déclencher la validation", () => {
  const closeControls = [...html.matchAll(/<(?:button)[^>]*data-action="close-spot"[^>]*>/g)].map((match) => match[0]);
  assert.equal(closeControls.length, 2);
  assert.ok(closeControls.every((control) => /type="button"/.test(control)));
  assert.match(app, /action === "close-spot" && spotDialog\.open/);
});

test("les recommandations de l’accueil proposent toutes un itinéraire", () => {
  assert.match(app, /routeButton\(next\.spot, "button button-primary hero-route"\)/);
  assert.match(app, /function nearMissCard[\s\S]*routeButton\(spot, "route-link"\)/);
  assert.match(app, /function windowCard[\s\S]*routeButton\(window\.spot, "route-link"\)/);
  assert.match(app, /function routeOnlyCard[\s\S]*routeButton\(spot, "route-link"\)/);
});
