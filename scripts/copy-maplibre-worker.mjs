#!/usr/bin/env node
/**
 * Copies MapLibre's module worker into public/ so it is served same-origin.
 *
 * MapLibre 6 resolves its worker file relative to the bundler chunk
 * (import.meta.url), which webpack rewrites — the worker request then 404s
 * and every map fails into the schematic fallback. use-tile-map calls
 * setWorkerUrl() to point the library at this copy instead. Generated on
 * install (postinstall) so the worker always matches the installed
 * maplibre-gl version; public/maplibre is gitignored.
 */
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const distDir = path.join(
  path.dirname(require.resolve("maplibre-gl/package.json")),
  "dist",
);
const targetDir = path.join(process.cwd(), "public", "maplibre");

mkdirSync(targetDir, { recursive: true });
copyFileSync(
  path.join(distDir, "maplibre-gl-worker.mjs"),
  path.join(targetDir, "maplibre-gl-worker.mjs"),
);
console.log("driftmap: copied maplibre-gl worker -> public/maplibre/");
