/**
 * Completion logic — the honest heart of the game loop. Pure functions only:
 * what a confirmed photo becomes (the memory record), what the verification
 * field may claim, what the caption says, and how mission status derives
 * from memories.
 *
 * Honesty rules enforced here:
 * - Verification is `player-confirmed` unless a permitted GPS fix actually
 *   falls inside the mission radius — no code path can claim recognition.
 * - Captions are category-keyed templates that narrate the act of finding,
 *   never the place name, never facts the store does not hold.
 * - Mission status is derived from memories (the photos are the save file),
 *   never from a second stored copy that could drift.
 */

import { distanceMeters } from "./geo";
import type { Mission, MemoryRecord, Place, PlaceCategory, ThemeId } from "./types";

/** One memory, one photo: the photo id derives from the mission id. */
export function photoIdFor(missionId: string): string {
  return `${missionId}--photo`;
}

/**
 * What really happened: `location-assisted` only when a permitted fix lands
 * inside the mission's obscured radius (inclusive boundary), else the
 * default `player-confirmed`. A null/failed fix never downgrades the save —
 * completion proceeds on player confirmation alone.
 */
export function verificationFor(
  coords: [number, number] | null | undefined,
  targetCoords: [number, number],
  radiusMeters: number,
): MemoryRecord["verification"] {
  if (!coords) return "player-confirmed";
  return distanceMeters(coords, targetCoords) <= radiusMeters
    ? "location-assisted"
    : "player-confirmed";
}

/**
 * "10:42 AM" — the only time claim a memory makes. A null or non-finite
 * `completedAt` (device clock untrusted) yields null and the caption omits
 * the time rather than guessing.
 */
export function buildTimeLabel(
  completedAt: number | null,
  locale?: string,
): string | null {
  if (completedAt === null || !Number.isFinite(completedAt)) return null;
  const date = new Date(completedAt);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleTimeString(locale ?? undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Category-keyed caption bodies. Each narrates the act of following the
 * clue — nothing a source did not state, no place names, no feelings
 * claimed on the player's behalf. The shared closing line is the spec's
 * own signature sentence.
 */
export const CAPTION_BODIES: Record<PlaceCategory, string> = {
  waterfront: "You followed a clue to the water and kept the view.",
  market: "You followed a clue into the shopping lanes and kept a frame of it.",
  heritage: "You followed a clue among the old stones and kept a piece of the past.",
  park: "You followed a clue into the green and let the city slow down.",
  culture: "You followed a clue indoors and kept something the city puts on display.",
  transit: "You followed a clue to where the city arrives and departs, and kept the moment.",
  "street-life": "You followed a clue into the old lanes and kept their story in a frame.",
};

const CAPTION_TAIL = "You found something worth remembering.";

export function buildCaption(
  category: PlaceCategory,
  completedAt: number | null,
  locale?: string,
): string {
  const time = buildTimeLabel(completedAt, locale);
  const body = `${CAPTION_BODIES[category]} ${CAPTION_TAIL}`;
  return time ? `${time} — ${body}` : body;
}

/** Rule-based default theme per category — user-editable later in Remember. */
export const THEME_BY_CATEGORY: Record<PlaceCategory, ThemeId> = {
  waterfront: "nature",
  market: "food",
  heritage: "architecture",
  park: "nature",
  culture: "discovery",
  transit: "unexpected",
  "street-life": "street-life",
};

export function defaultThemeFor(category: PlaceCategory): ThemeId {
  return THEME_BY_CATEGORY[category];
}

export interface MemoryRecordInput {
  mission: Mission;
  place: Place;
  /** Optional permitted GPS fix, [lon, lat]. */
  coords?: [number, number] | null;
  /** Epoch ms, or null when the clock cannot be trusted. */
  completedAt: number | null;
  /** Player-written note; empty/whitespace notes are dropped. */
  note?: string;
  /** Caption time formatting locale (tests); browser default when omitted. */
  locale?: string;
}

/** Build the memory a confirmed capture writes — id equals the photo id. */
export function buildMemoryRecord(input: MemoryRecordInput): MemoryRecord {
  const { mission, place, coords, completedAt, note, locale } = input;
  const trimmedNote = note?.trim();
  return {
    id: photoIdFor(mission.id),
    journeyId: mission.journeyId,
    missionId: mission.id,
    placeId: place.id,
    completedAt,
    ...(coords ? { coords } : {}),
    verification: verificationFor(coords, place.coords, mission.radiusMeters),
    clue: mission.clue,
    caption: buildCaption(place.category, completedAt, locale),
    ...(trimmedNote ? { note: trimmedNote } : {}),
    theme: defaultThemeFor(place.category),
  };
}

/**
 * Mission status is derived state. A mission is complete when a memory
 * references it (and belongs to the same journey — a memory id reused
 * across journeys cannot complete someone else's run); the first
 * not-yet-complete mission in run order is the single active one; the rest
 * stay locked.
 */
export function deriveMissionStates(
  missions: Mission[],
  memories: MemoryRecord[],
): Mission[] {
  let activeAssigned = false;
  return missions.map((mission) => {
    const complete = memories.some(
      (memory) =>
        memory.missionId === mission.id && memory.journeyId === mission.journeyId,
    );
    if (complete) return { ...mission, status: "complete" } as Mission;
    if (!activeAssigned) {
      activeAssigned = true;
      return { ...mission, status: "active" } as Mission;
    }
    return { ...mission, status: "locked" } as Mission;
  });
}

/** The one mission currently playable, or null when the run is complete. */
export function activeMissionOf(missions: Mission[]): Mission | null {
  return missions.find((mission) => mission.status === "active") ?? null;
}

export interface JourneyProgress {
  found: number;
  total: number;
  /** True when every mission has a memory — the journey is the film. */
  complete: boolean;
  /** 1-based position of the active mission; null when complete. */
  current: number | null;
}

export function journeyProgress(
  missions: Mission[],
  memories: MemoryRecord[],
): JourneyProgress {
  const total = missions.length;
  const found = missions.filter((mission) =>
    memories.some(
      (memory) =>
        memory.missionId === mission.id && memory.journeyId === mission.journeyId,
    ),
  ).length;
  const active = activeMissionOf(deriveMissionStates(missions, memories));
  return {
    found,
    total,
    complete: total > 0 && found === total,
    current: active ? active.index + 1 : null,
  };
}
