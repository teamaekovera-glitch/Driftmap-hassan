/**
 * Pure geometry for the map renderers — the one place that knows how meters,
 * pixels, and dataset coordinates relate. No React, no MapLibre import: safe
 * for unit tests and for the schematic renderer, which must work when the
 * map library cannot.
 */

import type { FogState } from "./fog";
import type { Place } from "./types";

/** Web-Mercator earth circumference at the equator, in meters. */
const EARTH_CIRCUMFERENCE_M = 40_075_016.686;

/** MapLibre renders 512px tiles — the world is 512 · 2^zoom px wide. */
const TILE_SIZE_PX = 512;

/** Meters of latitude per degree, the spherical constant for small scales. */
const METERS_PER_DEGREE = 111_320;

/**
 * Convert a ground distance in meters to screen pixels on the live map at the
 * given latitude and zoom. Uses the same per-latitude Mercator scale
 * MapLibre's own scale control uses, so fog holes and the obscured circle
 * match the world they are drawn over.
 */
export function metersToPixels(
  meters: number,
  latitude: number,
  zoom: number,
): number {
  const metersPerPixel =
    (EARTH_CIRCUMFERENCE_M * Math.cos((latitude * Math.PI) / 180)) /
    (TILE_SIZE_PX * 2 ** zoom);
  return meters / metersPerPixel;
}

/**
 * A simple equirectangular projection with a standard parallel — good enough
 * for a city-scale schematic, exact for nothing, honest about both. The cos
 * correction shrinks longitude so distances keep their shape; because of it,
 * one meter maps to the same pixel length in both axes.
 */
export interface SchematicProjection {
  /** Project a [lon, lat] pair into the SVG viewBox's pixel space. */
  project: (coords: [number, number]) => [number, number];
  /** Ground meters → schematic pixels, binding the shared painter interface. */
  metersToPixels: (meters: number) => number;
}

/**
 * Build a projection fitting the given coordinates into width × height with
 * `padding` px of breathing room. Deterministic: same inputs, same viewport,
 * so the schematic renders identically on every machine.
 */
export function schematicProjection(
  coords: [number, number][],
  width: number,
  height: number,
  padding = 40,
): SchematicProjection {
  const usable: [number, number][] = coords.length > 0 ? coords : [[0, 0]];
  const lats = usable.map(([, lat]) => lat);
  const centerLat = (Math.min(...lats) + Math.max(...lats)) / 2;
  const lonScale = Math.cos((centerLat * Math.PI) / 180);

  const xs = usable.map(([lon]) => lon * lonScale);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...lats);
  const maxY = Math.max(...lats);

  const drawW = Math.max(width - padding * 2, 1);
  const drawH = Math.max(height - padding * 2, 1);
  const spanX = Math.max(maxX - minX, 1e-6);
  const spanY = Math.max(maxY - minY, 1e-6);
  const scale = Math.min(drawW / spanX, drawH / spanY);

  const midX = (minX + maxX) / 2;
  const midY = (minY + maxY) / 2;

  return {
    project: ([lon, lat]) => [
      width / 2 + (lon * lonScale - midX) * scale,
      height / 2 - (lat - midY) * scale,
    ],
    metersToPixels: (meters) => (meters / METERS_PER_DEGREE) * scale,
  };
}

/**
 * Places behind a fog state's revealed stops, in reveal order — joins by the
 * exact coords the engine wrote into the state (places are the source of
 * those coords, so equality is safe). Stops pointing at unknown places are
 * skipped; two places sharing coords would both surface, in dataset order.
 */
export function placesForFogState(
  fogState: FogState,
  places: Place[],
): Place[] {
  const byCoords = new Map<string, Place>();
  for (const place of places) {
    byCoords.set(`${place.coords[0]},${place.coords[1]}`, place);
  }
  const found: Place[] = [];
  for (const stop of fogState.revealed) {
    const place = byCoords.get(`${stop.coords[0]},${stop.coords[1]}`);
    if (place) found.push(place);
  }
  return found;
}
