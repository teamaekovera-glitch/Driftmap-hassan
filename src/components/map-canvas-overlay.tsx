"use client";

/**
 * DPR-aware canvas overlay driven by one requestAnimationFrame loop. The
 * paint function lives in a ref so callers can swap fog state every render
 * without tearing down the loop; the loop redraws every frame because the
 * obscured target pulses (cheap: a handful of shapes per frame).
 */
import { useEffect, useRef } from "react";

export interface MapCanvasOverlayProps {
  /**
   * Latest paint closure. Receives the 2D context pre-scaled to CSS pixels,
   * the element's CSS-pixel size, elapsed ms, and the reduced-motion flag.
   */
  paint: (
    ctx: CanvasRenderingContext2D,
    size: { width: number; height: number },
    timeMs: number,
    reducedMotion: boolean,
  ) => void;
}

export function MapCanvasOverlay({ paint }: MapCanvasOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const paintRef = useRef(paint);
  paintRef.current = paint;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    let raf = 0;
    const start = performance.now();

    const draw = (now: number) => {
      const dpr = window.devicePixelRatio || 1;
      const { clientWidth: width, clientHeight: height } = canvas;
      if (width > 0 && height > 0) {
        const targetW = Math.round(width * dpr);
        const targetH = Math.round(height * dpr);
        if (canvas.width !== targetW || canvas.height !== targetH) {
          canvas.width = targetW;
          canvas.height = targetH;
        }
        context.setTransform(dpr, 0, 0, dpr, 0, 0);
        paintRef.current(context, { width, height }, now - start, reducedMotion);
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none absolute inset-0 h-full w-full"
    />
  );
}
