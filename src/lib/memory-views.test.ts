import { describe, expect, it } from "vitest";
import { computeFogState, orderMemoriesForJourney } from "./fog";
import {
  UNKNOWN_TIME_LABEL,
  defaultThemeForPlace,
  formatDayLabel,
  formatTimeLabel,
  groupMemoriesByDay,
  groupMemoriesByTheme,
  personalityLabel,
  themeLabel,
} from "./memory-views";
import { THEME_IDS, type Journey, type MemoryRecord, type Place } from "./types";

// ---------------------------------------------------------------------------
// Fixtures — memories over the real Kozhikode place ids
// ---------------------------------------------------------------------------

const PLACES: Place[] = [
  {
    id: "kozhikode--mananchira-square",
    cityId: "kozhikode",
    name: "Mananchira Square",
    coords: [75.78, 11.2545],
    category: "park",
    tags: ["public", "free", "quiet"],
    clueMaterial: ["a centuries-old freshwater tank"],
    suitability: "public",
  },
  {
    id: "kozhikode--sm-street",
    cityId: "kozhikode",
    name: "SM Street (Sweet Meat Street)",
    coords: [75.7813, 11.2499],
    category: "market",
    tags: ["public", "free", "food"],
    clueMaterial: ["a car-free lane lined with sweet and snack shops"],
    suitability: "public",
  },
  {
    id: "kozhikode--beypore-pulimuttu",
    cityId: "kozhikode",
    name: "Beypore port & Pulimuttu",
    coords: [75.8076, 11.1669],
    category: "waterfront",
    tags: ["public", "free", "photogenic"],
    clueMaterial: ["a working port town at the river mouth"],
    suitability: "public",
  },
];

const JOURNEY: Journey = {
  id: "journey-fix",
  cityId: "kozhikode",
  personality: "curious",
  seed: 42,
  kind: "played",
  status: "completed",
  missionIds: ["journey-fix--m0", "journey-fix--m1", "journey-fix--m2"],
  createdAt: 1_780_000_000_000,
};

/** Same local afternoon, spaced minutes apart; one clock-untrustworthy stop. */
function makeMemory(overrides: Partial<MemoryRecord> = {}): MemoryRecord {
  return {
    id: "memory-fix",
    journeyId: JOURNEY.id,
    missionId: `${JOURNEY.id}--m0`,
    placeId: "kozhikode--mananchira-square",
    completedAt: new Date(2026, 9, 10, 14, 5).getTime(),
    verification: "player-confirmed",
    clue: "Find the tank at the city's heart.",
    caption: "You found something worth remembering.",
    theme: "discovery",
    ...overrides,
  };
}

const AFTERNOON = [
  makeMemory({
    id: "mem-2",
    missionId: `${JOURNEY.id}--m1`,
    placeId: "kozhikode--sm-street",
    completedAt: new Date(2026, 9, 10, 15, 30).getTime(),
    theme: "food",
  }),
  makeMemory({
    id: "mem-1",
    completedAt: new Date(2026, 9, 10, 14, 5).getTime(),
    theme: "nature",
  }),
  makeMemory({
    id: "mem-3",
    missionId: `${JOURNEY.id}--m2`,
    placeId: "kozhikode--beypore-pulimuttu",
    completedAt: new Date(2026, 9, 11, 9, 0).getTime(),
    theme: "nature",
  }),
  makeMemory({
    id: "mem-unknown",
    completedAt: null,
    theme: "unexpected",
  }),
];

/** Every memory id exactly once, sorted — the invariant all three modes share. */
function sortedIds(records: { id: string }[]): string[] {
  return records.map((record) => record.id).sort();
}

const ALL_IDS = sortedIds(AFTERNOON);

// ---------------------------------------------------------------------------
// Timeline grouping
// ---------------------------------------------------------------------------

describe("groupMemoriesByDay", () => {
  it("groups chronologically by local day with the unknown-time group last", () => {
    const groups = groupMemoriesByDay(AFTERNOON);

    expect(groups.map((group) => group.label)).toEqual([
      formatDayLabel(new Date(2026, 9, 10).getTime()),
      formatDayLabel(new Date(2026, 9, 11).getTime()),
      UNKNOWN_TIME_LABEL,
    ]);
    expect(groups[0].memories.map((memory) => memory.id)).toEqual(["mem-1", "mem-2"]);
    expect(groups[1].memories.map((memory) => memory.id)).toEqual(["mem-3"]);
    expect(groups[2].memories.map((memory) => memory.id)).toEqual(["mem-unknown"]);
    expect(groups[2].isUnknownTime).toBe(true);
    expect(groups[0].isUnknownTime).toBe(false);
  });

  it("never drops or duplicates a memory across groups", () => {
    const groups = groupMemoriesByDay(AFTERNOON);
    expect(sortedIds(groups.flatMap((group) => group.memories))).toEqual(ALL_IDS);
  });

  it("orders within a group by completion time, ties by id", () => {
    const tieA = makeMemory({ id: "tie-a", completedAt: 5_000, theme: "food" });
    const tieB = makeMemory({ id: "tie-b", completedAt: 5_000, theme: "food" });
    const groups = groupMemoriesByDay([tieB, tieA]);
    expect(groups[0].memories.map((memory) => memory.id)).toEqual(["tie-a", "tie-b"]);
  });

  it("returns an empty list for an empty journey", () => {
    expect(groupMemoriesByDay([])).toEqual([]);
  });

  it("groups memories completed at the same minute under their own day", () => {
    const morning = makeMemory({ id: "m-am", completedAt: new Date(2026, 9, 10, 0, 1).getTime() });
    const night = makeMemory({ id: "m-pm", completedAt: new Date(2026, 9, 10, 23, 59).getTime() });
    const groups = groupMemoriesByDay([night, morning]);
    expect(groups).toHaveLength(1);
    expect(groups[0].memories.map((memory) => memory.id)).toEqual(["m-am", "m-pm"]);
  });
});

// ---------------------------------------------------------------------------
// Mood grouping
// ---------------------------------------------------------------------------

describe("groupMemoriesByTheme", () => {
  it("keeps all six themes in canonical order, empty ones included", () => {
    const collections = groupMemoriesByTheme(AFTERNOON);
    expect(collections.map((collection) => collection.theme)).toEqual([...THEME_IDS]);
    const food = collections.find((collection) => collection.theme === "food");
    expect(food?.memories.map((memory) => memory.id)).toEqual(["mem-2"]);
  });

  it("keeps every memory in exactly one theme collection", () => {
    const collections = groupMemoriesByTheme(AFTERNOON);
    expect(sortedIds(collections.flatMap((collection) => collection.memories))).toEqual(ALL_IDS);
    const ids = collections.flatMap((collection) => collection.memories.map((memory) => memory.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("preserves input order inside a collection", () => {
    const first = makeMemory({ id: "a", theme: "nature" });
    const second = makeMemory({ id: "b", theme: "nature" });
    const collections = groupMemoriesByTheme([second, first]);
    expect(collections.find((c) => c.theme === "nature")?.memories.map((m) => m.id)).toEqual(["b", "a"]);
  });
});

// ---------------------------------------------------------------------------
// The three modes render the same records
// ---------------------------------------------------------------------------

describe("the three modes render the same records", () => {
  it("map, timeline, and moods cover exactly the journey's memories", () => {
    // Map mode: journey order over the fog state's revealed stops.
    const fogState = computeFogState(JOURNEY, AFTERNOON, PLACES);
    const mapOrder = orderMemoriesForJourney(
      AFTERNOON.filter((memory) => memory.journeyId === JOURNEY.id),
    );
    expect(fogState.revealed).toHaveLength(mapOrder.length);
    expect(sortedIds(mapOrder)).toEqual(ALL_IDS);

    // Timeline mode: day groups.
    const timeline = groupMemoriesByDay(AFTERNOON);
    expect(sortedIds(timeline.flatMap((group) => group.memories))).toEqual(ALL_IDS);

    // Mood mode: theme collections.
    const moods = groupMemoriesByTheme(AFTERNOON);
    expect(sortedIds(moods.flatMap((collection) => collection.memories))).toEqual(ALL_IDS);
  });
});

// ---------------------------------------------------------------------------
// Rule-based default themes
// ---------------------------------------------------------------------------

describe("defaultThemeForPlace", () => {
  function placeOf(category: Place["category"]): Place {
    return {
      id: `kozhikode--${category}`,
      cityId: "kozhikode",
      name: category,
      coords: [75.78, 11.25],
      category,
      tags: ["public"],
      clueMaterial: [],
      suitability: "public",
    };
  }

  it("maps every category through the documented rule", () => {
    expect(defaultThemeForPlace(placeOf("waterfront"))).toBe("nature");
    expect(defaultThemeForPlace(placeOf("park"))).toBe("nature");
    expect(defaultThemeForPlace(placeOf("market"))).toBe("food");
    expect(defaultThemeForPlace(placeOf("heritage"))).toBe("architecture");
    expect(defaultThemeForPlace(placeOf("culture"))).toBe("discovery");
    expect(defaultThemeForPlace(placeOf("transit"))).toBe("unexpected");
    expect(defaultThemeForPlace(placeOf("street-life"))).toBe("street-life");
  });
});

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

describe("label formatting", () => {
  it("labels the same local day identically and different days differently", () => {
    const day1 = new Date(2026, 9, 10, 14, 0).getTime();
    const day1Later = new Date(2026, 9, 10, 20, 0).getTime();
    const day2 = new Date(2026, 9, 11, 14, 0).getTime();
    expect(formatDayLabel(day1)).toBe(formatDayLabel(day1Later));
    expect(formatDayLabel(day1)).not.toBe(formatDayLabel(day2));
  });

  it("formats the caption timestamp with minutes", () => {
    const label = formatTimeLabel(new Date(2026, 9, 10, 10, 42).getTime());
    expect(label).toMatch(/10:42/);
  });

  it("humanizes theme and personality ids", () => {
    expect(themeLabel("street-life")).toBe("Street Life");
    expect(themeLabel("discovery")).toBe("Discovery");
    expect(personalityLabel("curious")).toBe("Curious");
  });

  it("covers every theme id with a label", () => {
    for (const theme of THEME_IDS) {
      expect(themeLabel(theme)).not.toBe("");
    }
  });
});
