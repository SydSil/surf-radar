import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const projectFile = (name) => new URL(`../${name}`, import.meta.url);

test("le manifeste décrit une PWA Android installable", async () => {
  const manifest = JSON.parse(await readFile(projectFile("manifest.webmanifest"), "utf8"));
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.lang, "fr");
  assert.ok(manifest.icons.some((icon) => icon.sizes === "192x192"));
  assert.ok(manifest.icons.some((icon) => icon.sizes === "512x512"));
  assert.equal(manifest.share_target.action, "./?share=spot");
  assert.equal(manifest.share_target.method, "GET");
  assert.deepEqual(manifest.share_target.params, { title: "title", text: "text", url: "url" });
});

test("le bouton Installer n’est pas masqué par le breakpoint Android", async () => {
  const css = await readFile(projectFile("styles.css"), "utf8");
  const mobile = css.slice(css.indexOf("@media (max-width: 620px)"));
  assert.doesNotMatch(mobile, /#install-button\s*\{[^}]*display:\s*none/);
  assert.doesNotMatch(mobile, /#install-button[^\n{]*\{?[^}]*display:\s*none/);
});

test("le service worker module embarque le calcul et le stockage quotidien", async () => {
  const app = await readFile(projectFile("app.js"), "utf8");
  const worker = await readFile(projectFile("sw.js"), "utf8");
  assert.match(app, /register\("\.\/sw\.js", \{ type: "module" \}\)/);
  assert.match(worker, /periodicsync/);
  assert.match(worker, /evaluateStateForecast/);
  assert.match(worker, /worker-store\.js/);
});
