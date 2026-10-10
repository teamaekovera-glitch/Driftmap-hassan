"use client";

/**
 * JourneyCard — journey management: resume in Explore, Play My Journey in
 * the replay player, and delete with an explicit confirm step (the cascade
 * removes the journey's photos with it — that deserves a breath).
 * Presentational: every action arrives as a prop; the card owns only the
 * confirm toggle.
 */

import { useState } from "react";
import Link from "next/link";
import { Button, buttonClasses } from "./button";
import { personalityLabel } from "@/lib/memory-views";
import type { Journey } from "@/lib/types";

export interface JourneyCardProps {
  journey: Journey;
  /** Display name of the journey's city ("Kozhikode"), resolved by the caller. */
  cityName: string;
  /** Confirmed stops so far. */
  memoryCount: number;
  /** Missions in the run — the journey's full length. */
  stopCount: number;
  selected: boolean;
  onSelect: () => void;
  resumeHref: string;
  replayHref: string;
  onExport: () => void;
  onDelete: () => void;
  /** Actions are disabled while a store operation is in flight. */
  busy?: boolean;
}

export function JourneyCard({
  journey,
  cityName,
  memoryCount,
  stopCount,
  selected,
  onSelect,
  resumeHref,
  replayHref,
  onExport,
  onDelete,
  busy = false,
}: JourneyCardProps) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  return (
    <article
      aria-label={`Journey — ${cityName}, ${personalityLabel(journey.personality)}`}
      className={`flex w-full flex-col gap-4 border p-4 text-left transition-colors ${
        selected ? "border-accent" : "border-line"
      }`}
    >
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        className="cursor-pointer text-left focus:outline-none"
      >
        <div className="flex items-center gap-2">
          <h3 className="font-display text-lg">
            {cityName} · {personalityLabel(journey.personality)}
          </h3>
          {journey.kind === "demo" ? (
            <span className="rounded-full border border-line px-2 py-0.5 text-[10px] uppercase tracking-[0.15em] text-muted">
              Demo
            </span>
          ) : null}
        </div>
        <p className="mt-1 text-xs text-muted">
          {memoryCount} of {stopCount} found ·{" "}
          {journey.status === "completed" ? "Completed" : "In progress"} ·{" "}
          {new Date(journey.createdAt).toLocaleDateString(undefined, {
            day: "numeric",
            month: "short",
            year: "numeric",
          })}
        </p>
      </button>

      <div className="flex flex-wrap gap-2">
        <Link
          href={resumeHref}
          className={buttonClasses("ghost") + " px-3 py-1.5 text-xs"}
          onClick={onSelect}
        >
          Resume
        </Link>
        <Link
          href={replayHref}
          className={buttonClasses("ghost") + " px-3 py-1.5 text-xs"}
          onClick={onSelect}
        >
          Play My Journey
        </Link>
        <Button
          variant="ghost"
          className="px-3 py-1.5 text-xs"
          onClick={onExport}
          disabled={busy}
        >
          Export
        </Button>
        <Button
          variant="ghost"
          className="border-red-900/60 px-3 py-1.5 text-xs text-red-300 hover:border-red-700 hover:text-red-200"
          onClick={() => setConfirmingDelete(true)}
          disabled={busy}
          aria-expanded={confirmingDelete}
        >
          Delete
        </Button>
      </div>

      {confirmingDelete ? (
        <div
          role="alertdialog"
          aria-label="Confirm journey deletion"
          className="border border-red-900/60 p-3"
        >
          <p className="text-sm">
            Delete this journey? Its {memoryCount === 1 ? "memory" : "memories"} and{" "}
            {memoryCount === 1 ? "photo goes" : "photos go"} with it — this cannot be undone.
          </p>
          <div className="mt-3 flex gap-2">
            <Button
              className="bg-red-900 px-3 py-1.5 text-xs text-ivory hover:bg-red-800"
              onClick={() => {
                setConfirmingDelete(false);
                onDelete();
              }}
              disabled={busy}
            >
              Delete journey
            </Button>
            <Button
              variant="ghost"
              className="px-3 py-1.5 text-xs"
              onClick={() => setConfirmingDelete(false)}
              disabled={busy}
            >
              Keep it
            </Button>
          </div>
        </div>
      ) : null}
    </article>
  );
}
