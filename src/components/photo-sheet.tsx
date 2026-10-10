"use client";

/**
 * PhotoSheet — source selection for the mission photo: camera capture
 * (`capture="environment"` on mobile), device upload, or — when a sample is
 * offered — a bundled demo photo. Confirm/retake live in ConfirmCapture;
 * this sheet only produces a raw blob.
 */

import { useEffect, useRef, useState } from "react";
import { Button } from "./button";

export interface PhotoSheetSample {
  /** Bundled asset URL for the demo journey's sample photo. */
  url: string;
  label: string;
}

export interface PhotoSheetProps {
  open: boolean;
  onClose: () => void;
  /** Called with the picked photo blob (camera, upload, or sample). */
  onCapture: (blob: Blob) => void;
  samplePhoto?: PhotoSheetSample;
}

export function PhotoSheet({ open, onClose, onCapture, samplePhoto }: PhotoSheetProps) {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const [sampleError, setSampleError] = useState<string | null>(null);

  // Focus management: move focus in, restore it on close. Escape closes.
  useEffect(() => {
    if (!open) return;
    returnFocusRef.current = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      returnFocusRef.current?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  const handlePicked = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Reset so re-picking the same file fires change again.
    event.target.value = "";
    if (file) onCapture(file);
  };

  const handleSample = async () => {
    if (!samplePhoto) return;
    setSampleError(null);
    try {
      const response = await fetch(samplePhoto.url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      onCapture(await response.blob());
    } catch {
      setSampleError("The demo photo could not be loaded — try taking or uploading one.");
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Add a photo of your find"
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-ink/80"
      />
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="relative m-0 w-full max-w-md border border-line bg-ink-raised p-6 outline-none sm:m-6"
      >
        <h2 className="font-display text-2xl text-ivory">Found it?</h2>
        <p className="mt-2 text-sm text-muted">
          Attach a photo to confirm the find. You can retake before it saves — nothing
          is written until you confirm.
        </p>

        <div className="mt-5 flex flex-col gap-3">
          <Button onClick={() => cameraInputRef.current?.click()}>Take a photo</Button>
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handlePicked}
          />

          <Button variant="ghost" onClick={() => uploadInputRef.current?.click()}>
            Upload from device
          </Button>
          <input
            ref={uploadInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handlePicked}
          />

          {samplePhoto ? (
            <Button variant="ghost" onClick={handleSample}>
              Use a demo photo
            </Button>
          ) : null}

          {sampleError ? (
            <p role="alert" className="border border-line bg-ink px-3 py-2 text-sm text-ivory">
              {sampleError}
            </p>
          ) : null}
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Close without adding a photo"
          className="absolute right-3 top-3 px-2 py-1 text-muted transition-colors hover:text-ivory"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
