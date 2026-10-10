/**
 * Driftmap shared data model — the contract between the parallel workstreams
 * (storage, mission engine, map, UI). Implements the build spec's core data
 * model verbatim. Do not rename exported types or fields: sibling PRs compile
 * against these names.
 *
 * Coordinates are [longitude, latitude] everywhere, matching GeoJSON/MapLibre.
 * The mission never carries the place name in a renderable field; the place is
 * resolved only at reveal time.
 */

export type PersonalityId =
  | 'curious'
  | 'broke'
  | 'adventurous'
  | 'introverted'
  | 'chaotic';

export type PlaceCategory =
  | 'waterfront'
  | 'market'
  | 'heritage'
  | 'park'
  | 'culture'
  | 'transit'
  | 'street-life';

export interface City {
  id: string; // 'kozhikode'
  name: string;
  center: [number, number]; // [lon, lat]
  zoom: number;
}

export interface Place {
  id: string; // 'kozhikode--mananchira-square'
  cityId: string;
  name: string;
  coords: [number, number]; // [lon, lat]
  category: PlaceCategory;
  /** Constrained vocabulary (PLACE_TAGS) the engine reasons over. */
  tags: string[]; // 'free' | 'public' | 'quiet' | 'photogenic' | 'historic' | 'food' | 'busy'
  /** Grounded attribute phrases; generated clues may only use these. */
  clueMaterial: string[];
  /** The dataset only ever contains public, appropriate places. */
  suitability: 'public';
  /** Bundled sample photo used by demo journeys. */
  demoPhotoId?: string;
}

export interface Mission {
  id: string; // `${journeyId}--m${index}`
  journeyId: string;
  index: number; // position in the run
  /** Hidden from the player until completion — never render it. */
  placeId: string;
  personality: PersonalityId;
  /** Generated from category + clueMaterial — never invented facts. */
  clue: string;
  /** Category-level only — never the place name. */
  hint: string;
  /** Radius of the obscured region shown on the map. */
  radiusMeters: number;
  /** Why this mission fits the chosen personality. */
  reason: string;
  /** Chaotic extras, e.g. 'capture it from a low angle'. */
  constraint?: string;
  status: 'locked' | 'active' | 'complete';
}

export interface Journey {
  id: string;
  cityId: string;
  personality: PersonalityId;
  seed: number;
  kind: 'demo' | 'played';
  status: 'active' | 'completed';
  missionIds: string[];
  createdAt: number;
}

export type ThemeId =
  | 'discovery'
  | 'architecture'
  | 'food'
  | 'nature'
  | 'street-life'
  | 'unexpected';

export interface MemoryRecord {
  /** Equals the photo id — one memory, one photo. */
  id: string;
  journeyId: string;
  missionId: string;
  placeId: string;
  /** Epoch ms; null when the device clock cannot be trusted. */
  completedAt: number | null;
  /** Stored only with explicit permission. */
  coords?: [number, number];
  /** Says what really happened — no code path claims landmark recognition. */
  verification: 'player-confirmed' | 'location-assisted';
  clue: string;
  /** Template-generated; only claims what it knows. */
  caption: string;
  /** Player-written. */
  note?: string;
  /** Rule-based default, user-editable. */
  theme: ThemeId;
}

export interface PhotoAsset {
  id: string;
  journeyId: string;
  /** Compressed JPEG, long edge ≤ 1600px. */
  blob: Blob;
  width: number;
  height: number;
  createdAt: number;
}

/**
 * Runtime companions to the string unions above. `as const satisfies` keeps
 * each list exhaustive against its type; the engine, validators, and UI
 * consume these instead of re-declaring their own lists.
 */
export const PERSONALITY_IDS = [
  'curious',
  'broke',
  'adventurous',
  'introverted',
  'chaotic',
] as const satisfies readonly PersonalityId[];

export const PLACE_CATEGORIES = [
  'waterfront',
  'market',
  'heritage',
  'park',
  'culture',
  'transit',
  'street-life',
] as const satisfies readonly PlaceCategory[];

/** The constrained tag vocabulary referenced by `Place.tags`. */
export type PlaceTag =
  | 'free'
  | 'public'
  | 'quiet'
  | 'photogenic'
  | 'historic'
  | 'food'
  | 'busy';

export const PLACE_TAGS = [
  'free',
  'public',
  'quiet',
  'photogenic',
  'historic',
  'food',
  'busy',
] as const satisfies readonly PlaceTag[];

export const THEME_IDS = [
  'discovery',
  'architecture',
  'food',
  'nature',
  'street-life',
  'unexpected',
] as const satisfies readonly ThemeId[];

