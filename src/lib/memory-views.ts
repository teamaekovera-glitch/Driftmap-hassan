/**
 * Memory view logic — the pure layer between the journey store and the
 * Remember modes. No React, no IO: the browser page derives its views from
 * these functions, so "the three modes render the same records" is a
 * testable property of the data, not a hope about the DOM.
 *
 * Honesty rules carried over from the spec:
 * - A memory with an untrustworthy clock is grouped as "unknown time" and
 *   never dropped.
 * - Theme defaults are a category-keyed rule, never a claim about the
 *   player's feelings.
 * - Labels format only what a timestamp can prove; nothing invents hours,
 *   crowds, or weather.
 */

import { orderMemoriesForJourney } from "./fog";
import { THEME_IDS, type MemoryRecord, type Place, type PlaceCategory, type PersonalityId, type ThemeId } from "./types";

export { orderMemoriesForJourney };

/** Header label for memories whose `completedAt` is null. Always last. */
export const UNKNOWN_TIME_LABEL = "Unknown time";

/** Rule-based default theme per place category — the completion-time default. */
const THEME_BY_CATEGORY: Record<PlaceCategory, ThemeId> = {
  waterfront: "nature",
  market: "food",
  heritage: "architecture",
  park: "nature",
  culture: "discovery",
  transit: "unexpected",
  "street-life": "street-life",
};

/**
 * The rule-based default theme for a memory from a place. Exported for the
 * completion flow (Explore) and used by the mood browser to explain where a
 * default came from. User edits override it; the rule never re-applies
 * itself over an edit.
 */
export function defaultThemeForPlace(place: Place): ThemeId {
  return THEME_BY_CATEGORY[place.category];
}

// ---------------------------------------------------------------------------
// Timeline mode — chronological day groups, unknown time last
// ---------------------------------------------------------------------------

export interface TimelineGroup {
  label: string;
  /** True for the "unknown time" group — rendered with its own quiet style. */
  isUnknownTime: boolean;
  memories: MemoryRecord[];
}

/**
 * Group memories chronologically by local calendar day. Memories inside a
 * group keep chronological order (ties broken by id); the unknown-time group
 * always sorts last and is never dropped. Total: every input memory appears
 * in exactly one group.
 */
export function groupMemoriesByDay(memories: MemoryRecord[]): TimelineGroup[] {
  const sorted = [...memories].sort((a, b) => {
    const ta = a.completedAt ?? Number.POSITIVE_INFINITY;
    const tb = b.completedAt ?? Number.POSITIVE_INFINITY;
    if (ta !== tb) return ta - tb;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  const groups: TimelineGroup[] = [];
  const indexByLabel = new Map<string, number>();

  for (const memory of sorted) {
    const { completedAt } = memory;
    const isUnknownTime = completedAt === null;
    const label = completedAt === null ? UNKNOWN_TIME_LABEL : formatDayLabel(completedAt);
    const existing = indexByLabel.get(label);
    if (existing !== undefined) {
      groups[existing].memories.push(memory);
      continue;
    }
    indexByLabel.set(label, groups.length);
    groups.push({ label, isUnknownTime, memories: [memory] });
  }

  return groups;
}

// ---------------------------------------------------------------------------
// Mood mode — theme collections in canonical order
// ---------------------------------------------------------------------------

export interface ThemeCollection {
  theme: ThemeId;
  memories: MemoryRecord[];
}

/**
 * All six themes in canonical `THEME_IDS` order, each with its memories in
 * input order. Empty collections are included so the vocabulary stays
 * visible; callers decide whether to render them.
 */
export function groupMemoriesByTheme(memories: MemoryRecord[]): ThemeCollection[] {
  const byTheme = new Map<ThemeId, MemoryRecord[]>(THEME_IDS.map((theme) => [theme, []]));
  for (const memory of memories) {
    byTheme.get(memory.theme)?.push(memory);
  }
  return THEME_IDS.map((theme) => ({ theme, memories: byTheme.get(theme) ?? [] }));
}

// ---------------------------------------------------------------------------
// Labels — formatting the only claims a timestamp can prove
// ---------------------------------------------------------------------------

/** "Saturday, 10 October 2026" — the viewer's locale and time zone. */
export function formatDayLabel(epochMs: number): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(epochMs);
}

/** "10:42 AM" — the caption timestamp format the spec shows. */
export function formatTimeLabel(epochMs: number): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(epochMs);
}

/** "street-life" → "Street life" — chip and heading labels. */
export function themeLabel(theme: ThemeId): string {
  const label = THEME_IDS.find((candidate) => candidate === theme);
  if (!label) return theme;
  return label
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/** "curious" → "Curious" — journey card and chip labels. */
export function personalityLabel(personality: PersonalityId): string {
  return personality.charAt(0).toUpperCase() + personality.slice(1);
}
