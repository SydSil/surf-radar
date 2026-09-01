import test from "node:test";
import assert from "node:assert/strict";
import { SPOT_CATALOG } from "../catalog.js";
import { matchCatalogSpot, parseShareTarget } from "../share-target.js";

test("le partage Android extrait le nom et le lien Google Maps", () => {
  const shared = parseShareTarget("?share=spot&title=&text=Vluchtenburg%20Beach%0Ahttps%3A%2F%2Fmaps.app.goo.gl%2Fexemple&url=");
  assert.equal(shared.name, "Vluchtenburg Beach");
  assert.equal(shared.googleMapsUrl, "https://maps.app.goo.gl/exemple");
  assert.equal(shared.isList, false);
});

test("un lien long partagé fournit directement les coordonnées", () => {
  const url = "https://www.google.com/maps/place/Siouville/data=!3d49.5709348!4d-1.8431215";
  const shared = parseShareTarget(`?share=spot&title=Siouville-Hague&url=${encodeURIComponent(url)}`);
  assert.deepEqual(shared.coordinates, { lat: 49.5709348, lon: -1.8431215 });
});

test("le spot partagé retrouve son préréglage prudent dans le catalogue", () => {
  const shared = parseShareTarget("?share=spot&text=Plage%20de%20Wissant%0Ahttps%3A%2F%2Fmaps.app.goo.gl%2Fexemple");
  assert.equal(matchCatalogSpot(shared, SPOT_CATALOG)?.catalogId, "wissant");
});

test("la liste SPOT SURF n’est pas confondue avec un seul spot", () => {
  const shared = parseShareTarget("?share=spot&title=SPOT%20SURF&text=24%20lieux%20%C2%B7%20Liste%20partag%C3%A9e&url=https%3A%2F%2Fmaps.app.goo.gl%2Fexemple");
  assert.equal(shared.isList, true);
});

test("une navigation normale n’est pas traitée comme un partage", () => {
  assert.equal(parseShareTarget("?foo=bar"), null);
});
