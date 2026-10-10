/**
 * The demo journey — the judge's first minute. A fully worked Kozhikode
 * afternoon, built by the real mission engine at a fixed seed and persisted
 * like any other journey, so Remember and Play My Journey read exactly the
 * records a played run would have written.
 *
 * Rules (build spec, Demo mode):
 * - Deterministic: same bundle and seed → the same six stops, clues, and
 *   timestamps on every machine. The demo is a real engine output, not a
 *   hand-written fixture.
 * - Idempotent and local-only: seeding runs when the player asks for the
 *   demo (landing "Try the demo") and writes nothing when an intact copy
 *   already exists. A partial or stale demo is repaired; player journeys
 *   are never touched. Deleting the demo and clicking again re-seeds it.
 * - Offline: every photo is a bundled static asset copied into IndexedDB at
 *   seed time, so replay reads only local blobs afterwards.
 * - Honest: memories are `player-confirmed` (no GPS is invented), captions
 *   are the same category templates a played run writes, photos are
 *   `kind: 'demo'` journeys and labeled Demo in the UI.
 */

import { DEMO_PHOTO_SOURCES, type DemoPhotoSource } from "@/data/demo-photos";
import { buildMemoryRecord } from "./completion";
import { createIdbPlayStore } from "./play-flow";
import { deleteJourney } from "./db";
import { generateMissions } from "./mission-engine";
import type { CityBundle } from "@/data/cities";
import type { Journey, MemoryRecord, Mission, Place, PhotoAsset } from "./types";

/** Fixed id — idempotence and the `?journey=` deep links key off it. */
export const DEMO_JOURNEY_ID = "demo-kozhikode-afternoon";

/** The spec's demo seed — also the mission engine's fixed seed. */
export const DEMO_SEED = 20261010;

/** The showcase personality: the richest clue reading of the dataset. */
export const DEMO_PERSONALITY = "curious" as const;

/** Narrative title used on the landing screen; journeys carry no name field. */
export const DEMO_JOURNEY_TITLE = "Kozhikode — an afternoon, on purpose";

/**
 * The demo's afternoon clock: 2026-10-10, 09:45 UTC — mid-afternoon in
 * Kozhikode (IST, UTC+5:30). Fixed constants, not `Date.now()`: the seed
 * must reproduce byte-identical journeys. Each stop's timestamp is the base
 * plus its minute offset in run order, so time order and route order agree.
 */
export const DEMO_AFTERNOON_BASE = Date.UTC(2026, 9, 10, 9, 45, 0);

const STOP_OFFSET_MINUTES = [0, 34, 76, 118, 163, 195];

/** The bundled places the demo stops at — exactly those with a demo photo. */
export function demoPhotoPlaces(places: Place[]): Place[] {
  return places.filter((place) => place.demoPhotoId !== undefined);
}

export interface DemoPhotoSpec {
  id: string;
  url: string;
  width: number;
  height: number;
  createdAt: number;
}

export interface DemoRun {
  journey: Journey;
  missions: Mission[];
  reasonLog: string[];
  memories: MemoryRecord[];
  photos: DemoPhotoSpec[];
}

/**
 * Build the demo run without touching storage: the engine deals the six
 * stops, memories are built by the same `buildMemoryRecord` a played
 * confirmation uses, and each stop's photo spec points at its bundled
 * asset. Throws when the dataset no longer supports six photo-backed stops
 * — a loud failure beats a silently thinner demo.
 */
export function buildDemoRun(bundle: CityBundle): DemoRun {
  const places = demoPhotoPlaces(bundle.places);
  const journey: Journey = {
    id: DEMO_JOURNEY_ID,
    cityId: bundle.city.id,
    personality: DEMO_PERSONALITY,
    seed: DEMO_SEED,
    kind: "demo",
    status: "active",
    missionIds: [],
    createdAt: DEMO_AFTERNOON_BASE,
  };

  const { missions, reasonLog } = generateMissions({
    city: bundle.city,
    places,
    personality: DEMO_PERSONALITY,
    seed: DEMO_SEED,
    journeyId: DEMO_JOURNEY_ID,
  });
  if (missions.length < places.length) {
    throw new Error(
      `The demo dataset expected ${places.length} photo-backed stops but the engine dealt ${missions.length}.`,
    );
  }

  const memories = missions.map((mission, index) => {
    const place = places.find((candidate) => candidate.id === mission.placeId);
    if (!place) {
      throw new Error(`Demo mission "${mission.id}" references an unknown place.`);
    }
    return buildMemoryRecord({
      mission,
      place,
      coords: null, // the demo never claims a GPS fix
      completedAt: DEMO_AFTERNOON_BASE + STOP_OFFSET_MINUTES[index] * 60_000,
    });
  });

  journey.missionIds = missions.map((mission) => mission.id);
  journey.status = "completed"; // six completed stops — the run is whole

  const photos: DemoPhotoSpec[] = memories.map((memory) => {
    const place = places.find((candidate) => candidate.id === memory.placeId);
    const source: DemoPhotoSource | undefined =
      place?.demoPhotoId !== undefined ? DEMO_PHOTO_SOURCES[place.demoPhotoId] : undefined;
    if (!place || !source) {
      throw new Error(`Demo stop "${memory.placeId}" has no bundled photo.`);
    }
    return {
      id: memory.id,
      url: source.url,
      width: source.width,
      height: source.height,
      createdAt: memory.completedAt ?? DEMO_AFTERNOON_BASE,
    };
  });

  return { journey, missions, reasonLog, memories, photos };
}

// ---------------------------------------------------------------------------
// Seeding
// ---------------------------------------------------------------------------

/** The storage operations demo seeding needs, nothing more. */
export interface DemoStore {
  saveJourney(journey: Journey): Promise<void>;
  listJourneys(): Promise<Journey[]>;
  listMemories(journeyId?: string): Promise<MemoryRecord[]>;
  getPhoto(id: string): Promise<PhotoAsset | undefined>;
  saveMemory(memory: MemoryRecord, photo: PhotoAsset): Promise<void>;
  /** Cascades memories and photos — the repair path's clearing tool. */
  deleteJourney(id: string): Promise<void>;
}

/** The real store — the same IndexedDB layer the play flow uses. */
export function createIdbDemoStore(): DemoStore {
  const playStore = createIdbPlayStore();
  return {
    saveJourney: (journey) => playStore.saveJourney(journey),
    listJourneys: () => playStore.listJourneys(),
    listMemories: (journeyId) => playStore.listMemories(journeyId),
    getPhoto: (id) => playStore.getPhoto(id),
    saveMemory: (memory, photo) => playStore.saveMemory(memory, photo),
    deleteJourney: (id) => deleteJourney(id),
  };
}

/** Fetches a bundled asset as the blob the photo store persists. */
export async function loadBundledDemoPhoto(spec: DemoPhotoSpec): Promise<Blob> {
  const response = await fetch(spec.url);
  if (!response.ok) {
    throw new Error(`The demo photo "${spec.url}" could not be loaded (status ${response.status}).`);
  }
  return response.blob();
}

export type DemoSeedOutcome =
  | { status: "created"; run: DemoRun }
  | { status: "existing"; run: DemoRun };

/**
 * Seed the demo journey — idempotent, local-only, and safe to call on every
 * landing visit: an intact demo short-circuits without a single write, a
 * partial demo (interrupted seed, stale schema) is repaired by a cascading
 * rewrite, and player journeys are never read or written.
 */
export async function ensureDemoJourney(
  store: DemoStore,
  loadPhoto: (spec: DemoPhotoSpec) => Promise<Blob>,
  bundle: CityBundle,
): Promise<DemoSeedOutcome> {
  const run = buildDemoRun(bundle);
  const existing = (await store.listJourneys()).find(
    (journey) => journey.id === DEMO_JOURNEY_ID,
  );

  if (existing) {
    const memories = await store.listMemories(DEMO_JOURNEY_ID);
    if (await demoJourneyIsIntact(store, existing, run, memories)) {
      return { status: "existing", run };
    }
    // Partial or stale — clear the cascade, then rewrite from the fixed run.
    await store.deleteJourney(DEMO_JOURNEY_ID);
  }

  await store.saveJourney(run.journey);
  for (let index = 0; index < run.memories.length; index += 1) {
    const memory = run.memories[index];
    const spec = run.photos[index];
    const blob = await loadPhoto(spec);
    const photoAsset: PhotoAsset = {
      id: spec.id,
      journeyId: DEMO_JOURNEY_ID,
      blob,
      width: spec.width,
      height: spec.height,
      createdAt: spec.createdAt,
    };
    await store.saveMemory(memory, photoAsset);
  }
  return { status: "created", run };
}

/**
 * Intactness: the stored journey is the demo this build ships, every memory
 * matches the run the engine rebuilds today (id, mission, place, timestamp),
 * and every photo blob is present. Anything else falls to the repair path.
 */
async function demoJourneyIsIntact(
  store: DemoStore,
  existing: Journey,
  run: DemoRun,
  memories: MemoryRecord[],
): Promise<boolean> {
  if (
    existing.kind !== "demo" ||
    existing.missionIds.length !== run.journey.missionIds.length ||
    memories.length !== run.memories.length
  ) {
    return false;
  }
  const expected = new Map(run.memories.map((memory) => [memory.id, memory]));
  for (const memory of memories) {
    const match = expected.get(memory.id);
    if (!match) return false;
    if (
      memory.missionId !== match.missionId ||
      memory.placeId !== match.placeId ||
      memory.completedAt !== match.completedAt
    ) {
      return false;
    }
    if (!(await store.getPhoto(memory.id))) return false;
  }
  return true;
}
