"use client";

/**
 * ReplayStage — the screen the film plays on. A live map (MapLibre over
 * Positron, the same tiles the game uses) flies from stop to stop as the
 * scenes advance, while a canvas overlay draws the journey in journey order:
 * dashed legs for completed hops, a bright solid leg for the one being
 * travelled, a pulsing spotlight on the stop on stage.
 *
 * The overlays are DOM, not canvas: the photo card, clue, caption, and the
 * finale summary must stay readable at every size — captions always are,
 * even with narration muted or missing. Tiles are a progressive enhancement:
 * on failure the same backdrop state renders on the schematic map (with its
 * own notice and retry), exactly like the game. Reduced motion replaces
 * camera flights with cuts and lets the caption fade carry the transitions.
 */
import { useEffect, useMemo } from "react";
import { MapCanvasOverlay } from "./map-canvas-overlay";
import { SchematicMap } from "./schematic-map";
import { useTileMap, usePrefersReducedMotion } from "./use-tile-map";
import { REVEAL_RADIUS_METERS } from "@/lib/fog";
import { metersToPixels } from "@/lib/map-geometry";
import { paintReplayOverlay } from "@/lib/map-painters";
import { replayBackdrop, type ReplayScene, type ReplayStatus } from "@/lib/replay";
import type { City } from "@/lib/types";

/** Zoom the camera settles on when a stop takes the stage. */
const STOP_FOCUS_ZOOM = 14;

const FLIGHT_MS = { title: 2_400, stop: 2_400, route: 2_200, finale: 2_200 };

export interface ReplayStageProps {
  city: City;
  scenes: ReplayScene[];
  sceneIndex: number;
  status: ReplayStatus;
  /** Photo object URLs by memory id — the run's own photography. */
  photoUrls: Map<string, string>;
  photosLoading: boolean;
  isDemo: boolean;
  /**
   * Live 0..1 progress through the current scene, written by the player's
   * clock. Read every animation frame by the canvas painter (no re-renders).
   */
  progressRef: React.RefObject<number>;
}

function formatDateLabel(epochMs: number): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "long" }).format(epochMs);
}

export function ReplayStage({
  city,
  scenes,
  sceneIndex,
  status,
  photoUrls,
  photosLoading,
  isDemo,
  progressRef,
}: ReplayStageProps) {
  const { containerRef, mapRef, mode, loaded, retry } = useTileMap({ city });
  const reducedMotion = usePrefersReducedMotion();

  const scene = scenes[sceneIndex] ?? null;

  // The film draws the journey in journey order — backdrop derived from the
  // playhead, never stored. (legProgress arrives live through the ref.)
  const backdrop = useMemo(
    () => replayBackdrop(scenes, sceneIndex, progressRef.current, []),
    [scenes, sceneIndex, progressRef],
  );

  // Camera work: fly to the stop on stage, frame the leg being travelled,
  // fit the whole route for the finale. A failed/absent map simply skips it.
  useEffect(() => {
    const map = mapRef.current;
    if (mode !== "tiles" || !loaded || !map || !scene) return;
    const duration = reducedMotion ? 0 : FLIGHT_MS[scene.kind];

    switch (scene.kind) {
      case "title":
        map.flyTo({ center: city.center, zoom: city.zoom, duration });
        break;
      case "stop":
        map.flyTo({ center: scene.coords, zoom: STOP_FOCUS_ZOOM, duration });
        break;
      case "route":
        // Framing both ends of the leg; maxZoom keeps short hops readable.
        map.fitBounds([scene.from, scene.to], {
          padding: 72,
          maxZoom: STOP_FOCUS_ZOOM - 0.5,
          duration,
        });
        break;
      case "finale": {
        const stops = scenes
          .filter((s): s is Extract<ReplayScene, { kind: "stop" }> => s.kind === "stop")
          .map((s) => s.coords);
        if (stops.length === 0) {
          map.flyTo({ center: city.center, zoom: city.zoom, duration });
        } else if (stops.length === 1) {
          map.flyTo({ center: stops[0], zoom: city.zoom, duration });
        } else {
          const lons = stops.map(([lon]) => lon);
          const lats = stops.map(([, lat]) => lat);
          map.fitBounds(
            [
              [Math.min(...lons), Math.min(...lats)],
              [Math.max(...lons), Math.max(...lats)],
            ],
            { padding: 90, duration },
          );
        }
        break;
      }
    }
  }, [mode, loaded, mapRef, scene, scenes, city, reducedMotion]);

  const paint = useMemo(() => {
    return (
      ctx: CanvasRenderingContext2D,
      size: { width: number; height: number },
      timeMs: number,
      reducedMotionFrame: boolean,
    ) => {
      const map = mapRef.current;
      if (!map) return;
      const center = map.getCenter();
      const zoom = map.getZoom();
      paintReplayOverlay(
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
          reducedMotion: reducedMotionFrame,
        },
        {
          ...backdrop,
          legProgress: reducedMotionFrame ? 1 : (progressRef.current ?? 0),
        },
      );
    };
  }, [backdrop, mapRef, progressRef]);

  if (!scene) return null;

  const dimmed = scene.kind === "title" || scene.kind === "finale" || status === "idle";
  const stopCount = scenes.filter((s) => s.kind === "stop").length;
  // scenes[0] is the title by construction; the finale borrows its city name.
  const [firstScene] = scenes;
  const cityName = firstScene?.kind === "title" ? firstScene.cityName : city.name;

  return (
    <div
      className="replay-stage relative h-[440px] w-full overflow-hidden border border-line bg-ink sm:h-[560px]"
      data-status={status}
      role="group"
      aria-label="Journey replay stage"
    >
      {mode === "schematic" ? (
        <SchematicMap
          city={city}
          fogState={{
            revealed: backdrop.stops.map((stop) => ({
              coords: stop.coords,
              radiusMeters: REVEAL_RADIUS_METERS,
            })),
            routes: backdrop.routes,
            activeTarget: null,
          }}
          places={[]}
          onRetry={retry}
          veiled={false}
          className="h-full w-full"
        />
      ) : (
        <>
          <div ref={containerRef} className="absolute inset-0" />
          <MapCanvasOverlay paint={paint} />
        </>
      )}

      {/* Readability scrim under the title and finale cards. */}
      {dimmed ? <div className="pointer-events-none absolute inset-0 z-[2] bg-ink/70" /> : null}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[2] h-28 bg-gradient-to-t from-ink/85 to-transparent" />

      <div key={sceneIndex} className="replay-fade-anim pointer-events-none absolute inset-0 z-[3]">
        {scene.kind === "title" ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
            <p className="text-xs uppercase tracking-[0.3em] text-muted">
              {isDemo ? "Demo journey" : "A journey, replayed"}
            </p>
            <h2 className="font-display text-4xl text-ivory sm:text-5xl">{scene.cityName}</h2>
            <p className="text-sm text-muted">
              {formatDateLabel(scene.startedAt)}
              {stopCount > 0
                ? ` · ${stopCount} ${stopCount === 1 ? "stop" : "stops"} on the run`
                : " · no stops yet"}
            </p>
          </div>
        ) : null}

        {scene.kind === "stop" ? (
          <div className="replay-anim absolute bottom-5 left-5 w-[min(20rem,calc(100%-2.5rem))] border border-line bg-ink-raised/95 shadow-lg backdrop-blur-sm">
            <div className="overflow-hidden">
              {photoUrls.get(scene.memoryId) ? (
                /* Blob object URLs — next/image cannot optimise these. */
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={photoUrls.get(scene.memoryId)}
                  alt={`Photograph taken at ${backdrop.currentStop?.name ?? "a discovered place"}`}
                  className="replay-photo-anim aspect-[4/3] w-full object-cover"
                />
              ) : (
                <div className="flex aspect-[4/3] w-full items-center justify-center bg-ink text-xs text-muted">
                  {photosLoading ? "Developing the photograph…" : "Photograph not available"}
                </div>
              )}
            </div>
            <div className="p-4">
              <p className="text-[11px] uppercase tracking-[0.2em] text-accent">{scene.timeLabel}</p>
              {backdrop.currentStop?.name ? (
                <h3 className="mt-1 font-display text-xl text-ivory">{backdrop.currentStop.name}</h3>
              ) : null}
              <p className="mt-2 text-sm leading-relaxed text-ivory">{scene.caption}</p>
              <p className="mt-2 text-xs italic leading-relaxed text-muted">
                Found with the clue: “{scene.clue}”
              </p>
            </div>
          </div>
        ) : null}

        {scene.kind === "route" ? (
          <div className="absolute bottom-5 left-5 border border-line bg-ink-raised/95 px-4 py-2 text-xs uppercase tracking-[0.25em] text-muted">
            En route
          </div>
        ) : null}

        {scene.kind === "finale" ? (
          <div className="flex h-full items-center justify-center px-6">
            <div className="border border-line bg-ink-raised/95 px-8 py-7 text-center backdrop-blur-sm">
              <p className="text-xs uppercase tracking-[0.3em] text-muted">The run, remembered</p>
              <h2 className="mt-2 font-display text-3xl text-ivory">{cityName}</h2>
              <dl className="mt-5 flex items-start justify-center gap-8 text-sm">
                <div>
                  <dt className="text-xs uppercase tracking-[0.2em] text-muted">Stops</dt>
                  <dd className="mt-1 font-display text-2xl text-accent">{scene.stopCount}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-[0.2em] text-muted">Distance</dt>
                  <dd className="mt-1 font-display text-2xl text-accent">{scene.totalDistanceKm} km</dd>
                </div>
                {scene.durationLabel ? (
                  <div>
                    <dt className="text-xs uppercase tracking-[0.2em] text-muted">Time</dt>
                    <dd className="mt-1 font-display text-2xl text-accent">{scene.durationLabel}</dd>
                  </div>
                ) : null}
              </dl>
              <p className="mt-5 text-xs text-muted">
                {isDemo
                  ? "This was the bundled demo journey — your own runs replay the same way."
                  : "Every photograph you kept is in this film."}
              </p>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
