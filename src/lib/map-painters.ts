/**
 * Canvas painters for the map overlays — pure drawing over a 2D context.
 * Both the fog painter and the memory painter consume the same derived
 * FogState the schematic renders, so every renderer shows one truth about
 * the journey. Colors mirror the design tokens in globals.css.
 */

import type { FogState } from "./fog";

export interface PaintContext {
  /** CSS-pixel size of the canvas (the context is DPR-scaled upstream). */
  width: number;
  height: number;
  /** [lon, lat] → CSS px in canvas space. */
  project: (coords: [number, number]) => [number, number];
  /** Ground meters → CSS px at the map's current view. */
  metersToPixels: (meters: number) => number;
  timeMs: number;
  reducedMotion: boolean;
}

const ACCENT = "232, 163, 61";
const INK = "15, 14, 12";
const IVORY = "#f2ede3";

/** Never draw a zero- or sub-pixel circle — degenerate radii stay visible. */
const MIN_RADIUS_PX = 14;

export type PlaceNames = (string | undefined)[];

export function paintFogOverlay(
  ctx: CanvasRenderingContext2D,
  paint: PaintContext,
  fogState: FogState,
  placeNames: PlaceNames,
): void {
  ctx.clearRect(0, 0, paint.width, paint.height);

  // The veil: charcoal over everything the journey has not touched yet.
  ctx.fillStyle = `rgba(${INK}, 0.72)`;
  ctx.fillRect(0, 0, paint.width, paint.height);

  // Soft radial holes punch the veil where discoveries happened.
  ctx.save();
  ctx.globalCompositeOperation = "destination-out";
  for (const stop of fogState.revealed) {
    const [x, y] = paint.project(stop.coords);
    const r = Math.max(paint.metersToPixels(stop.radiusMeters), MIN_RADIUS_PX);
    const hole = ctx.createRadialGradient(x, y, r * 0.45, x, y, r);
    hole.addColorStop(0, "rgba(0, 0, 0, 1)");
    hole.addColorStop(0.72, "rgba(0, 0, 0, 1)");
    hole.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = hole;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  drawRoutes(ctx, paint, fogState.routes);

  fogState.revealed.forEach((stop, index) => {
    drawRevealedStop(ctx, paint.project(stop.coords), placeNames[index]);
  });

  if (fogState.activeTarget) {
    drawObscuredTarget(ctx, paint, fogState.activeTarget);
  }
}

/**
 * Remember mode: the same journey with the veil lifted — pins (or photo
 * thumbnails), route lines, labels; no fog, no obscured circle.
 */
export function paintMemoryOverlay(
  ctx: CanvasRenderingContext2D,
  paint: PaintContext,
  fogState: FogState,
  placeNames: PlaceNames,
  photos?: (HTMLImageElement | null)[],
): void {
  ctx.clearRect(0, 0, paint.width, paint.height);

  drawRoutes(ctx, paint, fogState.routes);

  fogState.revealed.forEach((stop, index) => {
    drawMemoryStop(
      ctx,
      paint.project(stop.coords),
      placeNames[index],
      photos?.[index] ?? null,
    );
  });
}

export interface ReplayPaintState {
  stops: { coords: [number, number]; name: string | undefined }[];
  routes: [number, number][][];
  currentLeg: { from: [number, number]; to: [number, number] } | null;
  legProgress: number;
  currentStop: { coords: [number, number]; name: string | undefined } | null;
}

/**
 * The replay stage's painter: the film draws the journey as it plays.
 * Completed legs stay dashed amber; the leg currently being travelled draws
 * itself as a bright solid line up to the playhead, with a small head dot;
 * the stop on stage gets a soft pulsing spotlight. Renders the same derived
 * backdrop the schematic fallback shows.
 */
export function paintReplayOverlay(
  ctx: CanvasRenderingContext2D,
  paint: PaintContext,
  state: ReplayPaintState,
): void {
  ctx.clearRect(0, 0, paint.width, paint.height);

  drawRoutes(ctx, paint, state.routes);

  if (state.currentLeg) {
    drawCurrentLeg(ctx, paint, state.currentLeg, state.legProgress);
  }

  for (const stop of state.stops) {
    drawRevealedStop(ctx, paint.project(stop.coords), stop.name);
  }

  if (state.currentStop) {
    drawStopSpotlight(ctx, paint, state.currentStop.coords);
  }
}

function drawRoutes(
  ctx: CanvasRenderingContext2D,
  paint: PaintContext,
  routes: [number, number][][]
): void {
  ctx.save();
  ctx.setLineDash([6, 8]);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = `rgba(${ACCENT}, 0.9)`;
  ctx.shadowColor = `rgba(${ACCENT}, 0.8)`;
  ctx.shadowBlur = 6;
  for (const route of routes) {
    if (route.length === 0) continue;
    ctx.beginPath();
    route.forEach((coords, index) => {
      const [x, y] = paint.project(coords);
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * The leg the film is currently travelling: a bright solid line drawn up to
 * the playhead's position, tipped with a head dot. Reduced motion skips the
 * draw-on animation — the whole leg simply appears.
 */
function drawCurrentLeg(
  ctx: CanvasRenderingContext2D,
  paint: PaintContext,
  leg: { from: [number, number]; to: [number, number] },
  progress: number,
): void {
  const [x1, y1] = paint.project(leg.from);
  const [x2, y2] = paint.project(leg.to);
  const t = paint.reducedMotion ? 1 : Math.min(Math.max(progress, 0), 1);
  const x = x1 + (x2 - x1) * t;
  const y = y1 + (y2 - y1) * t;

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = `rgb(${ACCENT})`;
  ctx.shadowColor = `rgba(${ACCENT}, 0.9)`;
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x, y);
  ctx.stroke();

  if (t < 1) {
    ctx.fillStyle = `rgb(${ACCENT})`;
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Soft pulsing spotlight on the stop currently on stage. */
function drawStopSpotlight(
  ctx: CanvasRenderingContext2D,
  paint: PaintContext,
  coords: [number, number],
): void {
  const [x, y] = paint.project(coords);
  const pulse = paint.reducedMotion ? 0 : Math.sin(paint.timeMs / 600) * 0.5 + 0.5;
  const r = 16 + pulse * 6;

  ctx.save();
  ctx.strokeStyle = `rgba(${ACCENT}, ${0.25 + pulse * 0.35})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawRevealedStop(
  ctx: CanvasRenderingContext2D,
  [x, y]: [number, number],
  name: string | undefined,
): void {
  ctx.save();
  // Amber halo, then the solid discovery dot — discoveries glow amber.
  ctx.fillStyle = `rgba(${ACCENT}, 0.35)`;
  ctx.beginPath();
  ctx.arc(x, y, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = `rgb(${ACCENT})`;
  ctx.strokeStyle = `rgb(${INK})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  if (name) drawLabel(ctx, x, y, name);
  ctx.restore();
}

function drawMemoryStop(
  ctx: CanvasRenderingContext2D,
  [x, y]: [number, number],
  name: string | undefined,
  photo: HTMLImageElement | null,
): void {
  ctx.save();
  const thumbRadius = 13;
  if (photo && photo.complete && photo.naturalWidth > 0) {
    // The player's own photograph marks the stop, clipped to a coin.
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, thumbRadius, 0, Math.PI * 2);
    ctx.clip();
    const side = thumbRadius * 2;
    ctx.drawImage(photo, x - thumbRadius, y - thumbRadius, side, side);
    ctx.restore();
    ctx.strokeStyle = `rgb(${ACCENT})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, thumbRadius, 0, Math.PI * 2);
    ctx.stroke();
  } else {
    ctx.fillStyle = `rgb(${ACCENT})`;
    ctx.strokeStyle = `rgb(${INK})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  if (name) drawLabel(ctx, x, y, name);
  ctx.restore();
}

function drawObscuredTarget(
  ctx: CanvasRenderingContext2D,
  paint: PaintContext,
  target: NonNullable<FogState["activeTarget"]>,
): void {
  const [x, y] = paint.project(target.coords);
  const r = Math.max(paint.metersToPixels(target.radiusMeters), MIN_RADIUS_PX);

  ctx.save();
  // Static hairline at the true radius keeps the region readable...
  ctx.strokeStyle = `rgba(${ACCENT}, 0.3)`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
  // ...the pulsing dashed ring says "something is buried here".
  const pulse = paint.reducedMotion ? 0.04 : 0.08 + 0.06 * Math.sin(paint.timeMs / 700);
  ctx.strokeStyle = `rgba(${ACCENT}, 0.85)`;
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 6]);
  ctx.beginPath();
  ctx.arc(x, y, r * (1 + pulse), 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = `rgba(${ACCENT}, 0.07)`;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawLabel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  text: string,
): void {
  ctx.font = "600 11px ui-sans-serif, system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.shadowColor = `rgba(${INK}, 0.9)`;
  ctx.shadowBlur = 4;
  ctx.fillStyle = IVORY;
  ctx.fillText(text, x + 12, y);
}
