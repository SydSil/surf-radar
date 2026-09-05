import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [html, app, styles] = await Promise.all([
  readFile(new URL("../index.html", import.meta.url), "utf8"),
  readFile(new URL("../app.js", import.meta.url), "utf8"),
  readFile(new URL("../styles.css", import.meta.url), "utf8")
]);

test("la croix et Annuler ferment le panneau sans déclencher la validation", () => {
  const closeControls = [...html.matchAll(/<(?:button)[^>]*data-action="close-spot"[^>]*>/g)].map((match) => match[0]);
  assert.equal(closeControls.length, 2);
  assert.ok(closeControls.every((control) => /type="button"/.test(control)));
  assert.match(app, /action === "close-spot" && spotDialog\.open/);
});

test("les recommandations de l’accueil proposent toutes un itinéraire", () => {
  assert.match(app, /function sessionSlide[\s\S]*routeButton\(window\.spot, "button button-primary hero-route"\)/);
  assert.match(app, /function trendHero[\s\S]*routeButton\(spot, "button button-primary hero-route"\)/);
  assert.match(app, /function watchCard[\s\S]*routeButton\(spot, "route-link"\)/);
});

test("l’accueil permet de parcourir les meilleurs spots et d’ouvrir leur fiche", () => {
  assert.match(app, /data-session-carousel/);
  assert.match(app, /data-action="show-session"/);
  assert.doesNotMatch(app, /carousel-arrow|data-carousel-count/);
  assert.match(app, /data-action="open-spot-detail"/);
  assert.match(html, /id="spot-detail-dialog"/);
});

test("chaque session recommandée propose rappel et agenda", () => {
  assert.match(app, /data-action="add-reminder"/);
  assert.match(app, /data-action="add-calendar"/);
  assert.match(app, /sessionCalendarFile/);
});

test("l’onglet Spots affiche les favoris sur une carte et masque l’aide Android derrière une icône", () => {
  assert.match(app, /id="spots-overview-map"/);
  assert.match(app, /function initSpotsOverviewMap/);
  assert.match(app, /aria-label="Comment ajouter un spot depuis Google Maps"/);
  assert.match(app, /<details class="android-help">/);
  assert.doesNotMatch(app, /class="panel google-share-panel"/);
});

test("la page Spots est centrée sur une grande carte et un seul CTA Ajouter", () => {
  const spotsView = app.match(/function renderSpots\(\)[\s\S]*?function initSpotsOverviewMap/)[0];
  assert.match(spotsView, /class="spots-map-controls"/);
  assert.match(spotsView, /data-action="add-spot"[^>]*>[\s\S]*?Ajouter/);
  assert.match(spotsView, /<h2 id="spots-map-title">Tous tes spots<\/h2>/);
  assert.doesNotMatch(spotsView, /Spots connus|Carte \/ recherche|data-action="open-google-import"/);
  assert.match(styles, /\.spots-overview-map\s*\{[^}]*height:\s*clamp\(480px, 58vh, 620px\)/);
  assert.match(styles, /\.spots-overview-map\s*\{\s*height:\s*430px/);
  assert.match(styles, /\.spots-map-head\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/);
  assert.match(styles, /\.spots-map-controls\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) 44px;[^}]*width:\s*100%/);
  assert.match(styles, /\.android-help-popover\s*\{[^}]*calc\(100vw - 72px\)/);
});

test("les spots passent entre Analyse active et En pause sans être supprimés", () => {
  const spotsView = app.match(/function spotCard\(spot\)[\s\S]*?function initSpotsOverviewMap/)[0];
  assert.match(spotsView, /data-action="toggle-spot-analysis"/);
  assert.match(spotsView, /role="switch"/);
  assert.match(spotsView, /<h2>Spots analysés<\/h2>/);
  assert.match(spotsView, /<h2 id="paused-spots-title">Spots en pause<\/h2>/);
  assert.doesNotMatch(spotsView, />Retirer<\/button>/);
  assert.doesNotMatch(spotsView, /analysis-toggle-copy|Dans le Radar/);
  assert.match(styles, /\.toggle-track\s*\{[^}]*display:\s*block/);
  assert.match(styles, /\.spot-actions\s*\{\s*flex-wrap:\s*nowrap/);
  assert.match(app, /spot\.enabled = target\.checked/);
  assert.match(app, /if \(!spot\.enabled\) runtime\.delete\(spot\.id\)/);
});

test("la carte distingue les spots analysés des spots en pause avec une icône disponible", () => {
  assert.match(app, /class="overview-marker \$\{isActive/);
  assert.doesNotMatch(app, /ph-map-pin-fill/);
  assert.match(app, /isActive \? "is-active" : "is-paused"/);
  assert.match(app, /L\.divIcon/);
  assert.match(styles, /mask: url\("\.\/vendor\/leaflet\/images\/marker-icon-2x\.png"\)/);
  assert.match(styles, /\.overview-marker\.is-active/);
  assert.match(styles, /\.overview-marker\.is-paused/);
  assert.match(app, /Légende de la carte/);
});

test("la suppression définitive est reléguée dans les réglages", () => {
  assert.match(html, /id="delete-spot-zone"/);
  assert.match(html, /Supprimer définitivement/);
  assert.match(app, /deleteZone\?\.classList\.toggle\("hidden", !spot\)/);
  assert.match(app, /Supprimer définitivement \$\{spot\.name\}/);
});

test("tous les CTA utilisent une silhouette pilule", () => {
  assert.match(styles, /\.button\s*\{[^}]*border-radius:\s*999px/);
  assert.match(styles, /\.hero-route\s*\{[^}]*border-radius:\s*999px/);
  assert.match(styles, /#install-button:not\(\.hidden\)\s*\{[^}]*border-radius:\s*999px/);
});

test("l’import Google Maps explique les deux parcours sans simuler une synchronisation", () => {
  assert.match(html, /id="google-import-dialog"/);
  assert.match(html, /Google ne propose pas de synchronisation directe des listes privées/);
  assert.match(html, /data-action="choose-takeout-file"/);
  assert.match(app, /action === "open-google-import"/);
  assert.match(app, /action === "choose-takeout-file"/);
  assert.doesNotMatch(app, /action === "import-takeout"/);
});

test("les motions couvrent ouverture, fermeture, pression et mouvement réduit", () => {
  assert.match(styles, /--ease-out:/);
  assert.match(styles, /\.dialog\[open\]/);
  assert.match(styles, /\.dialog\.is-closing/);
  assert.match(styles, /\.button:active\s*\{[^}]*scale\(\.97\)/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(app, /function closeDialog\(dialog\)/);
});

test("les modales ont une croix légère, un fond cliquable et un geste de fermeture", () => {
  assert.match(html, /class="icon-button dialog-close"/);
  assert.match(app, /class="icon-button dialog-close detail-close"/);
  assert.match(styles, /\.dialog-close\s*\{[^}]*border:\s*0;[^}]*border-radius:\s*0;[^}]*background:\s*transparent/);
  assert.match(app, /function bindSwipeToClose\(dialog\)/);
  assert.match(app, /event\.pointerType !== "touch"/);
  assert.match(app, /\.dialog-drag-handle, \.dialog-head, \.spot-detail-photo, \.spot-detail-drag-region/);
  assert.match(app, /dialog\.setPointerCapture\?\.\(pointerId\)/);
  assert.match(app, /offset >= 96/);
  assert.match(app, /const outside = event\.clientX < bounds\.left/);
  assert.match(app, /bindSwipeToClose\(dialog\)/);
  assert.match(styles, /\.dialog\.is-swipe-closing/);
  assert.match(styles, /\.dialog-drag-handle\s*\{[^}]*width:\s*96px;[^}]*height:\s*44px/);
  assert.match(styles, /\.dialog-head, \.spot-detail-photo, \.spot-detail-drag-region\s*\{[^}]*touch-action:\s*none/);
});
