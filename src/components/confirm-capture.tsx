"use client";

/**
 * ConfirmCapture — the preview-and-confirm step. Shows the photo, an optional
 * note, and the optional, explicit location toggle (off by default — the
 * toggle is the permission ask; a denial never blocks anything).
 *
 * Copy states exactly what the record will claim: `player-confirmed` when the
 * memory saves without a fix, `location-assisted` when a permitted fix lands
 * inside the mission radius. Nothing here ever claims recognition.
 */

import { useEffect, useRef, useState } from "react";
import { Button } from "./button";

export interface ConfirmCaptureDetails {
  note: string;
  coords: [number, number] | null;
}

export interface ConfirmCaptureProps {
  /** Object URL of the pending photo. */
  photoUrl: string;
  busy: boolean;
  /** Save failure message from the caller, or null. */
  error: string | null;
  onConfirm: (details: ConfirmCaptureDetails) => void;
  onRetake: () => void;
  onClose: () => void;
}

type LocationState = "off" | "locating" | "ready" | "failed";

export function ConfirmCapture({
  photoUrl,
  busy,
  error,
  onConfirm,
  onRetake,
  onClose,
}: ConfirmCaptureProps) {
  const [note, setNote] = useState("");
  const [locationState, setLocationState] = useState<LocationState>("off");
  const [coords, setCoords] = useState<[number, number] | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    returnFocusRef.current = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      returnFocusRef.current?.focus();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount/unmount only
  }, []);

  const toggleLocation = () => {
    if (locationState === "off" || locationState === "failed") {
      if (!("geolocation" in navigator)) {
        setLocationState("failed");
        return;
      }
      setLocationState("locating");
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setCoords([position.coords.longitude, position.coords.latitude]);
          setLocationState("ready");
        },
        () => {
          setCoords(null);
          setLocationState("failed");
        },
        { timeout: 10_000, maximumAge: 30_000 },
      );
      return;
    }
    // Off again — the toggle withdraws consent.
    setCoords(null);
    setLocationState("off");
  };

  const locationLine: Record<LocationState, string> = {
    off: "Off — this memory saves as player-confirmed: your word that you found it.",
    locating: "Finding you…",
    ready: "Location found — this memory saves as location-assisted.",
    failed:
      "Location unavailable — the memory will save as player-confirmed. Nothing is blocked.",
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Confirm this capture"
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        disabled={busy}
        className="absolute inset-0 cursor-default bg-ink/80 disabled:cursor-not-allowed"
      />
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="relative m-0 w-full max-w-md border border-line bg-ink-raised p-6 outline-none sm:m-6"
      >
        <h2 className="font-display text-2xl text-ivory">Confirm this capture</h2>

        {/* eslint-disable-next-line @next/next/no-img-element -- local object URL, not a remote asset */}
        <img
          src={photoUrl}
          alt="Photo you just took, unconfirmed"
          className="mt-4 max-h-64 w-full border border-line object-cover"
        />

        {error ? (
          <p role="alert" className="mt-4 border border-line bg-ink px-3 py-2 text-sm text-ivory">
            {error}
          </p>
        ) : null}

        <div className="mt-4">
          <label htmlFor="memory-note" className="text-xs uppercase tracking-[0.2em] text-muted">
            A note for this memory (optional)
          </label>
          <textarea
            id="memory-note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={2}
            placeholder="What did you find?"
            className="mt-2 w-full resize-none border border-line bg-ink px-3 py-2 text-sm text-ivory placeholder:text-muted focus:border-accent focus:outline-none"
          />
        </div>

        <div className="mt-4 flex items-start gap-3">
          <input
            id="memory-location"
            type="checkbox"
            checked={locationState === "ready" || locationState === "locating"}
            onChange={toggleLocation}
            disabled={busy || locationState === "locating"}
            className="mt-1 h-4 w-4 accent-[#e8a33d]"
          />
          <div>
            <label htmlFor="memory-location" className="text-sm text-ivory">
              Add my location to this memory
            </label>
            <p aria-live="polite" className="mt-1 text-xs text-muted">
              {locationLine[locationState]}
            </p>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-between gap-3">
          <Button variant="ghost" onClick={onRetake} disabled={busy}>
            Retake
          </Button>
          <Button onClick={() => onConfirm({ note, coords })} disabled={busy}>
            {busy ? "Saving…" : "Confirm — save this memory"}
          </Button>
        </div>
      </div>
    </div>
  );
}
