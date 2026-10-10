import { describe, expect, it } from "vitest";
import {
  activeMissionOf,
  buildCaption,
  buildMemoryRecord,
  buildTimeLabel,
  CAPTION_BODIES,
  defaultThemeFor,
  deriveMissionStates,
  journeyProgress,
  photoIdFor,
  THEME_BY_CATEGORY,
  verificationFor,
} from "./completion";
import { KOZHIKODE_PLACES } from "@/data/kozhikode";
import { generateMissions } from "./mission-engine";
import { KOZHIKODE } from "@/data/kozhikode";
import type { Mission, MemoryRecord } from "./types";

// ---------------------------------------------------------------------------
// Shared fixtures — a deterministic run over the real dataset
// ---------------------------------------------------------------------------

const JOURNEY_ID = "j-test-curious";
const SEED = 20261010;

function run(): Mission[] {
  return generateMissions({
    city: KOZHIKODE,
    places: KOZHIKODE_PLACES,
    personality: "curious",
    seed: SEED,
    journeyId: JOURNEY_ID,
  }).missions;
}

function memoryFor(mission: Mission, overrides: Partial<MemoryRecord> = {}): MemoryRecord {
  return {
    id: photoIdFor(mission.id),
    journeyId: mission.journeyId,
    missionId: mission.id,
    placeId: mission.placeId,
    completedAt: 1_760_000_000_000,
    verification: "player-confirmed",
    clue: mission.clue,
    caption: "10:00 AM — You followed a clue. You found something worth remembering.",
    theme: "discovery",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// photoIdFor — one memory, one photo
// ---------------------------------------------------------------------------

describe("photoIdFor", () => {
  it("derives a stable id from the mission id", () => {
    expect(photoIdFor("j-x--m0")).toBe("j-x--m0--photo");
    expect(photoIdFor("j-x--m0")).toBe(photoIdFor("j-x--m0"));
  });

  it("is unique per mission", () => {
    const missions = run();
    const ids = new Set(missions.map((mission) => photoIdFor(mission.id)));
    expect(ids.size).toBe(missions.length);
  });
});

// ---------------------------------------------------------------------------
// verificationFor — what the record may claim
// ---------------------------------------------------------------------------

describe("verificationFor", () => {
  const target: [number, number] = [75.7697, 11.2555]; // Kozhikode Beach

  it("is player-confirmed when no fix exists", () => {
    expect(verificationFor(null, target, 350)).toBe("player-confirmed");
    expect(verificationFor(undefined, target, 350)).toBe("player-confirmed");
  });

  it("is location-assisted when the fix falls inside the radius", () => {
    expect(verificationFor(target, target, 350)).toBe("location-assisted");
    expect(verificationFor([75.771, 11.256], target, 350)).toBe("location-assisted");
  });

  it("treats the boundary as inside — a fix exactly at the target is assisted even at radius 0", () => {
    expect(verificationFor(target, target, 0)).toBe("location-assisted");
  });

  it("is player-confirmed a hair outside the radius", () => {
    // 0.001° of latitude is ~111.2m — just past a 111m radius.
    expect(verificationFor([75.7697, 11.2565], target, 111)).toBe("player-confirmed");
  });

  it("is player-confirmed when the fix lands outside the radius", () => {
    // ~11km away — a fix from another part of the city.
    expect(verificationFor([75.8697, 11.2555], target, 350)).toBe("player-confirmed");
  });
});

// ---------------------------------------------------------------------------
// buildTimeLabel / buildCaption — the only time claims a memory makes
// ---------------------------------------------------------------------------

describe("buildTimeLabel", () => {
  it("formats a trusted clock as a short local time", () => {
    // 2026-10-10T10:42:00Z under US locale formatting.
    expect(buildTimeLabel(Date.UTC(2026, 9, 10, 10, 42), "en-US")).toMatch(/^\d{1,2}:\d{2}\s?(AM|PM)$/);
  });

  it("omits the time when the clock cannot be trusted", () => {
    expect(buildTimeLabel(null)).toBeNull();
    expect(buildTimeLabel(Number.NaN)).toBeNull();
  });
});

describe("buildCaption", () => {
  it("carries the time label when the clock is trusted", () => {
    const caption = buildCaption("park", Date.UTC(2026, 9, 10, 10, 42), "en-US");
    expect(caption).toContain("AM — ");
    expect(caption.endsWith("You found something worth remembering.")).toBe(true);
  });

  it("omits the time prefix when the clock is untrusted", () => {
    const caption = buildCaption("park", null);
    expect(caption).not.toContain("—");
    expect(caption.endsWith("You found something worth remembering.")).toBe(true);
  });

  it("never contains a place name, for any category over the real dataset", () => {
    for (const place of KOZHIKODE_PLACES) {
      const caption = buildCaption(place.category, Date.UTC(2026, 9, 10, 4, 0), "en-US");
      expect(caption).toContain(CAPTION_BODIES[place.category]);
      expect(caption.toLowerCase()).not.toContain(place.name.toLowerCase());
      expect(caption).not.toContain("{material}");
    }
  });
});

// ---------------------------------------------------------------------------
// defaultThemeFor — total, rule-based
// ---------------------------------------------------------------------------

describe("defaultThemeFor", () => {
  it("maps every category in the dataset", () => {
    const categories = new Set(KOZHIKODE_PLACES.map((place) => place.category));
    for (const category of categories) {
      expect(defaultThemeFor(category)).toBe(THEME_BY_CATEGORY[category]);
    }
  });
});

// ---------------------------------------------------------------------------
// buildMemoryRecord — what a confirmed capture becomes
// ---------------------------------------------------------------------------

describe("buildMemoryRecord", () => {
  const missions = run();
  const mission = missions[0];
  const place = KOZHIKODE_PLACES.find((candidate) => candidate.id === mission.placeId)!;
  const now = Date.UTC(2026, 9, 10, 10, 42);

  it("pairs the memory with the mission, journey, and photo id", () => {
    const memory = buildMemoryRecord({ mission, place, completedAt: now });
    expect(memory.id).toBe(photoIdFor(mission.id));
    expect(memory.missionId).toBe(mission.id);
    expect(memory.journeyId).toBe(mission.journeyId);
    expect(memory.placeId).toBe(place.id);
    expect(memory.clue).toBe(mission.clue);
  });

  it("records player-confirmed by default and never stores coords uninvited", () => {
    const memory = buildMemoryRecord({ mission, place, completedAt: now });
    expect(memory.verification).toBe("player-confirmed");
    expect(memory.coords).toBeUndefined();
  });

  it("records location-assisted only with a fix inside the radius", () => {
    const memory = buildMemoryRecord({
      mission,
      place,
      coords: place.coords,
      completedAt: now,
    });
    expect(memory.verification).toBe("location-assisted");
    expect(memory.coords).toEqual(place.coords);
  });

  it("keeps a trimmed note and drops empty ones", () => {
    const noted = buildMemoryRecord({ mission, place, completedAt: now, note: "  low tide  " });
    expect(noted.note).toBe("low tide");
    const blank = buildMemoryRecord({ mission, place, completedAt: now, note: "   " });
    expect(blank.note).toBeUndefined();
  });

  it("is honest about an untrusted clock", () => {
    const memory = buildMemoryRecord({ mission, place, completedAt: null });
    expect(memory.completedAt).toBeNull();
    expect(memory.caption).not.toContain("—");
  });
});

// ---------------------------------------------------------------------------
// deriveMissionStates / activeMissionOf / journeyProgress — derived run state
// ---------------------------------------------------------------------------

describe("deriveMissionStates", () => {
  const missions = run();

  it("opens exactly one active mission on a fresh run", () => {
    const derived = deriveMissionStates(missions, []);
    expect(derived[0].status).toBe("active");
    expect(derived.slice(1).every((mission) => mission.status === "locked")).toBe(true);
  });

  it("completes only missions with memories from the same journey", () => {
    const derived = deriveMissionStates(missions, [memoryFor(missions[0])]);
    expect(derived[0].status).toBe("complete");
    expect(derived[1].status).toBe("active");
  });

  it("ignores memories whose journey does not match the mission's", () => {
    const stranger = memoryFor(missions[0], { journeyId: "j-other" });
    const derived = deriveMissionStates(missions, [stranger]);
    expect(derived[0].status).toBe("active");
  });

  it("keeps a memory with a foreign mission id from completing anything", () => {
    const foreign = memoryFor(missions[0], { missionId: "j-other--m0" });
    const derived = deriveMissionStates(missions, [foreign]);
    expect(derived.every((mission) => mission.status !== "complete")).toBe(true);
  });

  it("leaves no active mission when the run is complete", () => {
    const all = missions.map((mission) => memoryFor(mission));
    const derived = deriveMissionStates(missions, all);
    expect(derived.every((mission) => mission.status === "complete")).toBe(true);
    expect(activeMissionOf(derived)).toBeNull();
  });

  it("advances the active mission in run order, skipping completed ones", () => {
    const two = deriveMissionStates(missions, [memoryFor(missions[0]), memoryFor(missions[1])]);
    expect(activeMissionOf(two)?.index).toBe(2);
  });
});

describe("journeyProgress", () => {
  const missions = run();

  it("counts a fresh run", () => {
    expect(journeyProgress(missions, [])).toEqual({
      found: 0,
      total: missions.length,
      complete: false,
      current: 1,
    });
  });

  it("counts a partially complete run", () => {
    const progress = journeyProgress(missions, [memoryFor(missions[0]), memoryFor(missions[1])]);
    expect(progress.found).toBe(2);
    expect(progress.current).toBe(3);
    expect(progress.complete).toBe(false);
  });

  it("completes when every mission has a memory", () => {
    const progress = journeyProgress(
      missions,
      missions.map((mission) => memoryFor(mission)),
    );
    expect(progress.complete).toBe(true);
    expect(progress.current).toBeNull();
  });
});
