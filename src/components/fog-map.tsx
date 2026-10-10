"use client";

/**
 * FogMap — the Explore experience's map. MapLibre GL JS over OpenFreeMap's
 * Positron style (free, keyless) with a DPR-aware canvas overlay painting the
 * derived FogState: soft radial holes over revealed stops, dashed amber route
 * lines, and a pulsing obscured circle for the active target.
 *
 * Tiles are a progressive enhancement, never a dependency: an error event or
 * the spec's ~6s load budget swaps the live map for the SchematicMap — same
 * fog state, visible notice, one-tap retry. Attribution stays visible in both
 * modes (the Positron TileJSON carries it; the schematic prints its own).
 */
import "maplibre-gl/dist/maplibre-gl.css";
import { useCallback, useMemo } from "react";
import { MapCanvasOverlay } from "./map-canvas-overlay";
import { SchematicMap } from "./schematic-map";
import { useTileMap } from "./use-tile-map";
import { metersToPixels, placesForFogState } from "@/lib/map-geometry";
import { paintFogOverlay } from "@/lib/map-painters";
import type { FogState } from "@/lib/fog";
import type { City, Place } from "@/lib/types";

export interface FogMapProps {
  city: City;
  fogState: FogState;
  /** Bundled dataset — names the revealed stops, on both renderers. */
  places: Place[];
  className?: string;
}

export function FogMap({ city, fogState, places, className = "" }: FogMapProps) {
  const { containerRef, mapRef, mode, retry } = useTileMap({ city });

  const revealedPlaces = useMemo(
    () => placesForFogState(fogState, places),
    [fogState, places],
  );

  const paint = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      size: { width: number; height: number },
      timeMs: number,
      reducedMotion: boolean,
    ) => {
      const map = mapRef.current;
      if (!map) return;
      const center = map.getCenter();
      const zoom = map.getZoom();
      paintFogOverlay(
        ctx,
        {
          width: size.width,
          height: size.height,
          project: ([lon, lat]) => {
            const point = map.project([lon, lat]);
            return [point.x, point.y];
          },
          metersToPixels: (m) => metersToPixels(m, center.lat, zoom),
          timeMs,
          reducedMotion,
        },
        fogState,
        revealedPlaces.map((place) => place.name),
      );
    },
    [fogState, mapRef, revealedPlaces],
  );

  if (mode === "schematic") {
    return (
      <SchematicMap
        city={city}
        fogState={fogState}
        places={places}
        onRetry={retry}
        className={className}
      />
    );
  }

  return (
    <div ref={containerRef} className={`relative overflow-hidden ${className}`}>
      <MapCanvasOverlay paint={paint} />
    </div>
  );
}
