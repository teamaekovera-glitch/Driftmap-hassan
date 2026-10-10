"use client";

/**
 * MemoryMap — Remember mode's map: the same journey with the veil lifted.
 * Revealed stops wear photo thumbnails when the browser supplies object URLs
 * for them, amber pins otherwise; the route draws in journey order. Falls
 * back to the (unveiled) schematic on tile failure, same as FogMap.
 */
import "maplibre-gl/dist/maplibre-gl.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MapCanvasOverlay } from "./map-canvas-overlay";
import { SchematicMap } from "./schematic-map";
import { useTileMap } from "./use-tile-map";
import { metersToPixels, placesForFogState } from "@/lib/map-geometry";
import { paintMemoryOverlay } from "@/lib/map-painters";
import type { FogState } from "@/lib/fog";
import type { City, Place } from "@/lib/types";

export interface MemoryMapProps {
  city: City;
  fogState: FogState;
  places: Place[];
  /**
   * Photo object URLs, parallel to `fogState.revealed` (derive the order
   * with orderMemoriesForJourney). The Remember workstream creates and
   * revokes these URLs; absent or not-yet-loaded photos degrade to pins.
   */
  photoUrls?: (string | undefined)[];
  className?: string;
}

export function MemoryMap({
  city,
  fogState,
  places,
  photoUrls,
  className = "",
}: MemoryMapProps) {
  const { containerRef, mapRef, mode, retry } = useTileMap({ city });

  const revealedPlaces = useMemo(
    () => placesForFogState(fogState, places),
    [fogState, places],
  );

  // Loaded HTMLImageElements parallel to the revealed stops; `loaded` bumps
  // when an image finishes decoding so the next frame repaints with it.
  const imagesRef = useRef<(HTMLImageElement | null)[]>([]);
  const [, setLoaded] = useState(0);

  const photoKey = (photoUrls ?? []).map((url) => url ?? "").join("|");
  useEffect(() => {
    if (!photoUrls) {
      imagesRef.current = [];
      return;
    }
    let cancelled = false;
    imagesRef.current = photoUrls.map((url) => {
      if (!url) return null;
      const image = new Image();
      image.onload = () => {
        if (!cancelled) setLoaded((tick) => tick + 1);
      };
      image.src = url;
      return image;
    });
    return () => {
      cancelled = true;
    };
    // photoKey summarizes the array; the array is only read inside.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photoKey]);

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
      paintMemoryOverlay(
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
        imagesRef.current,
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
        veiled={false}
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
