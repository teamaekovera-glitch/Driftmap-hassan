/**
 * Fog of war — derived state, not decoration. The fog is a pure function of
 * journey progress: completed stops open holes, the route draws itself
 * between them in journey order, and the active mission shows as one
 * obscured circle. Both the live map and the schematic fallback render this
 * same state, so gameplay survives tile loss unchanged.
 */

import type { Journey, MemoryRecord, Mission, Place } from "./types";

export interface FogState {
  /** One hole per completed stop, in journey order. */
  revealed: { coords: [number, number]; radiusMeters: number }[];
  /** Route polylines between consecutive completed stops, in journey order. */
  routes: [number, number][][];
  /** The obscured circle over the active mission's target, or null. */
  activeTarget: { coords: [number, number]; radiusMeters: number } | null;
}

/** Reveal-hole radius — generous, matching the mission circles' scale. */
export const REVEAL_RADIUS_METERS = 300;

/**
 * Mission index from a mission id (`${journeyId}--m${index}`); null when the
 * id does not follow the shared convention — callers sort those last.
 */
export function missionIndexFromId(missionId: string): number | null {
  const match = /--m(\d+)$/.exec(missionId);
  return match ? Number(match[1]) : null;
}

/**
 * Order memories by their position in the run: mission index first, then
 * completion time (nulls last — the clock is not trusted), then id. Every
 * memory is a completed stop; a null `completedAt` never drops the stop.
 */
export function orderMemoriesForJourney(memories: MemoryRecord[]): MemoryRecord[] {
  return [...memories].sort((a, b) => {
    const ia = missionIndexFromId(a.missionId);
    const ib = missionIndexFromId(b.missionId);
    if (ia !== null && ib !== null && ia !== ib) return ia - ib;
    if (ia === null && ib !== null) return 1;
    if (ia !== null && ib === null) return -1;
    const ta = a.completedAt ?? Number.POSITIVE_INFINITY;
    const tb = b.completedAt ?? Number.POSITIVE_INFINITY;
    if (ta !== tb) return ta - tb;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/**
 * Derive the fog state for a journey from its completed memories. Memories
 * from other journeys are ignored; memories pointing at unknown places are
 * skipped safely rather than crashing the map.
 */
export function computeFogState(
  journey: Journey,
  memories: MemoryRecord[],
  places: Place[],
  activeMission?: Mission,
): FogState {
  const placesById = new Map(places.map((place) => [place.id, place]));

  const journeyMemories = orderMemoriesForJourney(
    memories.filter((memory) => memory.journeyId === journey.id),
  );

  const revealedCoords: [number, number][] = [];
  for (const memory of journeyMemories) {
    const place = placesById.get(memory.placeId);
    if (!place) continue; // unknown place reference — skip, never crash
    revealedCoords.push(place.coords);
  }

  const routes: [number, number][][] = [];
  for (let i = 1; i < revealedCoords.length; i++) {
    routes.push([revealedCoords[i - 1], revealedCoords[i]]);
  }

  let activeTarget: FogState["activeTarget"] = null;
  if (journey.status !== "completed" && activeMission) {
    const target = placesById.get(activeMission.placeId);
    if (target) {
      activeTarget = { coords: target.coords, radiusMeters: activeMission.radiusMeters };
    }
  }

  return {
    revealed: revealedCoords.map((coords) => ({
      coords,
      radiusMeters: REVEAL_RADIUS_METERS,
    })),
    routes,
    activeTarget,
  };
}
