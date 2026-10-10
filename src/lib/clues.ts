/**
 * Clue generation — the honesty layer. Clues are category-keyed templates
 * filled ONLY with a place's own `clueMaterial` phrases; hints are
 * category-level; nothing here can leak a place name or invent a fact
 * (hours, crowds, prices). Unclueable places get the spec's fallback clue.
 */

import { hashString } from "./prng";
import type { PersonalityId, Place, PlaceCategory } from "./types";

/** Category-level hints — deliberately place-name-free. */
export const CATEGORY_HINTS: Record<PlaceCategory, string> = {
  waterfront: "Along the water",
  market: "A shopping lane",
  heritage: "A historic landmark",
  park: "A green public space",
  culture: "A museum or science centre",
  transit: "A transit hub",
  "street-life": "An old quarter's streets",
};

/**
 * One template per category per slot. `{material}` is always replaced with a
 * noun phrase from the place's own `clueMaterial`, so every template is
 * written to read naturally with any grounded phrase.
 */
export const CLUE_TEMPLATES: Record<PlaceCategory, [string, string, string]> = {
  waterfront: [
    "The water keeps its secrets. Find {material}.",
    "Look for {material} — the shoreline will do the rest.",
    "Somewhere on the waterline: {material}.",
  ],
  market: [
    "The air smells of sugar and spice. Find {material}.",
    "Look for {material} — come hungry.",
    "Somewhere in the old city's shopping lanes: {material}.",
  ],
  heritage: [
    "Old stones remember. Find {material}.",
    "Look for {material} — time built it to last.",
    "Somewhere the centuries left behind: {material}.",
  ],
  park: [
    "The city exhales here. Find {material}.",
    "Look for {material} — bring nothing but time.",
    "Somewhere green and open: {material}.",
  ],
  culture: [
    "The city keeps some memories indoors. Find {material}.",
    "Look for {material} — curiosity is the ticket.",
    "Somewhere the past is on display: {material}.",
  ],
  transit: [
    "Every journey needs a threshold. Find {material}.",
    "Look for {material} — arrivals and departures mark the spot.",
    "Somewhere the city's comings and goings converge: {material}.",
  ],
  "street-life": [
    "The street is the storyteller. Find {material}.",
    "Look for {material} where the lanes keep talking.",
    "Somewhere the old quarter breathes: {material}.",
  ],
};

/** The spec's fallback clue for places whose attribute data is too thin. */
export const FALLBACK_CLUE =
  "Find a public place where the city slows down for a moment.";

/** The spec's Curious lead-in — the one personality-flavored clue prefix. */
export const CURIOUS_LEAD_IN = "You have passed it without looking up. ";

/**
 * Fixed safe constraint pool for Chaotic extras — actions a photographer can
 * choose freely from public ground; nothing private, hazardous, or invasive.
 */
export const CHAOTIC_CONSTRAINTS = [
  "capture it from a low angle",
  "with something red in the frame",
  "from directly across the street",
  "silhouetted against the light",
  "with the ground in focus",
  "through an arch or a doorway",
] as const;

/**
 * The clue for a place under a personality: template selected by a stable
 * hash of (placeId, personality), material by hash of (placeId, slot), so the
 * same inputs always yield the same clue. Pure — no PRNG stream, no clock.
 */
export function buildClue(place: Place, personality: PersonalityId): string {
  const material = pickMaterial(place, personality);
  if (!material) return FALLBACK_CLUE;

  const templates = CLUE_TEMPLATES[place.category];
  const template = templates[templateIndex(place.id, personality, templates.length)];
  const clue = template.replace("{material}", material);
  return personality === "curious" ? `${CURIOUS_LEAD_IN}${clue}` : clue;
}

/**
 * Pick the material phrase the clue will carry — exported for tests so
 * clue traceability can be reconstructed independently of the engine.
 */
export function pickMaterial(place: Place, personality: PersonalityId): string | null {
  const materials = place.clueMaterial;
  if (materials.length === 0) return null;
  const slot = hashString(`${place.id}/material/${personality}`) % materials.length;
  return materials[slot] ?? null;
}

function templateIndex(placeId: string, personality: PersonalityId, count: number): number {
  return hashString(`${placeId}|${personality}`) % count;
}

/**
 * The reason line: why this mission fits the personality. Describes the
 * selection strategy, never real-world claims. Chaotic missions append the
 * player's constraint.
 */
export function buildReason(
  personality: PersonalityId,
  category: PlaceCategory,
  constraint?: string,
): string {
  const base: Record<PersonalityId, string> = {
    curious: `Picked for the curious — a ${category} that rewards a second look.`,
    broke: "Picked for the broke — this one costs exactly nothing.",
    adventurous:
      "Picked for the adventurous — chosen to keep the hops long and the variety high.",
    introverted:
      "Picked for the introverted — a low-key stop for unhurried wandering.",
    chaotic: "Picked for the chaotic — the seed's dice rolled this one.",
  };
  return constraint ? `${base[personality]} Twist: ${constraint}.` : base[personality];
}
