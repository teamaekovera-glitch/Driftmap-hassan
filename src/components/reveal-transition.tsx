"use client";

/**
 * RevealTransition — the discovery moment. The fog hole opens, the place is
 * finally named, the verification chip says what the record actually claims,
 * and the next mission (or the journey's end) is announced. Skippable with
 * Escape or the Continue button; reduced-motion players get an instant,
 * still-fade-free appearance.
 */

import { useEffect, useRef, useState } from "react";
import { Button } from "./button";
import { Chip } from "./chip";
import type { MemoryRecord, Mission, Place } from "@/lib/types";

export interface RevealTransitionProps {
  place: Place;
  mission: Mission;
  memory: MemoryRecord;
  /** Object URL for the confirmed photo, when available. */
  photoUrl?: string;
  /** True when this was the run's final mission. */
  isFinal: boolean;
  onContinue: () => void;
}

export function RevealTransition({
  place,
  mission,
  memory,
  photoUrl,
  isFinal,
  onContinue,
}: RevealTransitionProps) {
  const [shown, setShown] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  // Two-frame mount so the entrance transition can run; reduced motion shows
  // the end state immediately (transition-none), which this achieves too.
  useEffect(() => {
    const frame = requestAnimationFrame(() => setShown(true));
    returnFocusRef.current = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onContinue();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKeyDown);
      returnFocusRef.current?.focus();
    };
  }, [onContinue]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={`Discovered: ${place.name}`}
    >
      <div className="absolute inset-0 bg-ink/85" />
      <div
        ref={dialogRef}
        tabIndex={-1}
        aria-live="polite"
        className={`relative m-0 w-full max-w-md border border-line bg-ink-raised p-6 outline-none transition-all duration-700 ease-out motion-reduce:transition-none ${
          shown
            ? "translate-y-0 opacity-100"
            : "translate-y-6 opacity-0 motion-reduce:translate-y-0 motion-reduce:opacity-100"
        } sm:m-6`}
      >
        <p className="text-xs uppercase tracking-[0.25em] text-accent">Discovered</p>
        <h2 className="mt-2 font-display text-3xl text-ivory">{place.name}</h2>
        <div className="mt-3">
          <Chip
            label={
              memory.verification === "location-assisted"
                ? "Location-assisted"
                : "Player-confirmed"
            }
            active={memory.verification === "location-assisted"}
          />
        </div>

        {photoUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element -- local object URL, not a remote asset */
          <img
            src={photoUrl}
            alt={`Your photo of ${place.name}`}
            className="mt-4 max-h-56 w-full border border-line object-cover"
          />
        ) : null}

        <p className="mt-4 text-sm italic text-muted">{memory.caption}</p>

        <p className="mt-3 text-sm text-muted">
          {isFinal
            ? "That was the final mission — your journey is complete and the film is ready."
            : `Mission ${mission.index + 2} is unlocked. The fog opens a little more.`}
        </p>

        <div className="mt-6">
          <Button onClick={onContinue}>
            {isFinal ? "See the journey" : "Continue exploring"}
          </Button>
        </div>

        <p className="mt-3 text-xs text-muted">Press Escape to skip this moment.</p>
      </div>
    </div>
  );
}
