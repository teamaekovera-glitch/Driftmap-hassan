/**
 * The demo journey's contract — the judge's first minute, made checkable:
 * the run is a deterministic engine output, every stop has a bundled photo
 * actually present in `public/demo/`, seeding is idempotent and never
 * touches player journeys, and the store the seeder writes replays into a
 * complete film with no network.
 */

import { describe, expect, it } from "vitest";
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { DEMO_PHOTO_SOURCES } from "@/data/demo-photos";
import { DEMO_CITY_BUNDLE, getCityBundle } from "@/data/cities";
import { KOZHIKODE, KOZHIKODE_PLACES } from "@/data/kozhikode";
import { photoIdFor } from "./completion";
import { buildScenes } from "./replay";
import {
  DEMO_AFTERNOON_BASE,
  DEMO_JOURNEY_ID,
  DEMO_JOURNEY_TITLE,
  DEMO_PERSONALITY,
  DEMO_SEED,
  buildDemoRun,
  demoPhotoPlaces,
  ensureDemoJourney,
  type DemoPhotoSpec,
  type DemoStore,
} from "./demo-journey";
import type { Journey, MemoryRecord, PhotoAsset } from "./types";

const RUN = buildDemoRun(DEMO_CITY_BUNDLE);

/**
 * An in-memory DemoStore with write counters — the seeder's idempotence is
 * observable as "the second call performs zero writes", not just as equal
 * state that could mask a destructive rewrite.
 */
function makeMemoryDemoStore(seed: { journeys?: Journey[]; memories?: MemoryRecord[]; photos?: PhotoAsset[] } = {}) {
  const journeys = new Map((seed.journeys ?? []).map((journey) => [journey.id, journey]));
  const memories = new Map((seed.memories ?? []).map((memory) => [memory.id, memory]));
  const photos = new Map((seed.photos ?? []).map((photo) => [photo.id, photo]));
  const writes = { journeys: 0, memories: 0, deletes: 0 };
  const store: DemoStore = {
    async saveJourney(journey) {
      writes.journeys += 1;
      journeys.set(journey.id, journey);
    },
    async listJourneys() {
      return [...journeys.values()];
    },
    async listMemories(journeyId) {
      const all = [...memories.values()];
      return journeyId ? all.filter((memory) => memory.journeyId === journeyId) : all;
    },
    async getPhoto(id) {
      return photos.get(id);
    },
    async saveMemory(memory, photo) {
      writes.memories += 1;
      memories.set(memory.id, memory);
      photos.set(photo.id, photo);
    },
    async deleteJourney(id) {
      writes.deletes += 1;
      journeys.delete(id);
      for (const [memoryId, memory] of memories) {
        if (memory.journeyId === id) memories.delete(memoryId);
      }
      for (const [photoId, photo] of photos) {
        if (photo.journeyId === id) photos.delete(photoId);
      }
    },
  };
  return { store, journeys, memories, photos, writes };
}

/** A fake bundled-photo loader: deterministic bytes keyed by asset URL. */
function fakePhotoLoader(): (spec: DemoPhotoSpec) => Promise<Blob> {
  return async (spec) =>
    new Blob([new Uint8Array(24).map((byte, slot) => (byte + spec.url.length + slot) % 256)], {
      type: "image/jpeg",
    });
}

// ---------------------------------------------------------------------------
// The pure run
// ---------------------------------------------------------------------------

describe("buildDemoRun", () => {
  it("is deterministic — two builds at the fixed seed are identical", () => {
    expect(buildDemoRun(DEMO_CITY_BUNDLE)).toEqual(RUN);
  });

  it("is a completed six-stop demo run with aligned records", () => {
    expect(RUN.journey).toMatchObject({
      id: DEMO_JOURNEY_ID,
      cityId: "kozhikode",
      personality: DEMO_PERSONALITY,
      seed: DEMO_SEED,
      kind: "demo",
      status: "completed",
    });
    expect(RUN.journey.missionIds).toHaveLength(6);
    expect(RUN.missions).toHaveLength(6);
    expect(RUN.memories).toHaveLength(6);
    expect(RUN.photos).toHaveLength(6);
    expect(RUN.missions.map((mission) => mission.id)).toEqual(RUN.journey.missionIds);
    expect(RUN.missions.map((mission) => mission.journeyId)).toEqual(
      Array(6).fill(DEMO_JOURNEY_ID),
    );
  });

  it("stops exactly at the photo-backed places, never duplicating one", () => {
    const expected = demoPhotoPlaces(KOZHIKODE_PLACES).map((place) => place.id);
    expect(expected.length).toBeGreaterThanOrEqual(6);
    expect(RUN.missions.map((mission) => mission.placeId).sort()).toEqual([...expected].sort());
    expect(new Set(RUN.missions.map((mission) => mission.placeId)).size).toBe(6);
  });

  it("spreads honest, ordered timestamps across one afternoon", () => {
    const times = RUN.memories.map((memory) => memory.completedAt);
    expect(times.every((time) => time !== null)).toBe(true);
    for (let index = 1; index < times.length; index += 1) {
      expect(times[index]).toBeGreaterThan(times[index - 1] as number);
    }
    const spanMinutes = ((times[5] as number) - (times[0] as number)) / 60_000;
    expect(spanMinutes).toBeGreaterThanOrEqual(120); // a real afternoon, not a time crash
    expect(spanMinutes).toBeLessThanOrEqual(360);
    expect(new Date(times[0] as number).getUTCDate()).toBe(
      new Date(times[5] as number).getUTCDate(),
    );
    expect(RUN.memories.every((memory) => memory.verification === "player-confirmed")).toBe(true);
    expect(RUN.memories.every((memory) => memory.clue.length > 0)).toBe(true);
    expect(RUN.memories.every((memory) => memory.caption.length > 0)).toBe(true);
    expect(RUN.memories[0]?.completedAt).toBe(DEMO_AFTERNOON_BASE);
  });

  it("carries a reason line per stop (the personality's own explanation)", () => {
    // The engine's log: one eligibility summary, then one line per mission.
    expect(RUN.reasonLog).toHaveLength(RUN.missions.length + 1);
    expect(RUN.reasonLog.every((line) => line.length > 0)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Asset wiring — manifest ↔ dataset ↔ public/demo files
// ---------------------------------------------------------------------------

describe("demo photo wiring", () => {
  it("titles and seeds come from the spec, not ad hoc", () => {
    expect(DEMO_JOURNEY_TITLE).toContain("Kozhikode");
    expect(DEMO_SEED).toBe(20261010);
  });

  it("gives every dataset demoPhotoId a manifest entry pointing at a real bundled file", () => {
    const repoRoot = process.cwd();
    for (const place of demoPhotoPlaces(KOZHIKODE_PLACES)) {
      const demoPhotoId = place.demoPhotoId as string;
      const source = DEMO_PHOTO_SOURCES[demoPhotoId];
      expect(source, `manifest entry for ${demoPhotoId}`).toBeDefined();
      const file = join(repoRoot, "public", source.url);
      expect(existsSync(file), `${source.url} exists`).toBe(true);
      expect(statSync(file).size).toBeGreaterThan(10_000);
      const longEdge = Math.max(source.width, source.height);
      expect(longEdge).toBeLessThanOrEqual(1600); // the photo pipeline's convention
      expect(source.width).toBeGreaterThan(0);
      expect(source.height).toBeGreaterThan(0);
    }
  });

  it("gives every demo stop a photo spec backed by the same-named file", () => {
    for (const spec of RUN.photos) {
      const source = Object.values(DEMO_PHOTO_SOURCES).find((entry) => entry.url === spec.url);
      expect(source, `bundled file for ${spec.url}`).toBeDefined();
      expect(spec.width).toBe(source!.width);
      expect(spec.height).toBe(source!.height);
    }
  });

  it("derives every photo id from its mission — one memory, one photo", () => {
    expect(RUN.photos.map((spec) => spec.id)).toEqual(
      RUN.missions.map((mission) => photoIdFor(mission.id)),
    );
  });
});

// ---------------------------------------------------------------------------
// Idempotent seeding
// ---------------------------------------------------------------------------

describe("ensureDemoJourney", () => {
  it("seeds once, then short-circuits with zero writes", async () => {
    const { store, journeys, memories, photos, writes } = makeMemoryDemoStore();

    const first = await ensureDemoJourney(store, fakePhotoLoader(), DEMO_CITY_BUNDLE);
    expect(first.status).toBe("created");
    expect(journeys.has(DEMO_JOURNEY_ID)).toBe(true);
    expect(memories.size).toBe(6);
    expect(photos.size).toBe(6);
    expect(writes.journeys).toBe(1);
    expect(writes.memories).toBe(6);

    const snapshot = {
      journeys: [...journeys.values()],
      memories: [...memories.values()],
      photos: [...photos.values()],
    };
    const second = await ensureDemoJourney(store, fakePhotoLoader(), DEMO_CITY_BUNDLE);
    expect(second.status).toBe("existing");
    expect(writes.journeys).toBe(1); // no rewrite on the second call
    expect(writes.memories).toBe(6);
    expect(writes.deletes).toBe(0);
    expect([...journeys.values()]).toEqual(snapshot.journeys);
    expect([...memories.values()]).toEqual(snapshot.memories);
    expect([...photos.values()]).toEqual(snapshot.photos);
  });

  it("seeds the full run through the real IndexedDB layer", async () => {
    const { closeDb, importAll, listJourneys, listMemories, getPhoto } =
      await import("./db");
    const { EXPORT_FORMAT, EXPORT_SCHEMA_VERSION } = await import("./db");
    await closeDb();
    await importAll({
      format: EXPORT_FORMAT,
      schemaVersion: EXPORT_SCHEMA_VERSION,
      exportedAt: 0,
      journeys: [],
      memories: [],
      photos: [],
    });

    const { createIdbDemoStore } = await import("./demo-journey");
    const outcome = await ensureDemoJourney(createIdbDemoStore(), fakePhotoLoader(), DEMO_CITY_BUNDLE);
    expect(outcome.status).toBe("created");

    const allJourneys = await listJourneys();
    expect(allJourneys.map((journey) => journey.id)).toContain(DEMO_JOURNEY_ID);
    const stored = await listMemories(DEMO_JOURNEY_ID);
    expect(stored).toHaveLength(6);
    for (const memory of stored) {
      const photo = await getPhoto(memory.id);
      expect(photo).toBeDefined();
      expect(photo?.journeyId).toBe(DEMO_JOURNEY_ID);
      expect(photo?.blob.size).toBeGreaterThan(0);
    }
    expect(await listJourneys()).toEqual(allJourneys); // a second seed adds nothing
  });

  it("repairs a partial seed instead of failing or duplicating", async () => {
    const { store, memories, photos } = makeMemoryDemoStore();
    await ensureDemoJourney(store, fakePhotoLoader(), DEMO_CITY_BUNDLE);

    // Simulate an interrupted seed: one memory and its photo vanished.
    const lostMemory = RUN.memories[2]!;
    memories.delete(lostMemory.id);
    photos.delete(lostMemory.id);

    const outcome = await ensureDemoJourney(store, fakePhotoLoader(), DEMO_CITY_BUNDLE);
    expect(outcome.status).toBe("created");
    expect(memories.size).toBe(6);
    expect(photos.size).toBe(6);
    expect(memories.get(lostMemory.id)).toBeDefined();
  });

  it("never overwrites player journeys — the demo shares the store, not the data", async () => {
    const playedJourney: Journey = {
      id: "j-player-1",
      cityId: "kozhikode",
      personality: "broke",
      seed: 99,
      kind: "played",
      status: "active",
      missionIds: ["j-player-1--m0"],
      createdAt: 1_111_111,
    };
    const playedMemory: MemoryRecord = {
      id: "j-player-1--m0--photo",
      journeyId: "j-player-1",
      missionId: "j-player-1--m0",
      placeId: "kozhikode--mananchira-square",
      completedAt: 1_222_222,
      verification: "player-confirmed",
      clue: "A clue the player earned.",
      caption: "A caption the player earned.",
      theme: "discovery",
    };
    const playedPhoto: PhotoAsset = {
      id: playedMemory.id,
      journeyId: "j-player-1",
      blob: new Blob([new Uint8Array([9, 9, 9])], { type: "image/jpeg" }),
      width: 800,
      height: 600,
      createdAt: 1_222_222,
    };
    const { store, journeys, memories, photos } = makeMemoryDemoStore({
      journeys: [playedJourney],
      memories: [playedMemory],
      photos: [playedPhoto],
    });

    await ensureDemoJourney(store, fakePhotoLoader(), DEMO_CITY_BUNDLE);

    expect(journeys.get("j-player-1")).toEqual(playedJourney);
    expect(memories.get(playedMemory.id)).toEqual(playedMemory);
    expect(photos.get(playedPhoto.id)).toEqual(playedPhoto);
    expect(journeys.size).toBe(2);
    expect(memories.size).toBe(7); // the player's plus the demo's six
  });

  it("re-seeds on the next explicit request after the demo was deleted", async () => {
    const { store, journeys, memories, photos } = makeMemoryDemoStore();
    await ensureDemoJourney(store, fakePhotoLoader(), DEMO_CITY_BUNDLE);
    await store.deleteJourney(DEMO_JOURNEY_ID); // cascades memories and photos
    expect(journeys.size).toBe(0);

    const outcome = await ensureDemoJourney(store, fakePhotoLoader(), DEMO_CITY_BUNDLE);
    expect(outcome.status).toBe("created");
    expect(memories.size).toBe(6);
    expect(photos.size).toBe(6);
  });
});

// ---------------------------------------------------------------------------
// The demo replays offline — scenes derive purely from the seeded store
// ---------------------------------------------------------------------------

describe("demo replay", () => {
  it("builds a complete film from the seeded records alone", () => {
    const scenes = buildScenes(RUN.journey, RUN.memories, KOZHIKODE_PLACES, KOZHIKODE);

    // title → stop/route pairs → finale
    expect(scenes[0]?.kind).toBe("title");
    expect(scenes.at(-1)?.kind).toBe("finale");

    const stops = scenes.filter((scene) => scene.kind === "stop");
    const routes = scenes.filter((scene) => scene.kind === "route");
    expect(stops).toHaveLength(6);
    expect(routes).toHaveLength(5);

    const photoIds = new Set(RUN.photos.map((spec) => spec.id));
    const memoryIds = new Set(RUN.memories.map((memory) => memory.id));
    for (const scene of stops) {
      if (scene.kind !== "stop") continue;
      expect(memoryIds.has(scene.memoryId)).toBe(true);
      expect(photoIds.has(scene.photoId)).toBe(true); // every stop shows its bundled photo
      expect(scene.timeLabel.length).toBeGreaterThan(0);
      expect(scene.clue.length).toBeGreaterThan(0);
      expect(scene.caption.length).toBeGreaterThan(0);
    }

    const finale = scenes.at(-1);
    if (finale?.kind === "finale") {
      expect(finale.stopCount).toBe(6);
      expect(finale.totalDistanceKm).toBeGreaterThan(0);
      expect(finale.durationLabel).not.toBeNull(); // clock-trusted timestamps
    }
  });

  it("works from any bundle resolution path (getCityBundle resolves the demo city)", () => {
    const bundle = getCityBundle(RUN.journey.cityId);
    expect(bundle).toBeDefined();
    expect(buildDemoRun(bundle!).journey).toEqual(RUN.journey);
  });
});
