/**
 * The play flow — orchestration between the UI and the layers beneath it
 * (engine, photo pipeline, storage). Storage sits behind a small `PlayStore`
 * interface: the real IndexedDB store, and an in-memory store the UI falls
 * back to when IndexedDB is unavailable or a write fails — the game keeps
 * running rather than corrupting or dead-ending (spec: degraded modes).
 *
 * Missions are never persisted as their own store: the engine is
 * deterministic, so a run is regenerated from (city, places, personality,
 * seed, journeyId) and mission status derives from the memories. The photos
 * are the save file.
 */

import { getCityBundle } from "@/data/cities";
import { compressPhoto, type PhotoCodec } from "./photo";
import {
  buildMemoryRecord,
  deriveMissionStates,
  journeyProgress,
  photoIdFor,
  type JourneyProgress,
} from "./completion";
import { generateMissions, DEFAULT_MAX_MISSIONS } from "./mission-engine";
import {
  getPhoto,
  listJourneys,
  listMemories,
  saveJourney,
  saveMemory,
} from "./db";
import type { City, Journey, MemoryRecord, Mission, PersonalityId, Place, PhotoAsset } from "./types";

// ---------------------------------------------------------------------------
// Stores
// ---------------------------------------------------------------------------

/** The five storage operations the play flow needs, nothing more. */
export interface PlayStore {
  saveJourney(journey: Journey): Promise<void>;
  listJourneys(): Promise<Journey[]>;
  listMemories(journeyId?: string): Promise<MemoryRecord[]>;
  getPhoto(id: string): Promise<PhotoAsset | undefined>;
  saveMemory(memory: MemoryRecord, photo: PhotoAsset): Promise<void>;
}

/** The real store — IndexedDB through the storage layer. */
export function createIdbPlayStore(): PlayStore {
  return {
    saveJourney: (journey) => saveJourney(journey),
    listJourneys: () => listJourneys(),
    listMemories: (journeyId) => listMemories(journeyId),
    getPhoto: (id) => getPhoto(id),
    saveMemory: (memory, photo) => saveMemory(memory, photo),
  };
}

/**
 * In-memory degraded mode. Optionally seeded with the state already loaded
 * (or freshly completed) before IndexedDB failed, so the current run
 * survives the switch within the session.
 */
export function createMemoryPlayStore(
  seed: { journeys?: Journey[]; memories?: MemoryRecord[]; photos?: PhotoAsset[] } = {},
): PlayStore {
  const journeys = new Map((seed.journeys ?? []).map((journey) => [journey.id, journey]));
  const memories = new Map((seed.memories ?? []).map((memory) => [memory.id, memory]));
  const photos = new Map((seed.photos ?? []).map((photo) => [photo.id, photo]));
  return {
    async saveJourney(journey) {
      journeys.set(journey.id, journey);
    },
    async listJourneys() {
      return [...journeys.values()].sort((a, b) => b.createdAt - a.createdAt);
    },
    async listMemories(journeyId) {
      const all = [...memories.values()];
      const scoped = journeyId ? all.filter((memory) => memory.journeyId === journeyId) : all;
      return scoped.sort(
        (a, b) =>
          (a.completedAt ?? Number.POSITIVE_INFINITY) -
          (b.completedAt ?? Number.POSITIVE_INFINITY),
      );
    },
    async getPhoto(id) {
      return photos.get(id);
    },
    async saveMemory(memory, photo) {
      memories.set(memory.id, memory);
      photos.set(photo.id, photo);
    },
  };
}

// ---------------------------------------------------------------------------
// Journey start
// ---------------------------------------------------------------------------

export interface StartJourneyInput {
  city: City;
  places: Place[];
  personality: PersonalityId;
  /** Epoch ms — defaults to the clock; also the played journey's seed. */
  now?: number;
  /** Test override for the derived id. */
  id?: string;
  maxMissions?: number;
}

export interface StartedJourney {
  journey: Journey;
  missions: Mission[];
  reasonLog: string[];
}

/**
 * Create and persist a played journey: seeded from the clock, missions
 * generated once and frozen into `missionIds`. Throws (typed StorageError)
 * when persistence fails — the caller decides the degraded-mode response.
 */
export async function startJourney(
  store: PlayStore,
  input: StartJourneyInput,
): Promise<StartedJourney> {
  const now = input.now ?? Date.now();
  const seed = now;
  const id =
    input.id ?? `j-${now.toString(36)}-${input.personality}-${Math.random().toString(36).slice(2, 7)}`;

  const { missions, reasonLog } = generateMissions({
    city: input.city,
    places: input.places,
    personality: input.personality,
    seed,
    journeyId: id,
    maxMissions: input.maxMissions,
  });
  if (missions.length === 0) {
    throw new Error("No missions could be generated for this run — the dataset may be exhausted.");
  }

  const journey: Journey = {
    id,
    cityId: input.city.id,
    personality: input.personality,
    seed,
    kind: "played",
    status: "active",
    missionIds: missions.map((mission) => mission.id),
    createdAt: now,
  };
  await store.saveJourney(journey);
  return { journey, missions, reasonLog };
}

// ---------------------------------------------------------------------------
// Mission completion
// ---------------------------------------------------------------------------

export interface CompleteMissionInput {
  journey: Journey;
  /** The full run's missions (any status states are ignored and re-derived). */
  missions: Mission[];
  /** The mission being completed — must belong to the journey. */
  mission: Mission;
  place: Place;
  /** The confirmed capture, uncompressed. */
  photo: Blob;
  /** Optional permitted GPS fix, [lon, lat]. */
  coords?: [number, number] | null;
  note?: string;
  now?: number;
  /** Test seam for compression (browser canvas codec by default). */
  codec?: PhotoCodec;
}

export interface CompletedMission {
  memory: MemoryRecord;
  photoAsset: PhotoAsset;
  /** The run's missions with statuses re-derived, journey status updated. */
  missions: Mission[];
  journey: Journey;
  progress: JourneyProgress;
}

/**
 * The one-transaction save behind "I think I found it": compress the
 * capture, write photo + memory atomically, re-derive the run, and flip the
 * journey to `completed` when the last mission lands. Throws when the
 * mission already has a memory (double submit), when the photo cannot be
 * read, or when storage fails — callers surface those states.
 */
export async function completeMission(
  store: PlayStore,
  input: CompleteMissionInput,
): Promise<CompletedMission> {
  const { journey, mission, place } = input;
  if (mission.journeyId !== journey.id) {
    throw new Error(`Mission "${mission.id}" does not belong to journey "${journey.id}".`);
  }
  const photoId = photoIdFor(mission.id);
  if (await store.getPhoto(photoId)) {
    throw new Error("This mission is already complete — its memory is saved.");
  }

  const now = input.now ?? Date.now();
  const compressed = await compressPhoto(input.photo, input.codec ? { codec: input.codec } : undefined);
  const memory = buildMemoryRecord({
    mission,
    place,
    coords: input.coords ?? null,
    completedAt: now,
    note: input.note,
  });
  const photoAsset: PhotoAsset = {
    id: photoId,
    journeyId: journey.id,
    blob: compressed.blob,
    width: compressed.width,
    height: compressed.height,
    createdAt: now,
  };

  // Photo and memory land together or not at all (storage-layer invariant).
  await store.saveMemory(memory, photoAsset);

  const allMemories = await store.listMemories(journey.id);
  const missionsNext = deriveMissionStates(input.missions, allMemories);
  const complete = missionsNext.length > 0 && missionsNext.every((m) => m.status === "complete");
  const journeyNext: Journey = {
    ...journey,
    status: complete ? "completed" : journey.status === "completed" ? "completed" : "active",
  };
  await store.saveJourney(journeyNext);

  return {
    memory,
    photoAsset,
    missions: missionsNext,
    journey: journeyNext,
    progress: journeyProgress(missionsNext, allMemories),
  };
}

// ---------------------------------------------------------------------------
// Load / resume
// ---------------------------------------------------------------------------

export interface JourneyRunState {
  journey: Journey;
  city: City;
  places: Place[];
  /** The regenerated run, statuses derived from memories. */
  missions: Mission[];
  memories: MemoryRecord[];
  activeMission: Mission | null;
  progress: JourneyProgress;
  reasonLog: string[];
}

/**
 * Rebuild a run from the save file. Picks the requested journey, else the
 * newest active one; regenerates the deterministic mission list; derives
 * statuses from memories; repairs a stale stored status (best-effort — the
 * memories remain the source of truth if the repair write fails).
 */
export async function loadJourneyState(
  store: PlayStore,
  journeyId?: string,
): Promise<JourneyRunState | null> {
  const journeys = await store.listJourneys();
  const journey = journeyId
    ? journeys.find((candidate) => candidate.id === journeyId)
    : journeys.find((candidate) => candidate.status === "active");
  if (!journey) return null;

  const bundle = getCityBundle(journey.cityId);
  if (!bundle) return null;

  const { missions, reasonLog } = generateMissions({
    city: bundle.city,
    places: bundle.places,
    personality: journey.personality,
    seed: journey.seed,
    journeyId: journey.id,
    maxMissions: journey.missionIds.length > 0 ? journey.missionIds.length : DEFAULT_MAX_MISSIONS,
  });

  const memories = await store.listMemories(journey.id);
  const missionsDerived = deriveMissionStates(missions, memories);
  const progress = journeyProgress(missionsDerived, memories);
  const activeMission = missionsDerived.find((mission) => mission.status === "active") ?? null;

  let storedJourney = journey;
  const derivedStatus = progress.complete ? "completed" : "active";
  if (journey.status !== derivedStatus) {
    storedJourney = { ...journey, status: derivedStatus };
    try {
      await store.saveJourney(storedJourney);
    } catch {
      // Repair is best-effort; the derived state already rules the UI.
    }
  }

  return {
    journey: storedJourney,
    city: bundle.city,
    places: bundle.places,
    missions: missionsDerived,
    memories,
    activeMission,
    progress,
    reasonLog,
  };
}
