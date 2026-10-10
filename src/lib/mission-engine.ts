/**
 * The mission engine — the game's brain. A pure, deterministic function:
 * same city, personality, seed, and place set → same missions, every time,
 * on every machine. No network, no React, no clock — a played journey seeds
 * from Date.now() at the call site, never in here.
 */

import { buildClue, buildReason, CATEGORY_HINTS, CHAOTIC_CONSTRAINTS } from "./clues";
import { distanceMeters } from "./geo";
import { mulberry32 } from "./prng";
import type { City, Mission, PersonalityId, Place } from "./types";

export const DEFAULT_MAX_MISSIONS = 6;

export interface MissionInput {
  city: City;
  places: Place[]; // bundled; the dataset only carries public, clueable places
  personality: PersonalityId;
  seed: number; // demo journeys use a fixed seed; played journeys use Date.now()
  maxMissions?: number; // default 6
  /** Resume support: places already completed are never re-issued. */
  completedPlaceIds?: string[];
  /** Bakes mission ids as `${journeyId}--m${index}` per the data-model contract. */
  journeyId: string;
}

export interface MissionOutput {
  /** Ordered; missions[0] is active, the rest locked. */
  missions: Mission[];
  /** One human-readable line per selection, shown in the UI. */
  reasonLog: string[];
}

/** Generous obscured-region radii per category (spec: radius hints stay generous). */
export const RADIUS_BY_CATEGORY: Record<Place["category"], number> = {
  waterfront: 350,
  market: 200,
  heritage: 300,
  park: 400,
  culture: 350,
  transit: 250,
  "street-life": 300,
};

interface SelectionState {
  usedCategories: Set<Place["category"]>;
  lastPick: Place | null;
}

/**
 * Per-personality score for one candidate. Higher wins. Scores encode the
 * spec's profiles: Curious reads stones, Broke pays nothing, Adventurous
 * ranges far across new categories, Introverted keeps off the busy circuits,
 * Chaotic ignores scoring entirely (seeded shuffle).
 */
function scoreFor(
  place: Place,
  personality: PersonalityId,
  city: City,
  state: SelectionState,
): number {
  switch (personality) {
    case "curious": {
      let score = 0;
      if (place.category === "heritage" || place.category === "culture") score += 2;
      score += Math.min(place.clueMaterial.length, 3) * 0.5;
      return score;
    }
    case "broke":
      // Eligibility already hard-filters to the `free` tag; among free
      // places, prefer the photogenic and the tasty — all still no-cost.
      return (
        (place.tags.includes("photogenic") ? 1 : 0) + (place.tags.includes("food") ? 0.5 : 0)
      );
    case "adventurous": {
      let score = 0;
      if (!state.usedCategories.has(place.category)) score += 2;
      const from = state.lastPick?.coords ?? city.center;
      // Kilometre-scaled hop distance pushes the run toward the dataset's
      // edges (Beypore, Kappad) without ever leaving the public set.
      score += distanceMeters(from, place.coords) / 1000;
      return score;
    }
    case "introverted": {
      let score = 0;
      if (place.tags.includes("quiet")) score += 2;
      if (place.category === "park") score += 1;
      if (place.tags.includes("busy")) score -= 3;
      // Ordering rule: never two market stops back to back.
      if (state.lastPick?.category === "market" && place.category === "market") score -= 100;
      return score;
    }
    case "chaotic":
      return 0; // eligibility only — the seeded shuffle does the choosing
  }
}

/** Deterministic eligibility pipeline shared by every personality. */
function eligiblePlaces(input: MissionInput): Place[] {
  const completed = new Set(input.completedPlaceIds ?? []);
  const seen = new Set<string>();
  const eligible: Place[] = [];
  for (const place of input.places) {
    // Reject duplicates within the input outright; a place may never be
    // issued twice across the run or the dataset.
    if (seen.has(place.id)) continue;
    seen.add(place.id);
    if (place.cityId !== input.city.id) continue;
    if (completed.has(place.id)) continue;
    if (input.personality === "broke" && !place.tags.includes("free")) continue;
    eligible.push(place);
  }
  return eligible;
}

/**
 * Generate a personality-aware mission run. Deterministic: selection,
 * ordering, clues, and chaotic constraints are fully derived from
 * (city, places, personality, seed, maxMissions, completedPlaceIds).
 */
export function generateMissions(input: MissionInput): MissionOutput {
  const maxMissions = Math.max(0, Math.trunc(input.maxMissions ?? DEFAULT_MAX_MISSIONS));
  const eligible = eligiblePlaces(input);
  if (eligible.length === 0 || maxMissions === 0) {
    return {
      missions: [],
      reasonLog: [
        eligible.length === 0
          ? "No places qualified for this run — the dataset may be empty or exhausted."
          : "Run length is zero — no missions were generated.",
      ],
    };
  }

  const rng = mulberry32(input.seed);
  const state: SelectionState = { usedCategories: new Set(), lastPick: null };
  const chosen: Place[] = [];

  if (input.personality === "chaotic") {
    // Seeded Fisher-Yates over the eligible set — reproducible chaos.
    const pool = [...eligible];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    chosen.push(...pool.slice(0, Math.min(maxMissions, pool.length)));
  } else {
    while (chosen.length < maxMissions && chosen.length < eligible.length) {
      const jitter = rng() * 0.01; // nudges equally-scored places, still deterministic
      let best: Place | null = null;
      let bestScore = -Infinity;
      for (const place of eligible) {
        if (chosen.some((c) => c.id === place.id)) continue;
        const score = scoreFor(place, input.personality, input.city, state) + jitter;
        if (score > bestScore || (score === bestScore && best !== null && place.id < best.id)) {
          best = place;
          bestScore = score;
        }
      }
      if (!best) break;
      chosen.push(best);
      state.usedCategories.add(best.category);
      state.lastPick = best;
    }
  }

  const missions: Mission[] = chosen.map((place, index) => {
    const constraint =
      input.personality === "chaotic"
        ? CHAOTIC_CONSTRAINTS[Math.floor(rng() * CHAOTIC_CONSTRAINTS.length)]
        : undefined;
    return {
      id: `${input.journeyId}--m${index}`,
      journeyId: input.journeyId,
      index,
      placeId: place.id,
      personality: input.personality,
      clue: buildClue(place, input.personality),
      hint: CATEGORY_HINTS[place.category],
      radiusMeters: RADIUS_BY_CATEGORY[place.category],
      reason: buildReason(input.personality, place.category, constraint),
      constraint,
      status: index === 0 ? "active" : "locked",
    };
  });

  const reasonLog = [
    `${eligible.length} place${eligible.length === 1 ? "" : "s"} qualified for the ${input.personality} route.`,
    ...missions.map((mission, i) => `Mission ${i + 1} — ${mission.reason}`),
  ];

  return { missions, reasonLog };
}
