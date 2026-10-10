"use client";

/**
 * MapLibre lifecycle + tile health. Creates the Positron-styled map inside a
 * container ref, watches it for failure (error event or the spec's ~6s load
 * budget), and reports the mode through the pure state machine in lib/map-mode.
 * A mode flip to `schematic` destroys the map; retry rebuilds it fresh.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import { nextMapMode, TILE_LOAD_TIMEOUT_MS, type MapMode } from "@/lib/map-mode";
import type { City } from "@/lib/types";

/** OpenFreeMap's public instance — free, keyless, no SLA (build spec). */
export const OPENFREEMAP_POSITRON_STYLE =
  "https://tiles.openfreemap.org/styles/positron";

/**
 * Same-origin copy of MapLibre's module worker, generated on install by
 * scripts/copy-maplibre-worker.mjs. MapLibre's own import.meta.url worker
 * resolution breaks under bundlers; setWorkerUrl() points it here instead.
 */
export const MAPLIBRE_WORKER_URL = "/maplibre/maplibre-gl-worker.mjs";

export interface TileMapHandle {
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** The live map while mode is "tiles" — null before creation and after. */
  mapRef: React.RefObject<MapLibreMap | null>;
  mode: MapMode;
  /**
   * True once the style has loaded in the current attempt — camera work
   * (flyTo/fitBounds) is safe only after this. Reset on retry and teardown.
   */
  loaded: boolean;
  /** Re-attempt the tiles from scratch (fresh map, fresh timeout). */
  retry: () => void;
}

export function useTileMap({ city }: { city: City }): TileMapHandle {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [mode, setMode] = useState<MapMode>("tiles");
  const [loaded, setLoaded] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const retry = useCallback(() => {
    mapRef.current = null;
    setLoaded(false);
    setMode("tiles");
    setAttempt((current) => current + 1);
  }, []);

  useEffect(() => {
    if (mode !== "tiles") return;

    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    void (async () => {
      // Imported inside the effect: maplibre-gl touches browser globals at
      // import time and must never evaluate during SSR.
      // v6 exposes named exports — no default export to lean on.
      const maplibre = await import("maplibre-gl");
      if (cancelled || !containerRef.current) return;

      // Before any Map exists: the worker must come from our same-origin copy.
      maplibre.setWorkerUrl(MAPLIBRE_WORKER_URL);

      // Errors before a successful load (style, worker, network) mean the
      // tiles are not coming up — fall back. Post-load tile hiccups recover
      // on their own; flipping the whole game to schematic for those would
      // be worse than a dark tile.
      let loaded = false;

      const map = new maplibre.Map({
        container: containerRef.current,
        style: OPENFREEMAP_POSITRON_STYLE,
        center: city.center,
        zoom: city.zoom,
        attributionControl: { compact: false },
      });
      mapRef.current = map;

      map.on("error", () => {
        if (cancelled || loaded) return;
        setMode((current) => nextMapMode(current, "tile-failed"));
      });

      timeoutId = setTimeout(() => {
        if (!cancelled) setMode((current) => nextMapMode(current, "load-timeout"));
      }, TILE_LOAD_TIMEOUT_MS);

      map.once("load", () => {
        loaded = true;
        if (cancelled) return;
        if (timeoutId) clearTimeout(timeoutId);
        setLoaded(true);
        setMode((current) => nextMapMode(current, "loaded"));
      });
    })().catch((error) => {
      // Dynamic import or construction failed — the tiles are not coming up.
      console.error("driftmap: tile map unavailable", error);
      if (!cancelled) setMode((current) => nextMapMode(current, "tile-failed"));
    });

    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
      setLoaded(false);
      const map = mapRef.current;
      mapRef.current = null;
      map?.remove();
    };
  }, [city, mode, attempt]);

  return { containerRef, mapRef, mode, loaded, retry };
}

/** Live readable of the prefers-reduced-motion media query. */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(query.matches);
    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return reduced;
}
