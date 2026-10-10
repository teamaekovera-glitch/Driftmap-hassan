import { beforeEach, afterEach, describe, expect, it } from "vitest";
import {
  EXPORT_FORMAT,
  EXPORT_SCHEMA_VERSION,
  ImportError,
  StorageError,
  base64ToBlob,
  blobToBase64,
  closeDb,
  deleteJourney,
  exportAll,
  exportJourney,
  getJourney,
  getMeta,
  getPhoto,
  importAll,
  listJourneys,
  listMemories,
  saveJourney,
  saveMemory,
  setMeta,
  toStorageError,
  updateMemoryTheme,
  type DriftmapExport,
  type ImportErrorCode,
} from "./db";
import type { Journey, MemoryRecord, PhotoAsset } from "./types";

// ---------------------------------------------------------------------------
// Deterministic builders
// ---------------------------------------------------------------------------

let seq = 0;

function makeJourney(overrides: Partial<Journey> = {}): Journey {
  seq += 1;
  return {
    id: `journey-${seq}`,
    cityId: "kozhikode",
    personality: "curious",
    seed: 42,
    kind: "played",
    status: "active",
    missionIds: [`journey-${seq}--m0`],
    createdAt: 1_000_000 + seq * 1_000,
    ...overrides,
  };
}

function makeMemory(overrides: Partial<MemoryRecord> = {}): MemoryRecord {
  seq += 1;
  return {
    id: `memory-${seq}`,
    journeyId: "journey-test",
    missionId: "journey-test--m0",
    placeId: "kozhikode--mananchira-square",
    completedAt: 1_000_000 + seq * 1_000,
    verification: "player-confirmed",
    clue: "Find the tank at the city's heart.",
    caption: "You found something worth remembering.",
    theme: "discovery",
    ...overrides,
  };
}

function makePhoto(overrides: Partial<PhotoAsset> = {}): PhotoAsset {
  seq += 1;
  return {
    id: `photo-${seq}`,
    journeyId: "journey-test",
    blob: new Blob([new Uint8Array([1, 2, 3, seq % 256])], { type: "image/jpeg" }),
    width: 1600,
    height: 1200,
    createdAt: 1_000_000 + seq * 1_000,
    ...overrides,
  };
}

/** A memory and its photo share an id and a journey: one memory, one photo. */
function makeMemoryPhoto(
  journeyId: string,
  id: string,
  memoryOverrides: Partial<MemoryRecord> = {},
): { memory: MemoryRecord; photo: PhotoAsset } {
  const bytes = new Uint8Array(12).map((byte, slot) => (byte + slot * 31 + id.length) % 256);
  return {
    memory: makeMemory({ id, journeyId, missionId: `${journeyId}--m0`, ...memoryOverrides }),
    photo: makePhoto({ id, journeyId, blob: new Blob([bytes], { type: "image/jpeg" }) }),
  };
}

const EMPTY_EXPORT: DriftmapExport = {
  format: EXPORT_FORMAT,
  schemaVersion: EXPORT_SCHEMA_VERSION,
  exportedAt: 0,
  journeys: [],
  memories: [],
  photos: [],
};

// ---------------------------------------------------------------------------
// Each test starts from a closed connection and an empty store
// ---------------------------------------------------------------------------

beforeEach(async () => {
  await closeDb();
  await importAll(EMPTY_EXPORT);
});

afterEach(async () => {
  await closeDb();
});

// ---------------------------------------------------------------------------
// Journeys
// ---------------------------------------------------------------------------

describe("journey persistence", () => {
  it("round-trips a journey through save and get", async () => {
    const journey = makeJourney();
    await saveJourney(journey);
    expect(await getJourney(journey.id)).toEqual(journey);
  });

  it("upserts — saving the same id twice updates without duplicating", async () => {
    const journey = makeJourney({ id: "journey-x" });
    await saveJourney(journey);
    await saveJourney({ ...journey, status: "completed" });
    expect(await getJourney("journey-x")).toMatchObject({ status: "completed" });
    expect((await listJourneys()).map((entry) => entry.id)).toEqual(["journey-x"]);
  });

  it("lists journeys newest first", async () => {
    await saveJourney(makeJourney({ id: "older", createdAt: 1_000 }));
    await saveJourney(makeJourney({ id: "newer", createdAt: 2_000 }));
    expect((await listJourneys()).map((entry) => entry.id)).toEqual(["newer", "older"]);
  });

  it("skips non-conforming records when listing but surfaces them to get", async () => {
    await saveJourney(makeJourney({ id: "good", createdAt: 5_000 }));
    await saveJourney({ id: "bad" } as unknown as Journey);
    expect((await listJourneys()).map((entry) => entry.id)).toEqual(["good"]);
    // getJourney stays raw: the resume flow decides how to present a broken
    // journey instead of the browser silently pretending it vanished.
    expect(await getJourney("bad")).toMatchObject({ id: "bad" });
  });

  it("survives closing and reopening the database", async () => {
    const journey = makeJourney();
    await saveJourney(journey);
    await closeDb();
    expect(await getJourney(journey.id)).toEqual(journey);
  });

  it("keeps the schema version in the meta store", async () => {
    expect(await getMeta("schemaVersion")).toBe(1);
    await setMeta("lastExportedAt", 123);
    expect(await getMeta("lastExportedAt")).toBe(123);
  });
});

// ---------------------------------------------------------------------------
// Memories and photos
// ---------------------------------------------------------------------------

describe("memory and photo pipeline", () => {
  it("writes a memory and its photo so both come back intact", async () => {
    const journey = makeJourney({ id: "journey-a" });
    await saveJourney(journey);
    const { memory, photo } = makeMemoryPhoto("journey-a", "mem-a1");
    await saveMemory(memory, photo);

    const storedPhoto = await getPhoto("mem-a1");
    expect(storedPhoto).toBeDefined();
    expect(storedPhoto?.width).toBe(1600);
    expect(storedPhoto?.blob.type).toBe("image/jpeg");
    expect(new Uint8Array(await storedPhoto!.blob.arrayBuffer())).toEqual(
      new Uint8Array(await photo.blob.arrayBuffer()),
    );
    expect((await listMemories("journey-a")).map((entry) => entry.id)).toEqual(["mem-a1"]);
  });

  it("keeps photo bytes byte-for-byte through the store", async () => {
    const journey = makeJourney({ id: "journey-b" });
    await saveJourney(journey);
    // Binary-heavy pattern across the full byte range, repeated to a
    // realistic compressed-photo size.
    const bytes = new Uint8Array(300_000).map((byte, slot) => (byte + slot) % 256);
    const photo = makePhoto({ id: "mem-b1", journeyId: "journey-b", blob: new Blob([bytes], { type: "image/jpeg" }) });
    await saveMemory(makeMemory({ id: "mem-b1", journeyId: "journey-b" }), photo);

    const stored = await getPhoto("mem-b1");
    expect(stored?.blob.size).toBe(300_000);
    expect(new Uint8Array(await stored!.blob.arrayBuffer())).toEqual(bytes);
  });

  it("refuses a memory and photo that do not share an id", async () => {
    const memory = makeMemory({ id: "mem-1", journeyId: "journey-c" });
    const photo = makePhoto({ id: "mem-2", journeyId: "journey-c" });
    await expect(saveMemory(memory, photo)).rejects.toThrow(/share an id/);
  });

  it("refuses a memory and photo from different journeys", async () => {
    const memory = makeMemory({ id: "mem-1", journeyId: "journey-c" });
    const photo = makePhoto({ id: "mem-1", journeyId: "journey-d" });
    await expect(saveMemory(memory, photo)).rejects.toThrow(/same journey/);
  });

  it("sorts unknown-time memories last and never drops them", async () => {
    const journey = makeJourney({ id: "journey-t" });
    await saveJourney(journey);
    const pairs = [
      makeMemoryPhoto("journey-t", "mem-morning", { completedAt: 2_000 }),
      makeMemoryPhoto("journey-t", "mem-unknown", { completedAt: null }),
      makeMemoryPhoto("journey-t", "mem-earliest", { completedAt: 1_000 }),
    ];
    for (const { memory, photo } of pairs) {
      await saveMemory(memory, photo);
    }
    expect((await listMemories("journey-t")).map((entry) => entry.id)).toEqual([
      "mem-earliest",
      "mem-morning",
      "mem-unknown",
    ]);
  });
});

// ---------------------------------------------------------------------------
// Theme edits (user-editable moods)
// ---------------------------------------------------------------------------

describe("updateMemoryTheme", () => {
  it("changes a memory's theme without touching its photo", async () => {
    await saveJourney(makeJourney({ id: "journey-a" }));
    const { memory, photo } = makeMemoryPhoto("journey-a", "mem-a1");
    await saveMemory(memory, photo);
    const before = await getPhoto("mem-a1");

    const updated = await updateMemoryTheme("mem-a1", "food");

    expect(updated).toMatchObject({ id: "mem-a1", theme: "food" });
    expect(updated?.clue).toBe(memory.clue);
    const after = await getPhoto("mem-a1");
    expect(after).toEqual(before); // same blob — a theme edit never rewrites bytes
    expect((await listMemories("journey-a"))[0]?.theme).toBe("food");
  });

  it("returns undefined for a memory that does not exist", async () => {
    await saveJourney(makeJourney({ id: "journey-a" }));
    expect(await updateMemoryTheme("never-existed", "food")).toBeUndefined();
  });

  it("refuses a theme outside the vocabulary", async () => {
    await saveJourney(makeJourney({ id: "journey-a" }));
    const { memory, photo } = makeMemoryPhoto("journey-a", "mem-a1");
    await saveMemory(memory, photo);
    await expect(updateMemoryTheme("mem-a1", "vibes" as never)).rejects.toThrow(/Unknown theme/);
  });
});

// ---------------------------------------------------------------------------
// Cascade delete
// ---------------------------------------------------------------------------

describe("journey deletion", () => {
  it("removes a journey with its memories and photos, leaving others intact", async () => {
    await saveJourney(makeJourney({ id: "journey-a" }));
    await saveJourney(makeJourney({ id: "journey-b", createdAt: 9_000 }));
    for (const id of ["mem-a1", "mem-a2"]) {
      const { memory, photo } = makeMemoryPhoto("journey-a", id);
      await saveMemory(memory, photo);
    }
    const { memory, photo } = makeMemoryPhoto("journey-b", "mem-b1");
    await saveMemory(memory, photo);

    await deleteJourney("journey-a");

    expect(await getJourney("journey-a")).toBeUndefined();
    expect(await getPhoto("mem-a1")).toBeUndefined();
    expect(await getPhoto("mem-a2")).toBeUndefined();
    expect(await listMemories("journey-a")).toEqual([]);
    // journey-b is untouched
    expect(await getJourney("journey-b")).toMatchObject({ id: "journey-b" });
    expect(await getPhoto("mem-b1")).toBeDefined();
    expect(await listMemories("journey-b")).toHaveLength(1);
  });

  it("deleting an unknown journey is a no-op", async () => {
    await deleteJourney("never-existed");
    expect(await listJourneys()).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Export / import
// ---------------------------------------------------------------------------

describe("export", () => {
  it("produces the spec format with base64 photo payloads", async () => {
    const journey = makeJourney({ id: "journey-a" });
    await saveJourney(journey);
    const { memory, photo } = makeMemoryPhoto("journey-a", "mem-a1");
    await saveMemory(memory, photo);

    const exported = await exportAll();

    expect(exported.format).toBe("driftmap-export");
    expect(exported.schemaVersion).toBe(1);
    expect(typeof exported.exportedAt).toBe("number");
    expect(exported.journeys).toEqual([journey]);
    expect(exported.memories).toEqual([memory]);
    expect(exported.photos).toHaveLength(1);
    expect(exported.photos[0]).toMatchObject({
      id: "mem-a1",
      mime: "image/jpeg",
      journeyId: "journey-a",
      width: 1600,
      height: 1200,
    });
    const decoded = new Uint8Array(
      await base64ToBlob(exported.photos[0].base64, exported.photos[0].mime).arrayBuffer(),
    );
    expect(decoded).toEqual(new Uint8Array(await photo.blob.arrayBuffer()));
  });

  it("exports one journey's slice losslessly, leaving other journeys out", async () => {
    await saveJourney(makeJourney({ id: "journey-a" }));
    await saveJourney(makeJourney({ id: "journey-b", createdAt: 9_000 }));
    const { memory, photo } = makeMemoryPhoto("journey-a", "mem-a1");
    await saveMemory(memory, photo);
    const other = makeMemoryPhoto("journey-b", "mem-b1");
    await saveMemory(other.memory, other.photo);

    const slice = await exportJourney("journey-a");

    expect(slice.format).toBe("driftmap-export");
    expect(slice.schemaVersion).toBe(EXPORT_SCHEMA_VERSION);
    expect(slice.journeys.map((journey) => journey.id)).toEqual(["journey-a"]);
    expect(slice.memories.map((entry) => entry.id)).toEqual(["mem-a1"]);
    expect(slice.photos.map((entry) => entry.id)).toEqual(["mem-a1"]);
    const full = await exportAll();
    expect(slice.photos[0].base64).toBe(full.photos.find((entry) => entry.id === "mem-a1")?.base64);
  });

  it("exports an empty slice for a journey with no memories", async () => {
    await saveJourney(makeJourney({ id: "journey-empty" }));
    const slice = await exportJourney("journey-empty");
    expect(slice.journeys.map((journey) => journey.id)).toEqual(["journey-empty"]);
    expect(slice.memories).toEqual([]);
    expect(slice.photos).toEqual([]);
  });
});

describe("import", () => {
  it("restores an export losslessly", async () => {
    const journeyA = makeJourney({ id: "journey-a" });
    const journeyB = makeJourney({ id: "journey-b", createdAt: journeyA.createdAt + 1_000 });
    await saveJourney(journeyA);
    await saveJourney(journeyB);
    const withCoords = makeMemoryPhoto("journey-a", "mem-a1", {
      coords: [75.7804, 11.2543],
      note: "Looked up, finally.",
    });
    await saveMemory(withCoords.memory, withCoords.photo);
    const noClock = makeMemoryPhoto("journey-b", "mem-b1", { completedAt: null });
    await saveMemory(noClock.memory, noClock.photo);

    const first = await exportAll();
    await importAll(first);
    const second = await exportAll();

    expect(second.journeys).toEqual(first.journeys);
    expect(second.memories).toEqual(first.memories);
    expect(second.photos).toEqual(first.photos);
    expect(await getMeta("schemaVersion")).toBe(1);
  });

  it("reports what it restored", async () => {
    const journey = makeJourney({ id: "journey-a" });
    await saveJourney(journey);
    const { memory, photo } = makeMemoryPhoto("journey-a", "mem-a1");
    await saveMemory(memory, photo);
    const exported = await exportAll();

    await importAll(EMPTY_EXPORT);
    expect(await listJourneys()).toEqual([]);

    const summary = await importAll(exported);
    expect(summary).toEqual({ journeys: 1, memories: 1, photos: 1 });
    expect((await listJourneys()).map((entry) => entry.id)).toEqual(["journey-a"]);
  });

  it("replaces existing contents on import", async () => {
    const journeyA = makeJourney({ id: "journey-a" });
    await saveJourney(journeyA);
    const exported = await exportAll();
    await saveJourney(makeJourney({ id: "journey-b", createdAt: 9_000 }));

    await importAll(exported);

    expect((await listJourneys()).map((entry) => entry.id)).toEqual(["journey-a"]);
  });

  it("recovers an empty store via an empty import", async () => {
    await saveJourney(makeJourney({ id: "journey-a" }));
    const summary = await importAll(EMPTY_EXPORT);
    expect(summary).toEqual({ journeys: 0, memories: 0, photos: 0 });
    expect(await listJourneys()).toEqual([]);
  });

  it("accepts a minimal photo entry by deriving the journey from its memory", async () => {
    const journey = makeJourney({ id: "journey-a" });
    await saveJourney(journey);
    const { memory, photo } = makeMemoryPhoto("journey-a", "mem-a1");
    await saveMemory(memory, photo);
    const exported = await exportAll();
    // The spec's minimal photo shape: id, mime, base64 only.
    await importAll({
      ...exported,
      journeys: [journey],
      memories: [memory],
      photos: [{ id: "mem-a1", mime: "image/jpeg", base64: exported.photos[0].base64 }],
    });
    const restored = await getPhoto("mem-a1");
    expect(restored).toMatchObject({ id: "mem-a1", journeyId: "journey-a" });
    expect(new Uint8Array(await restored!.blob.arrayBuffer())).toEqual(
      new Uint8Array(await photo.blob.arrayBuffer()),
    );
  });
});

describe("import rejection", () => {
  async function expectImportError(data: unknown, code: ImportErrorCode): Promise<ImportError> {
    try {
      await importAll(data);
    } catch (error) {
      expect(error).toBeInstanceOf(ImportError);
      expect((error as ImportError).code).toBe(code);
      return error as ImportError;
    }
    throw new Error(`importAll should have rejected with ${code}`);
  }

  function validEnvelope(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      format: EXPORT_FORMAT,
      schemaVersion: EXPORT_SCHEMA_VERSION,
      journeys: [],
      memories: [],
      photos: [],
      ...overrides,
    };
  }

  it("rejects files that are not a Driftmap export", async () => {
    await expectImportError(null, "bad-format");
    await expectImportError("driftmap", "bad-format");
    await expectImportError({ format: "photos-backup", schemaVersion: 1 }, "bad-format");
  });

  it("rejects unknown schema versions with a visible message", async () => {
    const error = await expectImportError(validEnvelope({ schemaVersion: 999 }), "bad-version");
    expect(error.message).toContain("999");
    expect(error.message).toContain(String(EXPORT_SCHEMA_VERSION));
  });

  it("rejects damaged payloads", async () => {
    await expectImportError({ format: EXPORT_FORMAT, schemaVersion: EXPORT_SCHEMA_VERSION }, "bad-payload");
    await expectImportError(validEnvelope({ journeys: [{ id: "x" }] }), "bad-payload");
    await expectImportError(
      validEnvelope({ journeys: [makeJourney({ id: "j" })], memories: [makeMemory({ id: "m", journeyId: "elsewhere" })] }),
      "bad-payload",
    );
    await expectImportError(
      validEnvelope({
        journeys: [makeJourney({ id: "j" })],
        photos: [{ id: "p", mime: "text/plain", base64: "aGVsbG8=" }],
      }),
      "bad-payload",
    );
    await expectImportError(
      validEnvelope({
        journeys: [makeJourney({ id: "j" })],
        photos: [{ id: "p", mime: "image/jpeg", base64: "not base64!!" }],
      }),
      "bad-payload",
    );
  });

  it("rejects duplicates", async () => {
    const journey = makeJourney({ id: "journey-a" });
    await expectImportError(validEnvelope({ journeys: [journey, journey] }), "bad-payload");
    const memory = makeMemory({ id: "mem-a1", journeyId: "journey-a" });
    await expectImportError(validEnvelope({ journeys: [journey], memories: [memory, memory] }), "bad-payload");
  });

  it("never partially applies a failed import", async () => {
    const journey = makeJourney({ id: "journey-good" });
    await saveJourney(journey);
    const { memory, photo } = makeMemoryPhoto("journey-good", "mem-good");
    await saveMemory(memory, photo);

    await expectImportError(validEnvelope({ journeys: [{ id: "broken" }] }), "bad-payload");

    expect((await listJourneys()).map((entry) => entry.id)).toEqual(["journey-good"]);
    expect(await getPhoto("mem-good")).toBeDefined();
    expect(await listMemories("journey-good")).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Typed failures
// ---------------------------------------------------------------------------

describe("storage errors", () => {
  it("maps quota failures onto the renderable quota-exceeded state", () => {
    const mapped = toStorageError(new DOMException("too big", "QuotaExceededError"));
    expect(mapped).toBeInstanceOf(StorageError);
    expect(mapped.code).toBe("quota-exceeded");
    expect(mapped.message).toMatch(/export/i); // carries the recovery guidance
  });

  it("maps unknown failures onto unavailable", () => {
    const mapped = toStorageError(new Error("boom"));
    expect(mapped).toBeInstanceOf(StorageError);
    expect(mapped.code).toBe("unavailable");
    expect(mapped.cause).toBeDefined();
  });

  it("leaves already-typed storage errors untouched", () => {
    const original = new StorageError("unavailable", "already typed");
    expect(toStorageError(original)).toBe(original);
  });
});

// ---------------------------------------------------------------------------
// Base64
// ---------------------------------------------------------------------------

describe("base64 codecs", () => {
  it("round-trips binary across the full byte range", async () => {
    const bytes = new Uint8Array(100_000).map((byte, slot) => (byte + slot * 7 + (slot % 253)) % 256);
    const blob = new Blob([bytes], { type: "image/jpeg" });
    const restored = base64ToBlob(await blobToBase64(blob), "image/jpeg");
    expect(restored.type).toBe("image/jpeg");
    expect(restored.size).toBe(bytes.length);
    expect(new Uint8Array(await restored.arrayBuffer())).toEqual(bytes);
  });

  it("decodes a known payload", () => {
    expect(base64ToBlob("aGVsbG8=", "text/plain").size).toBe(5);
  });
});
