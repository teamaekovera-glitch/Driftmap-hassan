/**
 * Driftmap persistence — IndexedDB only, versioned, exportable.
 *
 * Design rules from the build spec:
 * - Photos live here as compressed Blobs, never in localStorage.
 * - `saveMemory` writes a memory and its photo in ONE transaction: the photo
 *   is the save file, and a half-written save would be a lost memory.
 * - `deleteJourney` cascades: journey, its memories, its photos, atomically.
 * - Export/import is a lossless copy of the same store, not a second data
 *   path. Import validates the format tag and schema version, rejects
 *   anything unknown with a message the UI can render, and never partially
 *   applies a failed import (validation runs before any write; the writes
 *   themselves are one transaction).
 * - Failures are typed (`StorageError` / `ImportError`) so the UI can render
 *   guidance — quota and private-mode states are designed states, not error
 *   dumps. Reads skip invalid records rather than crashing the browser.
 *
 * The meta store is bookkeeping only (schema version, last-export markers);
 * it is deliberately not part of the export payload.
 */

import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import { PERSONALITY_IDS, THEME_IDS, type Journey, type MemoryRecord, type PhotoAsset } from "./types";

const DB_NAME = "driftmap";

/** Bump only with a migration plan; imports of older versions are rejected. */
export const SCHEMA_VERSION = 1;

export interface MetaEntry {
  key: string;
  value: unknown;
}

interface DriftmapDB extends DBSchema {
  journeys: { key: string; value: Journey };
  memories: {
    key: string;
    value: MemoryRecord;
    indexes: { "by-journey": string };
  };
  photos: {
    key: string;
    value: PhotoAsset;
    indexes: { "by-journey": string };
  };
  meta: { key: string; value: MetaEntry };
}

type DriftmapDatabase = IDBPDatabase<DriftmapDB>;

// ---------------------------------------------------------------------------
// Typed errors
// ---------------------------------------------------------------------------

/**
 * Environment-level storage failures the UI must render:
 * - `quota-exceeded`: storage is full or blocked (private mode). The message
 *   carries the recovery guidance (export your journey) the spec requires.
 * - `unavailable`: IndexedDB itself is missing or refused to open.
 */
export type StorageErrorCode = "quota-exceeded" | "unavailable" | ImportErrorCode;

export class StorageError extends Error {
  readonly code: StorageErrorCode;

  constructor(code: StorageErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "StorageError";
    this.code = code;
  }
}

/** Import-payload failures: the file exists but is not a loadable export. */
export type ImportErrorCode = "bad-format" | "bad-version" | "bad-payload";

export class ImportError extends StorageError {
  constructor(code: ImportErrorCode, message: string, options?: ErrorOptions) {
    super(code, message, options);
    this.name = "ImportError";
  }
}

/** Map raw IndexedDB/DOM failures onto the two states the UI can render. */
export function toStorageError(error: unknown): StorageError {
  if (error instanceof StorageError) return error;
  const name = error instanceof Error ? error.name : undefined;
  if (name === "QuotaExceededError") {
    return new StorageError(
      "quota-exceeded",
      "The browser blocked this save because storage is full or restricted (private mode). Your journey is still open — export it from the memory browser to keep it.",
      { cause: error },
    );
  }
  const detail = error instanceof Error ? error.message : String(error);
  return new StorageError(
    "unavailable",
    `Storage is unavailable: ${detail}. Journeys will not persist on this device.`,
    { cause: error },
  );
}

// ---------------------------------------------------------------------------
// Connection
// ---------------------------------------------------------------------------

let dbPromise: Promise<DriftmapDatabase> | null = null;

/**
 * Opens the database once per page load. A failed open resets the cached
 * promise so a later call (e.g. after the user leaves private mode) retries
 * instead of replaying the cached rejection forever.
 */
export function getDb(): Promise<DriftmapDatabase> {
  if (dbPromise) return dbPromise;
  if (typeof indexedDB === "undefined") {
    return Promise.reject(
      new StorageError(
        "unavailable",
        "IndexedDB is not available here — the browser may be in private mode or storage may be blocked. The app keeps running, but journeys will not persist.",
      ),
    );
  }
  dbPromise = openDB<DriftmapDB>(DB_NAME, SCHEMA_VERSION, {
    upgrade(db, _oldVersion, _newVersion, tx) {
      db.createObjectStore("journeys", { keyPath: "id" });
      const memories = db.createObjectStore("memories", { keyPath: "id" });
      memories.createIndex("by-journey", "journeyId");
      const photos = db.createObjectStore("photos", { keyPath: "id" });
      photos.createIndex("by-journey", "journeyId");
      db.createObjectStore("meta", { keyPath: "key" });
      tx.objectStore("meta").put({ key: "schemaVersion", value: SCHEMA_VERSION } satisfies MetaEntry);
    },
  }).catch((error: unknown) => {
    dbPromise = null;
    throw toStorageError(error);
  });
  return dbPromise;
}

/** Close the connection (used by tests; the browser manages its own). */
export async function closeDb(): Promise<void> {
  const pending = dbPromise;
  dbPromise = null;
  if (pending) {
    const db = await pending.catch(() => null);
    db?.close();
  }
}

/** Run an operation against the open database with failures typed. */
async function withDb<T>(operation: (db: DriftmapDatabase) => Promise<T>): Promise<T> {
  try {
    return await operation(await getDb());
  } catch (error) {
    throw toStorageError(error);
  }
}

// ---------------------------------------------------------------------------
// Journeys
// ---------------------------------------------------------------------------

/** Upsert — demo seeding and journey updates share one write path. */
export async function saveJourney(journey: Journey): Promise<void> {
  await withDb((db) => db.put("journeys", journey));
}

/**
 * Returns the stored record as-is, or `undefined` when missing. Unlike
 * `listJourneys` it does not drop non-conforming records: the resume flow
 * decides how to present a broken journey rather than silently "losing" it.
 */
export async function getJourney(id: string): Promise<Journey | undefined> {
  return withDb((db) => db.get("journeys", id));
}

/**
 * All journeys, newest first. Invalid records are skipped safely rather than
 * crashing the browser (spec: degraded modes are designed states).
 */
export async function listJourneys(): Promise<Journey[]> {
  const journeys = await withDb((db) => db.getAll("journeys"));
  return journeys
    .filter(isValidJourney)
    .sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * Cascading delete in one transaction: the journey, its memories, and its
 * photos disappear together or not at all.
 */
export async function deleteJourney(id: string): Promise<void> {
  await withDb(async (db) => {
    const tx = db.transaction(["journeys", "memories", "photos"], "readwrite");
    const memories = tx.objectStore("memories");
    const photos = tx.objectStore("photos");

    const memoryKeys = await memories.index("by-journey").getAllKeys(id);
    await Promise.all(memoryKeys.map((key) => memories.delete(key)));

    const photoKeys = await photos.index("by-journey").getAllKeys(id);
    await Promise.all(photoKeys.map((key) => photos.delete(key)));

    await tx.objectStore("journeys").delete(id);
    await tx.done;
  });
}

// ---------------------------------------------------------------------------
// Memories and photos
// ---------------------------------------------------------------------------

/**
 * Writes the memory and its photo in one transaction. The pairing invariants
 * (one memory, one photo, same id, same journey) are asserted here because
 * every downstream experience — memory browser, replay — depends on them.
 */
export async function saveMemory(memory: MemoryRecord, photo: PhotoAsset): Promise<void> {
  if (memory.id !== photo.id) {
    throw new Error(
      `A memory and its photo must share an id (got memory "${memory.id}", photo "${photo.id}"): one memory, one photo.`,
    );
  }
  if (memory.journeyId !== photo.journeyId) {
    throw new Error(
      `A memory and its photo must belong to the same journey (got "${memory.journeyId}" and "${photo.journeyId}").`,
    );
  }
  await withDb(async (db) => {
    const tx = db.transaction(["memories", "photos"], "readwrite");
    await Promise.all([
      tx.objectStore("memories").put(memory),
      tx.objectStore("photos").put(photo),
      tx.done,
    ]);
  });
}

export async function getPhoto(id: string): Promise<PhotoAsset | undefined> {
  return withDb((db) => db.get("photos", id));
}

/**
 * Memories for one journey (or all of them), oldest completion first.
 * Memories whose clock could not be trusted (`completedAt: null`) sort last
 * and are never dropped — the timeline groups them as "unknown time".
 */
export async function listMemories(journeyId?: string): Promise<MemoryRecord[]> {
  const memories = journeyId
    ? await withDb((db) => db.getAllFromIndex("memories", "by-journey", journeyId))
    : await withDb((db) => db.getAll("memories"));
  return memories
    .filter(isValidMemory)
    .sort((a, b) => (a.completedAt ?? Number.POSITIVE_INFINITY) - (b.completedAt ?? Number.POSITIVE_INFINITY));
}

// ---------------------------------------------------------------------------
// Meta (bookkeeping; not part of the export payload)
// ---------------------------------------------------------------------------

export async function getMeta(key: string): Promise<unknown> {
  const entry = await withDb((db) => db.get("meta", key));
  return entry?.value;
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  await withDb((db) => db.put("meta", { key, value }));
}

// ---------------------------------------------------------------------------
// Export / import — a lossless copy of the store, versioned
// ---------------------------------------------------------------------------

export const EXPORT_FORMAT = "driftmap-export";
export const EXPORT_SCHEMA_VERSION = 1;

export interface ExportedPhoto {
  id: string;
  mime: string;
  base64: string;
  /** Rest of the stored PhotoAsset — a superset of the spec's minimal shape, so restores are lossless. */
  journeyId: string;
  width: number;
  height: number;
  createdAt: number;
}

export interface DriftmapExport {
  format: typeof EXPORT_FORMAT;
  schemaVersion: number;
  exportedAt: number;
  journeys: Journey[];
  memories: MemoryRecord[];
  photos: ExportedPhoto[];
}

export interface ImportSummary {
  journeys: number;
  memories: number;
  photos: number;
}

/** The entire store as a serializable object. */
export async function exportAll(): Promise<DriftmapExport> {
  return withDb(async (db) => {
    const [journeys, memories, photos] = await Promise.all([
      db.getAll("journeys"),
      db.getAll("memories"),
      db.getAll("photos"),
    ]);
    const exportedPhotos: ExportedPhoto[] = [];
    for (const photo of photos) {
      exportedPhotos.push({
        id: photo.id,
        mime: photo.blob.type,
        base64: await blobToBase64(photo.blob),
        journeyId: photo.journeyId,
        width: photo.width,
        height: photo.height,
        createdAt: photo.createdAt,
      });
    }
    return {
      format: EXPORT_FORMAT,
      schemaVersion: EXPORT_SCHEMA_VERSION,
      exportedAt: Date.now(),
      journeys,
      memories,
      photos: exportedPhotos,
    };
  });
}

/**
 * Atomically replaces the store with a validated export: a lossless restore.
 * Everything is validated and decoded before the single write transaction
 * opens, so a rejected file leaves the current data exactly as it was.
 */
export async function importAll(data: unknown): Promise<ImportSummary> {
  const payload = validateImport(data);

  const photos: PhotoAsset[] = [];
  for (const photo of payload.photos) {
    photos.push({
      id: photo.id,
      journeyId: photo.journeyId,
      blob: base64ToBlob(photo.base64, photo.mime),
      width: photo.width,
      height: photo.height,
      createdAt: photo.createdAt,
    });
  }

  await withDb(async (db) => {
    const tx = db.transaction(["journeys", "memories", "photos"], "readwrite");
    await Promise.all([
      tx.objectStore("journeys").clear(),
      tx.objectStore("memories").clear(),
      tx.objectStore("photos").clear(),
    ]);
    for (const journey of payload.journeys) tx.objectStore("journeys").put(journey);
    for (const memory of payload.memories) tx.objectStore("memories").put(memory);
    for (const photo of photos) tx.objectStore("photos").put(photo);
    await tx.done;
  });

  return {
    journeys: payload.journeys.length,
    memories: payload.memories.length,
    photos: photos.length,
  };
}

// ---------------------------------------------------------------------------
// Import validation — everything that runs before any write
// ---------------------------------------------------------------------------

function validateImport(data: unknown): {
  journeys: Journey[];
  memories: MemoryRecord[];
  photos: ExportedPhoto[];
} {
  if (typeof data !== "object" || data === null) {
    throw new ImportError("bad-format", "This file is not a Driftmap export.");
  }
  const record = data as Record<string, unknown>;
  if (record.format !== EXPORT_FORMAT) {
    throw new ImportError("bad-format", `This file is not a Driftmap export (expected format "${EXPORT_FORMAT}").`);
  }
  if (record.schemaVersion !== EXPORT_SCHEMA_VERSION) {
    throw new ImportError(
      "bad-version",
      `This export uses schema version ${String(record.schemaVersion)}, and this app understands version ${EXPORT_SCHEMA_VERSION}.`,
    );
  }
  if (!Array.isArray(record.journeys) || !Array.isArray(record.memories) || !Array.isArray(record.photos)) {
    throw new ImportError("bad-payload", "This export is damaged — journeys, memories, and photos must be lists.");
  }

  const exportedAt = typeof record.exportedAt === "number" && Number.isFinite(record.exportedAt) ? record.exportedAt : 0;

  const journeys: Journey[] = [];
  for (const [index, journey] of record.journeys.entries()) {
    if (!isValidJourney(journey)) {
      throw new ImportError("bad-payload", `Journey #${index + 1} in this export is not a valid journey record.`);
    }
    journeys.push(journey);
  }
  const journeyIds = new Set(journeys.map((journey) => journey.id));
  if (journeyIds.size !== journeys.length) {
    throw new ImportError("bad-payload", "This export contains duplicate journeys.");
  }

  const memories: MemoryRecord[] = [];
  const memoryIds = new Set<string>();
  for (const [index, memory] of record.memories.entries()) {
    if (!isValidMemory(memory)) {
      throw new ImportError("bad-payload", `Memory #${index + 1} in this export is not a valid memory record.`);
    }
    if (!journeyIds.has(memory.journeyId)) {
      throw new ImportError(
        "bad-payload",
        `Memory "${memory.id}" points at journey "${memory.journeyId}", which is not in this export.`,
      );
    }
    if (memoryIds.has(memory.id)) {
      throw new ImportError("bad-payload", `This export contains duplicate memories ("${memory.id}").`);
    }
    memories.push(memory);
    memoryIds.add(memory.id);
  }

  const photos: ExportedPhoto[] = [];
  for (const [index, photo] of record.photos.entries()) {
    photos.push(validatePhotoEntry(photo, index, journeyIds, memories, exportedAt));
  }
  const photoIds = new Set(photos.map((photo) => photo.id));
  if (photoIds.size !== photos.length) {
    throw new ImportError("bad-payload", "This export contains duplicate photos.");
  }

  return { journeys, memories, photos };
}

function validatePhotoEntry(
  photo: unknown,
  index: number,
  journeyIds: Set<string>,
  memories: MemoryRecord[],
  exportedAt: number,
): ExportedPhoto {
  const label = `Photo #${index + 1}`;
  if (typeof photo !== "object" || photo === null) {
    throw new ImportError("bad-payload", `${label} in this export is not a photo record.`);
  }
  const { id, mime, base64, journeyId, width, height, createdAt } = photo as Record<string, unknown>;
  if (typeof id !== "string" || id.length === 0) {
    throw new ImportError("bad-payload", `${label} has no id.`);
  }
  if (typeof mime !== "string" || !/^image\/[a-z0-9.+-]+$/i.test(mime)) {
    throw new ImportError("bad-payload", `Photo "${id}" has an unsupported media type.`);
  }
  if (typeof base64 !== "string" || base64.length === 0) {
    throw new ImportError("bad-payload", `Photo "${id}" has no image data.`);
  }
  // A minimal export may omit the photo's journey — photo id equals memory
  // id, so it can be recovered from the memories in the same file.
  const resolvedJourneyId =
    typeof journeyId === "string" && journeyId.length > 0
      ? journeyId
      : memories.find((memory) => memory.id === id)?.journeyId;
  if (!resolvedJourneyId || !journeyIds.has(resolvedJourneyId)) {
    throw new ImportError("bad-payload", `Photo "${id}" points at a journey that is not in this export.`);
  }
  return {
    id,
    mime,
    base64,
    journeyId: resolvedJourneyId,
    width: typeof width === "number" && Number.isFinite(width) && width >= 0 ? width : 0,
    height: typeof height === "number" && Number.isFinite(height) && height >= 0 ? height : 0,
    createdAt: typeof createdAt === "number" && Number.isFinite(createdAt) ? createdAt : exportedAt,
  };
}

// ---------------------------------------------------------------------------
// Read-shape guards — the store may hold data from an older or corrupt state
// ---------------------------------------------------------------------------

function isValidJourney(value: unknown): value is Journey {
  if (typeof value !== "object" || value === null) return false;
  const journey = value as Record<string, unknown>;
  return (
    isNonEmptyString(journey.id) &&
    isNonEmptyString(journey.cityId) &&
    (PERSONALITY_IDS as readonly unknown[]).includes(journey.personality) &&
    typeof journey.seed === "number" &&
    Number.isFinite(journey.seed) &&
    (journey.kind === "demo" || journey.kind === "played") &&
    (journey.status === "active" || journey.status === "completed") &&
    Array.isArray(journey.missionIds) &&
    journey.missionIds.every((id) => typeof id === "string") &&
    typeof journey.createdAt === "number" &&
    Number.isFinite(journey.createdAt)
  );
}

function isValidMemory(value: unknown): value is MemoryRecord {
  if (typeof value !== "object" || value === null) return false;
  const memory = value as Record<string, unknown>;
  if (
    !isNonEmptyString(memory.id) ||
    !isNonEmptyString(memory.journeyId) ||
    !isNonEmptyString(memory.missionId) ||
    !isNonEmptyString(memory.placeId) ||
    !isNonEmptyString(memory.clue) ||
    !isNonEmptyString(memory.caption) ||
    !(THEME_IDS as readonly unknown[]).includes(memory.theme) ||
    !(memory.verification === "player-confirmed" || memory.verification === "location-assisted")
  ) {
    return false;
  }
  const completedAtOk =
    memory.completedAt === null ||
    (typeof memory.completedAt === "number" && Number.isFinite(memory.completedAt));
  if (!completedAtOk) return false;
  if (memory.coords !== undefined) {
    if (
      !Array.isArray(memory.coords) ||
      memory.coords.length !== 2 ||
      !memory.coords.every((n) => typeof n === "number" && Number.isFinite(n))
    ) {
      return false;
    }
  }
  if (memory.note !== undefined && typeof memory.note !== "string") return false;
  return true;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

// ---------------------------------------------------------------------------
// Base64 — photos cross the export boundary as text, not as live Blobs
// ---------------------------------------------------------------------------

export async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const CHUNK = 0x8000; // keep String.fromCharCode spreads under the arg limit
  for (let offset = 0; offset < bytes.length; offset += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + CHUNK));
  }
  return btoa(binary);
}

export function base64ToBlob(base64: string, mime: string): Blob {
  try {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new Blob([bytes], { type: mime });
  } catch (error) {
    throw new ImportError("bad-payload", "A photo in this export has damaged image data.", { cause: error });
  }
}
