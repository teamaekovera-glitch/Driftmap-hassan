/**
 * Deterministic preview fixture for the map surfaces. Runs the real mission
 * engine on the real dataset at a fixed seed, simulates a two-stops-found
 * progression, and derives the FogState exactly the way the game will —
 * so the maps on /play and /memory consume production data shapes, and the
 * unit suite can pin that consumption down. No clock, no randomness: two
 * calls build identical previews.
 */

import { KOZHIKODE, KOZHIKODE_PLACES } from "@/data/kozhikode";
import { computeFogState } from "./fog";
import { generateMissions } from "./mission-engine";
import type { FogState } from "./fog";
import type { City, Journey, MemoryRecord, Mission, Place, ThemeId } from "./types";

export const MAP_PREVIEW_JOURNEY_ID = "j-map-preview";
export const MAP_PREVIEW_SEED = 20261010;

export interface MapPreview {
  city: City;
  places: Place[];
  journey: Journey;
  missions: Mission[];
  fogState: FogState;
}

export function buildMapPreview(): MapPreview {
  const journey: Journey = {
    id: MAP_PREVIEW_JOURNEY_ID,
    cityId: KOZHIKODE.id,
    personality: "curious",
    seed: MAP_PREVIEW_SEED,
    kind: "demo",
    status: "active",
    missionIds: [],
    createdAt: 1_791_000_000_000,
  };

  const output = generateMissions({
    city: KOZHIKODE,
    places: KOZHIKODE_PLACES,
    personality: "curious",
    seed: MAP_PREVIEW_SEED,
    journeyId: MAP_PREVIEW_JOURNEY_ID,
  });
  const missions = output.missions.map((mission, index) => ({
    ...mission,
    status: index < 2 ? ("complete" as const) : index === 2 ? ("active" as const) : ("locked" as const),
  }));
  journey.missionIds = missions.map((mission) => mission.id);

  // Two stops found, one mission in the field, three still buried.
  const memories: MemoryRecord[] = missions.slice(0, 2).map((mission, index) => ({
    id: `preview-memory-${index}`,
    journeyId: journey.id,
    missionId: mission.id,
    placeId: mission.placeId,
    completedAt: journey.createdAt + index * 45 * 60 * 1000,
    verification: "player-confirmed",
    clue: mission.clue,
    caption: "Preview stop — the fog opened here.",
    theme: "discovery" satisfies ThemeId,
  }));

  const fogState = computeFogState(journey, memories, KOZHIKODE_PLACES, missions[2]);

  return {
    city: KOZHIKODE,
    places: KOZHIKODE_PLACES,
    journey,
    missions,
    fogState,
  };
}
