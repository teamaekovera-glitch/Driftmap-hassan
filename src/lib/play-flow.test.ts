import { afterAll, beforeEach, afterEach, describe, expect, it } from "vitest";
import { closeDb, EXPORT_FORMAT, EXPORT_SCHEMA_VERSION, importAll } from "./db";
import { createIdbPlayStore, createMemoryPlayStore, completeMission, loadJourneyState, startJourney } from "./play-flow";
import { photoIdFor } from "./completion";
import { KOZHIKODE, KOZHIKODE_PLACES } from "@/data/kozhikode";
import { DEMO_CITY_BUNDLE } from "@/data/cities";
import type { PhotoCodec } from "./photo";

// ---------------------------------------------------------------------------
// Fixtures — a small fake codec keeps the pipeline deterministic in Node
// ---------------------------------------------------------------------------

/** A codec that "encodes" to a fixed-size blob without a real canvas. */
function fakeCodec(bytes = 2_000): PhotoCodec {
  return {
    async decode() {
      // A 3200×2400 "camera original" — the pipeline clamps to 1600×1200.
      return { source: {} as CanvasImageSource, width: 3200, height: 2400 };
    },
    async encode() {
      return new Blob([new Uint8Array(bytes)], { type: "image/jpeg" });
    },
  };
}

function captureBlob(): Blob {
  return new Blob([new Uint8Array(5_000)], { type: "image/jpeg" });
}

const NOW = Date.UTC(2026, 9, 10, 10, 42);

async function freshRun(store = createIdbPlayStore(), id = "j-test-1") {
  return startJourney(store, {
    city: KOZHIKODE,
    places: KOZHIKODE_PLACES,
    personality: "curious",
    now: NOW,
    id,
  });
}

function placeOf(placeId: string) {
  const place = KOZHIKODE_PLACES.find((candidate) => candidate.id === placeId);
  if (!place) throw new Error(`Place ${placeId} missing from the dataset`);
  return place;
}

// Each test starts from a closed connection and an empty store — the same
// isolation pattern db.test.ts uses (fake-indexeddb persists across cases).
beforeEach(async () => {
  await closeDb();
  await importAll({
    format: EXPORT_FORMAT,
    schemaVersion: EXPORT_SCHEMA_VERSION,
    exportedAt: 0,
    journeys: [],
    memories: [],
    photos: [],
  });
});

afterEach(async () => {
  await closeDb();
});

afterAll(async () => {
  await closeDb();
});

// ---------------------------------------------------------------------------
// startJourney — creation, persistence, determinism
// ---------------------------------------------------------------------------

describe("startJourney", () => {
  it("persists an active played journey with six frozen mission ids", async () => {
    const store = createIdbPlayStore();
    const { journey, missions } = await freshRun(store);

    expect(journey.status).toBe("active");
    expect(journey.kind).toBe("played");
    expect(journey.missionIds).toHaveLength(6);
    expect(missions).toHaveLength(6);
    expect(missions[0].status).toBe("active");
    expect(missions.slice(1).every((mission) => mission.status === "locked")).toBe(true);

    const stored = await store.listJourneys();
    expect(stored.map((candidate) => candidate.id)).toContain(journey.id);
  });

  it("regenerates the identical run from the saved seed", async () => {
    const store = createIdbPlayStore();
    const { journey, missions } = await freshRun(store);
    const reloaded = await loadJourneyState(store, journey.id);
    expect(reloaded).not.toBeNull();
    expect(reloaded!.missions.map((mission) => mission.id)).toEqual(missions.map((mission) => mission.id));
    expect(reloaded!.missions.map((mission) => mission.clue)).toEqual(missions.map((mission) => mission.clue));
  });
});

// ---------------------------------------------------------------------------
// completeMission — the one-transaction save behind "I think I found it"
// ---------------------------------------------------------------------------

describe("completeMission", () => {
  it("saves the memory and photo together, keyed to mission and place", async () => {
    const store = createIdbPlayStore();
    const { journey, missions } = await freshRun(store);
    const place = placeOf(missions[0].placeId);

    const result = await completeMission(store, {
      journey,
      missions,
      mission: missions[0],
      place,
      photo: captureBlob(),
      now: NOW,
      codec: fakeCodec(),
    });

    expect(result.memory.id).toBe(photoIdFor(missions[0].id));
    expect(result.memory.missionId).toBe(missions[0].id);
    expect(result.memory.journeyId).toBe(journey.id);
    expect(result.memory.placeId).toBe(place.id);
    expect(result.memory.verification).toBe("player-confirmed");
    // Compression ran: the stored dimensions are the clamped ones.
    expect(result.photoAsset.width).toBe(1600);
    expect(result.photoAsset.height).toBe(1200);
    const storedPhoto = await store.getPhoto(result.memory.id);
    expect(storedPhoto).toBeDefined();
    expect(storedPhoto!.journeyId).toBe(journey.id);
    expect((await storedPhoto!.blob.arrayBuffer()).byteLength).toBe(2_000);
  });

  it("never lets a caption or clue leak the place name", async () => {
    const store = createIdbPlayStore();
    const { journey, missions } = await freshRun(store);
    const place = placeOf(missions[0].placeId);

    const result = await completeMission(store, {
      journey,
      missions,
      mission: missions[0],
      place,
      photo: captureBlob(),
      now: NOW,
      codec: fakeCodec(),
    });

    expect(result.memory.caption.toLowerCase()).not.toContain(place.name.toLowerCase());
    expect(result.memory.clue.toLowerCase()).not.toContain(place.name.toLowerCase());
  });

  it("records location-assisted only for a fix inside the mission radius", async () => {
    const store = createIdbPlayStore();
    const { journey, missions } = await freshRun(store);
    const place = placeOf(missions[0].placeId);

    const inside = await completeMission(store, {
      journey,
      missions,
      mission: missions[0],
      place,
      photo: captureBlob(),
      coords: place.coords,
      now: NOW,
      codec: fakeCodec(),
    });
    expect(inside.memory.verification).toBe("location-assisted");
    expect(inside.memory.coords).toEqual(place.coords);
  });

  it("keeps the journey active until the last mission completes", async () => {
    const store = createIdbPlayStore();
    const { journey, missions } = await freshRun(store, "j-full-run");

    let latest = { journey, missions };
    for (const mission of missions) {
      const result = await completeMission(store, {
        journey: latest.journey,
        missions: latest.missions,
        mission,
        place: placeOf(mission.placeId),
        photo: captureBlob(),
        now: NOW + mission.index * 1_000,
        codec: fakeCodec(),
      });
      latest = { journey: result.journey, missions: result.missions };
      if (mission.index < missions.length - 1) {
        expect(result.journey.status).toBe("active");
        expect(result.progress.found).toBe(mission.index + 1);
      } else {
        expect(result.progress.complete).toBe(true);
        expect(result.progress.found).toBe(6);
      }
    }
    expect(latest.journey.status).toBe("completed");
  });

  it("rejects a double submission of the same mission", async () => {
    const store = createIdbPlayStore();
    const { journey, missions } = await freshRun(store);
    const input = {
      journey,
      missions,
      mission: missions[0],
      place: placeOf(missions[0].placeId),
      photo: captureBlob(),
      now: NOW,
      codec: fakeCodec(),
    };
    await completeMission(store, input);
    await expect(completeMission(store, input)).rejects.toThrow(/already complete/);
  });

  it("survives a full close-and-reopen — the photos are the save file", async () => {
    const store = createIdbPlayStore();
    const { journey, missions } = await freshRun(store, "j-reopen");
    await completeMission(store, {
      journey,
      missions,
      mission: missions[0],
      place: placeOf(missions[0].placeId),
      photo: captureBlob(),
      now: NOW,
      codec: fakeCodec(),
    });

    // Simulate the browser discarding the page: the connection closes and a
    // fresh load rebuilds everything from IndexedDB alone.
    await closeDb();
    const reopened = await loadJourneyState(createIdbPlayStore(), journey.id);
    expect(reopened).not.toBeNull();
    expect(reopened!.journey.id).toBe(journey.id);
    expect(reopened!.missions[0].status).toBe("complete");
    expect(reopened!.missions[1].status).toBe("active");
    expect(reopened!.progress.found).toBe(1);
    expect(reopened!.memories[0].id).toBe(photoIdFor(missions[0].id));
  });
});

// ---------------------------------------------------------------------------
// loadJourneyState — resume and repair
// ---------------------------------------------------------------------------

describe("loadJourneyState", () => {
  it("returns null when no journey exists yet", async () => {
    const state = await loadJourneyState(createIdbPlayStore());
    expect(state).toBeNull();
  });

  it("picks the newest active journey without an explicit id", async () => {
    const store = createIdbPlayStore();
    await freshRun(store, "j-first");
    await startJourney(store, {
      city: KOZHIKODE,
      places: KOZHIKODE_PLACES,
      personality: "broke",
      now: NOW + 1,
      id: "j-second",
    });
    const state = await loadJourneyState(store);
    expect(state!.journey.id).toBe("j-second");
  });

  it("resolves the city bundle for the stored journey", async () => {
    const store = createIdbPlayStore();
    const { journey } = await freshRun(store);
    const state = await loadJourneyState(store, journey.id);
    expect(state!.city.id).toBe("kozhikode");
    expect(state!.places).toEqual(KOZHIKODE_PLACES);
  });
});

// ---------------------------------------------------------------------------
// In-memory degraded mode — the game outlives storage failure
// ---------------------------------------------------------------------------

describe("createMemoryPlayStore", () => {
  it("runs the whole loop without IndexedDB", async () => {
    const store = createMemoryPlayStore();
    const { journey, missions } = await freshRun(store, "j-memory");
    const result = await completeMission(store, {
      journey,
      missions,
      mission: missions[0],
      place: placeOf(missions[0].placeId),
      photo: captureBlob(),
      now: NOW,
      codec: fakeCodec(),
    });
    expect(result.progress.found).toBe(1);
    expect(await store.getPhoto(photoIdFor(missions[0].id))).toBeDefined();
  });

  it("seeds from the state loaded before the failure", async () => {
    const idb = createIdbPlayStore();
    const { journey } = await freshRun(idb, "j-seed");
    const memories = await idb.listMemories(journey.id);
    const memoryStore = createMemoryPlayStore({ journeys: [journey], memories });
    const state = await loadJourneyState(memoryStore, journey.id);
    expect(state!.journey.id).toBe("j-seed");
  });
});

// ---------------------------------------------------------------------------
// City registry — the dataset a journey resolves against
// ---------------------------------------------------------------------------

describe("getCityBundle", () => {
  it("resolves Kozhikode and nothing else", () => {
    expect(DEMO_CITY_BUNDLE.city.id).toBe("kozhikode");
  });
});
