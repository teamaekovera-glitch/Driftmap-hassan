import { describe, expect, it } from "vitest";
import { KOZHIKODE_PLACES } from "@/data/kozhikode";
import { computeFogState, missionIndexFromId, orderMemoriesForJourney } from "./fog";
import type { Journey, MemoryRecord, Mission, Place, ThemeId } from "./types";

const JOURNEY_ID = "j-fog";

function place(id: string): Place {
  const found = KOZHIKODE_PLACES.find((p) => p.id === id);
  if (!found) throw new Error(`unknown place ${id}`);
  return found;
}

function journeyFixture(status: Journey["status"] = "active"): Journey {
  return {
    id: JOURNEY_ID,
    cityId: "kozhikode",
    personality: "curious",
    seed: 1,
    kind: "played",
    status,
    missionIds: ["m0", "m1", "m2"].map((m) => `${JOURNEY_ID}--${m}`),
    createdAt: 1_000,
  };
}

function missionFixture(index: number): Mission {
  return {
    id: `${JOURNEY_ID}--m${index}`,
    journeyId: JOURNEY_ID,
    index,
    placeId: "kozhikode--mananchira-square",
    personality: "curious",
    clue: "clue",
    hint: "hint",
    radiusMeters: 400,
    reason: "reason",
    status: "active",
  };
}

let memoryCounter = 0;
function memoryFixture(overrides: Partial<MemoryRecord>): MemoryRecord {
  memoryCounter += 1;
  return {
    id: `mem-${memoryCounter}`,
    journeyId: JOURNEY_ID,
    missionId: `${JOURNEY_ID}--m0`,
    placeId: "kozhikode--mananchira-square",
    completedAt: 1_000,
    verification: "player-confirmed",
    clue: "clue",
    caption: "caption",
    theme: "discovery" satisfies ThemeId,
    ...overrides,
  };
}

describe("computeFogState", () => {
  it("starts fully fogged: no holes, no routes, obscured active target", () => {
    const active = missionFixture(0);
    const fog = computeFogState(journeyFixture(), [], KOZHIKODE_PLACES, active);
    expect(fog.revealed).toHaveLength(0);
    expect(fog.routes).toHaveLength(0);
    expect(fog.activeTarget).toEqual({
      coords: place("kozhikode--mananchira-square").coords,
      radiusMeters: 400,
    });
  });

  it("hides the active target when no mission is provided", () => {
    const fog = computeFogState(journeyFixture(), [], KOZHIKODE_PLACES);
    expect(fog.activeTarget).toBeNull();
  });

  it("one completed stop opens exactly one hole and draws no routes", () => {
    const memories = [
      memoryFixture({ placeId: "kozhikode--kozhikode-beach", missionId: `${JOURNEY_ID}--m0` }),
    ];
    const fog = computeFogState(journeyFixture(), memories, KOZHIKODE_PLACES, missionFixture(1));
    expect(fog.revealed).toHaveLength(1);
    expect(fog.revealed[0].coords).toEqual(place("kozhikode--kozhikode-beach").coords);
    expect(fog.routes).toHaveLength(0);
  });

  it("N completed stops: holes and route segments follow mission order, not input order", () => {
    // Deliberately shuffled input with mixed timestamps — order must come
    // from the mission id, and a null completedAt must not drop the stop.
    const memories = [
      memoryFixture({
        id: "mem-c",
        placeId: "kozhikode--sm-street",
        missionId: `${JOURNEY_ID}--m2`,
        completedAt: null,
      }),
      memoryFixture({
        id: "mem-a",
        placeId: "kozhikode--kozhikode-beach",
        missionId: `${JOURNEY_ID}--m0`,
        completedAt: 3_000,
      }),
      memoryFixture({
        id: "mem-b",
        placeId: "kozhikode--mananchira-square",
        missionId: `${JOURNEY_ID}--m1`,
        completedAt: 2_000,
      }),
    ];
    const fog = computeFogState(journeyFixture(), memories, KOZHIKODE_PLACES, missionFixture(3));

    expect(fog.revealed.map((r) => r.coords)).toEqual([
      place("kozhikode--kozhikode-beach").coords,
      place("kozhikode--mananchira-square").coords,
      place("kozhikode--sm-street").coords,
    ]);
    expect(fog.routes).toEqual([
      [place("kozhikode--kozhikode-beach").coords, place("kozhikode--mananchira-square").coords],
      [place("kozhikode--mananchira-square").coords, place("kozhikode--sm-street").coords],
    ]);
  });

  it("ignores memories from other journeys", () => {
    const foreign = memoryFixture({
      id: "foreign",
      journeyId: "j-other",
      placeId: "kozhikode--beypore-pulimuttu",
    });
    const fog = computeFogState(journeyFixture(), [foreign], KOZHIKODE_PLACES);
    expect(fog.revealed).toHaveLength(0);
    expect(fog.routes).toHaveLength(0);
  });

  it("skips memories pointing at unknown places instead of crashing", () => {
    const unknown = memoryFixture({ placeId: "kozhikode--nowhere" });
    const known = memoryFixture({ placeId: "kozhikode--kappad-beach" });
    const fog = computeFogState(journeyFixture(), [unknown, known], KOZHIKODE_PLACES);
    expect(fog.revealed).toHaveLength(1);
    expect(fog.revealed[0].coords).toEqual(place("kozhikode--kappad-beach").coords);
  });

  it("a completed journey never shows an obscured target", () => {
    const fog = computeFogState(
      journeyFixture("completed"),
      [],
      KOZHIKODE_PLACES,
      missionFixture(0),
    );
    expect(fog.activeTarget).toBeNull();
  });
});

describe("orderMemoriesForJourney", () => {
  it("tolerates null timestamps without dropping or misordering stops", () => {
    const a = memoryFixture({ id: "a", missionId: `${JOURNEY_ID}--m1`, completedAt: null });
    const b = memoryFixture({ id: "b", missionId: `${JOURNEY_ID}--m0`, completedAt: null });
    const c = memoryFixture({ id: "c", missionId: "unparsed", completedAt: 5_000 });
    const ordered = orderMemoriesForJourney([a, b, c]);
    expect(ordered.map((m) => m.id)).toEqual(["b", "a", "c"]);
  });

  it("is deterministic on ties (same index, same time → id order)", () => {
    const a = memoryFixture({ id: "a", missionId: `${JOURNEY_ID}--m0`, completedAt: 1_000 });
    const b = memoryFixture({ id: "b", missionId: `${JOURNEY_ID}--m0`, completedAt: 1_000 });
    const once = orderMemoriesForJourney([b, a]).map((m) => m.id);
    const twice = orderMemoriesForJourney([a, b]).map((m) => m.id);
    expect(once).toEqual(twice);
  });
});

describe("missionIndexFromId", () => {
  it("parses the shared mission-id convention", () => {
    expect(missionIndexFromId("j-abc--m4")).toBe(4);
    expect(missionIndexFromId("unparsed")).toBeNull();
    expect(missionIndexFromId("j-abc--m")).toBeNull();
  });
});
