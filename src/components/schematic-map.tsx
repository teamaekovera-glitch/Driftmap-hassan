/**
 * SchematicMap — the schematic fallback renderer. A bundled SVG projection of
 * the same dataset coordinates and the same derived FogState the live map
 * shows, on a quiet graticule. It needs no network and no map library, so
 * gameplay survives tile loss unchanged (build spec: the schematic is P0).
 *
 * With an `onRetry` prop it is acting as the tiles fallback: a visible
 * notice and a retry control appear. OpenStreetMap/OpenMapTiles/OpenFreeMap
 * attribution stays visible in this mode too.
 */
import { useMemo } from "react";
import { placesForFogState, schematicProjection } from "@/lib/map-geometry";
import type { FogState } from "@/lib/fog";
import type { City, Place } from "@/lib/types";

const VIEWBOX_WIDTH = 1000;
const VIEWBOX_HEIGHT = 700;

export interface SchematicMapProps {
  city: City;
  fogState: FogState;
  places: Place[];
  /** Present = serving as the tiles fallback: show the notice + retry. */
  onRetry?: () => void;
  /** Remember mode lifts the veil — markers and routes only. */
  veiled?: boolean;
  className?: string;
}

export function SchematicMap({
  city,
  fogState,
  places,
  onRetry,
  veiled = true,
  className = "",
}: SchematicMapProps) {
  const revealedPlaces = useMemo(
    () => placesForFogState(fogState, places),
    [fogState, places],
  );

  const { project, metersToPixels, graticule } = useMemo(() => {
    const allCoords: [number, number][] = [
      city.center,
      ...fogState.revealed.map((stop) => stop.coords),
      ...(fogState.activeTarget ? [fogState.activeTarget.coords] : []),
      ...fogState.routes.flat(),
    ];
    const projection = schematicProjection(allCoords, VIEWBOX_WIDTH, VIEWBOX_HEIGHT);
    // A quiet graticule: five divisions each way across the data extent.
    const lons = allCoords.map(([lon]) => lon);
    const lats = allCoords.map(([, lat]) => lat);
    const lines: { x1: number; y1: number; x2: number; y2: number }[] = [];
    for (let i = 1; i <= 5; i++) {
      const lon = Math.min(...lons) + ((Math.max(...lons) - Math.min(...lons)) * i) / 6;
      const lat = Math.min(...lats) + ((Math.max(...lats) - Math.min(...lats)) * i) / 6;
      const [gx] = projection.project([lon, city.center[1]]);
      const [, gy] = projection.project([city.center[0], lat]);
      lines.push({ x1: gx, y1: 0, x2: gx, y2: VIEWBOX_HEIGHT });
      lines.push({ x1: 0, y1: gy, x2: VIEWBOX_WIDTH, y2: gy });
    }
    return { ...projection, graticule: lines };
  }, [city, fogState]);

  const target = fogState.activeTarget;
  const targetRadius = target ? Math.max(metersToPixels(target.radiusMeters), 12) : 0;

  return (
    <div className={`relative overflow-hidden bg-ink ${className}`}>
      <svg
        viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
        preserveAspectRatio="xMidYMid meet"
        className="h-full w-full"
        role="img"
        aria-label="Schematic map of your journey"
      >
        <defs>
          <radialGradient id="driftmap-fog-hole">
            <stop offset="0%" stopColor="#000" />
            <stop offset="72%" stopColor="#000" />
            <stop offset="100%" stopColor="#fff" />
          </radialGradient>
          <mask id="driftmap-fog-mask">
            <rect x="0" y="0" width={VIEWBOX_WIDTH} height={VIEWBOX_HEIGHT} fill="#fff" />
            {veiled &&
              fogState.revealed.map((stop, index) => {
                const [x, y] = project(stop.coords);
                const r = Math.max(metersToPixels(stop.radiusMeters), 12);
                return (
                  <circle
                    key={`hole-${index}`}
                    cx={x}
                    cy={y}
                    r={r}
                    fill="url(#driftmap-fog-hole)"
                  />
                );
              })}
          </mask>
        </defs>

        {/* Quiet graticule over charcoal. */}
        {graticule.map((line, index) => (
          <line
            key={`graticule-${index}`}
            {...line}
            stroke="var(--color-line)"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
        ))}

        {/* The veil, holed where discoveries happened. */}
        {veiled ? (
          <rect
            x="0"
            y="0"
            width={VIEWBOX_WIDTH}
            height={VIEWBOX_HEIGHT}
            fill="rgba(15, 14, 12, 0.72)"
            mask="url(#driftmap-fog-mask)"
          />
        ) : null}

        {/* Route lines draw themselves in journey order. */}
        {fogState.routes.map((route, index) => (
          <polyline
            key={`route-${index}`}
            points={route
              .map((coords) => {
                const [x, y] = project(coords);
                return `${x},${y}`;
              })
              .join(" ")}
            fill="none"
            stroke="var(--color-accent)"
            strokeOpacity="0.9"
            strokeWidth="2.5"
            strokeDasharray="6 8"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        ))}

        {/* Revealed stops: amber discovery dots, named. */}
        {revealedPlaces.map((place) => {
          const [x, y] = project(place.coords);
          return (
            <g key={`stop-${place.id}`}>
              <circle cx={x} cy={y} r="9" fill="var(--color-accent)" fillOpacity="0.35" />
              <circle
                cx={x}
                cy={y}
                r="5"
                fill="var(--color-accent)"
                stroke="var(--color-ink)"
                strokeWidth="2"
                vectorEffect="non-scaling-stroke"
              />
              <text
                x={x + 12}
                y={y + 4}
                fill="var(--color-ivory)"
                fontSize="16"
                fontWeight="600"
                paintOrder="stroke"
                stroke="rgba(15, 14, 12, 0.9)"
                strokeWidth="3"
                vectorEffect="non-scaling-stroke"
              >
                {place.name}
              </text>
            </g>
          );
        })}

        {/* The obscured target: hairline radius plus a pulsing dashed ring. */}
        {target ? (
          (() => {
            const [x, y] = project(target.coords);
            return (
              <g>
                <circle
                  cx={x}
                  cy={y}
                  r={targetRadius}
                  fill="var(--color-accent)"
                  fillOpacity="0.07"
                />
                <circle
                  cx={x}
                  cy={y}
                  r={targetRadius}
                  fill="none"
                  stroke="var(--color-accent)"
                  strokeOpacity="0.3"
                  strokeWidth="1"
                  vectorEffect="non-scaling-stroke"
                />
                <circle
                  className="map-pulse"
                  style={{ transformBox: "view-box", transformOrigin: `${x}px ${y}px` }}
                  cx={x}
                  cy={y}
                  r={targetRadius * 1.08}
                  fill="none"
                  stroke="var(--color-accent)"
                  strokeOpacity="0.85"
                  strokeWidth="2"
                  strokeDasharray="4 6"
                  vectorEffect="non-scaling-stroke"
                />
              </g>
            );
          })()
        ) : null}
      </svg>

      {onRetry ? (
        <div
          role="status"
          aria-live="polite"
          className="absolute top-3 left-1/2 flex -translate-x-1/2 items-center gap-3 border border-line bg-ink-raised/95 px-4 py-2 text-xs text-muted"
        >
          <span>Map tiles unavailable — playing the schematic map.</span>
          <button
            type="button"
            onClick={onRetry}
            className="border border-line px-2 py-1 text-ivory transition-colors hover:border-accent hover:text-accent"
          >
            Retry tiles
          </button>
        </div>
      ) : null}

      <p className="absolute right-2 bottom-1 text-[10px] text-muted">
        © OpenStreetMap · © OpenMapTiles · OpenFreeMap
      </p>
    </div>
  );
}
