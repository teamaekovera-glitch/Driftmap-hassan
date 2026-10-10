"use client";

/**
 * MemoryCard — one memory, one photo: the atom of Remember mode. Renders
 * only what the record knows (caption, clue, timestamp, verification,
 * theme); an absent photo or place name degrades to a placeholder rather
 * than inventing a claim.
 */

import { formatTimeLabel, themeLabel } from "@/lib/memory-views";
import { THEME_IDS, type MemoryRecord, type ThemeId } from "@/lib/types";

export interface MemoryCardProps {
  memory: MemoryRecord;
  /** Resolved place name — undefined renders no line, never a guess. */
  placeName?: string;
  /** Object URL from usePhotoUrls; absent → placeholder frame. */
  photoUrl?: string;
  onThemeChange?: (memoryId: string, theme: ThemeId) => void;
}

/** What really happened, in the record's own words. */
function verificationLabel(verification: MemoryRecord["verification"]): string {
  return verification === "location-assisted" ? "Location-assisted" : "Confirmed by you";
}

export function MemoryCard({ memory, placeName, photoUrl, onThemeChange }: MemoryCardProps) {
  return (
    <article
      aria-label={`Memory at ${placeName ?? "a found place"}`}
      className="flex gap-4 border border-line bg-ink-raised p-4"
    >
      {photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- local blob URL, no optimizer involved
        <img
          src={photoUrl}
          alt={placeName ? `Photo of ${placeName}` : "Your photo of the found place"}
          className="h-24 w-24 flex-none rounded-sm object-cover"
        />
      ) : (
        <div
          aria-hidden
          className="flex h-24 w-24 flex-none items-center justify-center rounded-sm border border-dashed border-line text-muted"
        >
          —
        </div>
      )}

      <div className="min-w-0 flex-1">
        <p className="font-display text-lg leading-snug">{memory.caption}</p>
        {placeName ? <p className="mt-0.5 text-sm text-accent">{placeName}</p> : null}
        <p className="mt-2 text-sm text-muted">&ldquo;{memory.clue}&rdquo;</p>

        {memory.note ? <p className="mt-2 border-l-2 border-line pl-3 text-sm italic">{memory.note}</p> : null}

        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
          <span>{memory.completedAt === null ? "Time unknown" : formatTimeLabel(memory.completedAt)}</span>
          <span aria-hidden>·</span>
          <span>{verificationLabel(memory.verification)}</span>
        </div>

        {onThemeChange ? (
          <div className="mt-3">
            <label className="sr-only" htmlFor={`theme-${memory.id}`}>
              Mood for this memory
            </label>
            <select
              id={`theme-${memory.id}`}
              value={memory.theme}
              onChange={(event) => onThemeChange(memory.id, event.target.value as ThemeId)}
              className="w-full appearance-none rounded-sm border border-line bg-ink px-3 py-1.5 text-xs text-ivory focus:border-accent focus:outline-none"
            >
              {THEME_IDS.map((theme) => (
                <option key={theme} value={theme}>
                  {themeLabel(theme)}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </div>
    </article>
  );
}
