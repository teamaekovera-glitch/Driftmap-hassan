"use client";

/**
 * MoodChips — the theme vocabulary as filter chips, with live counts. The
 * active chip filters the mood grid; "All" clears the filter. Themes are
 * user-editable on each card — the chips re-count as edits land.
 */

import { themeLabel } from "@/lib/memory-views";
import type { ThemeCollection } from "@/lib/memory-views";
import type { ThemeId } from "@/lib/types";

export interface MoodChipsProps {
  collections: ThemeCollection[];
  /** The active filter; null shows everything. */
  active: ThemeId | null;
  onSelect: (theme: ThemeId | null) => void;
}

export function MoodChips({ collections, active, onSelect }: MoodChipsProps) {
  const total = collections.reduce((sum, collection) => sum + collection.memories.length, 0);

  function chip(label: string, count: number, pressed: boolean, onClick: () => void, key: string) {
    return (
      <button
        key={key}
        type="button"
        aria-pressed={pressed}
        onClick={onClick}
        className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs tracking-wide transition-colors ${
          pressed ? "border-accent text-accent" : "border-line text-muted hover:border-accent hover:text-accent"
        }`}
      >
        {label}
        <span className={pressed ? "text-accent" : "text-muted/70"}>{count}</span>
      </button>
    );
  }

  return (
    <div role="group" aria-label="Filter memories by mood" className="flex flex-wrap gap-2">
      {chip("All", total, active === null, () => onSelect(null), "all")}
      {collections.map((collection) =>
        chip(
          themeLabel(collection.theme),
          collection.memories.length,
          active === collection.theme,
          () => onSelect(collection.theme),
          collection.theme,
        ),
      )}
    </div>
  );
}
