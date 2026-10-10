"use client";

/**
 * TimelineList — the journey as it unfolded. Chronological day groups from
 * groupMemoriesByDay; the unknown-time group renders last with its own
 * quiet header, never dropped, never merged into a day it cannot claim.
 */

import { MemoryCard } from "./memory-card";
import type { TimelineGroup } from "@/lib/memory-views";
import type { ThemeId } from "@/lib/types";

export interface TimelineListProps {
  groups: TimelineGroup[];
  /** Object URLs keyed by memory id (usePhotoUrls). */
  photoUrls: Record<string, string>;
  /** Resolved place names keyed by place id. */
  placeNames: Record<string, string>;
  onThemeChange?: (memoryId: string, theme: ThemeId) => void;
}

export function TimelineList({ groups, photoUrls, placeNames, onThemeChange }: TimelineListProps) {
  if (groups.length === 0) {
    return (
      <p className="py-6 text-center text-muted">
        Nothing on the timeline yet — the first confirmed photo starts it.
      </p>
    );
  }

  return (
    <div className="space-y-8">
      {groups.map((group) => (
        <section key={group.label} aria-label={`Memories from ${group.label}`}>
          <h3
            className={`mb-3 text-xs font-medium uppercase tracking-[0.2em] text-muted ${
              group.isUnknownTime ? "italic" : ""
            }`}
          >
            {group.label}
          </h3>
          <div className="space-y-3 border-l border-line pl-4">
            {group.memories.map((memory) => (
              <MemoryCard
                key={memory.id}
                memory={memory}
                placeName={placeNames[memory.placeId]}
                photoUrl={photoUrls[memory.id]}
                onThemeChange={onThemeChange}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
