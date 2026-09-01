import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const project = join(dirname(fileURLToPath(import.meta.url)), "..");
const output = join(project, "dist");
const files = [
  "index.html", "styles.css", "app.js", "scoring.js", "importers.js", "catalog.js", "share-target.js",
  "forecast.js", "worker-store.js", "sw.js", "manifest.webmanifest", "icon.svg",
  "assets/icon-192.png", "assets/icon-512.png", "assets/design/header-ambient.png", "assets/design/brand-mark.png",
  "vendor/leaflet/leaflet.js", "vendor/leaflet/leaflet.css", "vendor/leaflet/LICENSE",
  "vendor/leaflet/images/marker-icon.png", "vendor/leaflet/images/marker-icon-2x.png",
  "vendor/leaflet/images/marker-shadow.png", "vendor/phosphor/style.css",
  "vendor/phosphor/Phosphor.woff2", "vendor/phosphor/LICENSE"
];

await mkdir(output, { recursive: true });
for (const relative of files) {
  const destination = join(output, relative);
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(join(project, relative), destination);
}
await writeFile(join(output, ".nojekyll"), "", "utf8");
console.log(`Version statique prête : ${output}`);
