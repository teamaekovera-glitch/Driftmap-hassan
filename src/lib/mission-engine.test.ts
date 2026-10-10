import { describe, expect, it } from "vitest";
import { DEMO_JOURNEY_SEED, KOZHIKODE, KOZHIKODE_PLACES } from "@/data/kozhikode";
import { buildClue, CATEGORY_HINTS, CHAOTIC_CONSTRAINTS, FALLBACK_CLUE } from "./clues";
import { generateMissions, type MissionInput } from "./mission-engine";
import type { Mission, PersonalityId, Place } from "./types";

const PERSONALITIES: PersonalityId[] = [
  "curious",
  "broke",
  "adventurous",
  "introverted",
  "chaotic",
];

function inputFor(personality: PersonalityId, overrides: Partial<MissionInput> = {}): MissionInput {
  return {
    city: KOZHIKODE,
    places: KOZHIKODE_PLACES,
    personality,
    seed: 42,
    journeyId: "j-test",
    ...overrides,
  };
}

function placeById(id: string): Place {
  const place = KOZHIKODE_PLACES.find((p) => p.id === id);
  if (!place) throw new Error(`unknown place ${id}`);
  return place;
}

// Distinctive proper-noun tokens — the exact names a clue must never carry.
// (Generic descriptors like "railway station" or "planetarium" are allowed;
// the dataset's clueMaterial is written to describe character, not names.)
const LEAK_TOKENS = [
  "mananchira",
  "mittayi",
  "sweet meat",
  "s.m. street",
  "sm street",
  "mishkal",
  "tali",
  "kuttichira",
  "sarovaram",
  "beypore",
  "pulimuttu",
  "kappad",
  "pazhassi",
  "kozhikode beach",
  "kozhikode railway station",
  "regional science centre",
];

function assertNoLeaks(mission: Mission): void {
  const surfaces = [mission.clue, mission.hint, mission.reason, mission.constraint ?? ""].map(
    (s) => s.toLowerCase(),
  );
  for (const surface of surfaces) {
    for (const token of LEAK_TOKENS) {
      expect(surface, `"${token}" leaked into: ${surface}`).not.toContain(token);
    }
  }
}

describe("mission engine — determinism", () => {
  it("produces deep-equal output across identical calls, for every personality", () => {
    for (const personality of PERSONALITIES) {
      const first = generateMissions(inputFor(personality));
      const second = generateMissions(inputFor(personality));
      expect(second).toEqual(first);
    }
  });

  it("reproduces the demo journey's place sequence from the fixed demo seed", () => {
    const run = (n: number) =>
      generateMissions(inputFor("curious", { seed: DEMO_JOURNEY_SEED, maxMissions: n }))
        .missions.map((m) => m.placeId);
    expect(run(6)).toEqual(run(6));
    expect(run(3)).toEqual(run(3));
  });

  it("varies output with the seed", () => {
    // Chaotic is shuffle-only, so different seeds must reorder the run.
    const a = generateMissions(inputFor("chaotic", { seed: 1 })).missions.map((m) => m.placeId);
    const b = generateMissions(inputFor("chaotic", { seed: 2 })).missions.map((m) => m.placeId);
    expect(a).not.toEqual(b);
  });

  it("emits ordered ids `${journeyId}--m${index}` with exactly one active mission", () => {
    const { missions } = generateMissions(inputFor("curious"));
    missions.forEach((mission, index) => {
      expect(mission.id).toBe(`j-test--m${index}`);
      expect(mission.index).toBe(index);
      expect(mission.status).toBe(index === 0 ? "active" : "locked");
    });
  });

  it("carries a human-readable reasonLog with one line per mission", () => {
    const { missions, reasonLog } = generateMissions(inputFor("adventurous"));
    expect(reasonLog.length).toBe(missions.length + 1);
    for (const line of reasonLog) expect(line.length).toBeGreaterThan(0);
  });
});

describe("mission engine — personality differentiation", () => {
  it("gives the five personalities genuinely different runs from one seed", () => {
    const runs = PERSONALITIES.map((personality) => ({
      personality,
      placeIds: generateMissions(inputFor(personality)).missions.map((m) => m.placeId),
    }));
    for (let i = 0; i < runs.length; i++) {
      for (let j = i + 1; j < runs.length; j++) {
        const sameSequence =
          JSON.stringify(runs[i].placeIds) === JSON.stringify(runs[j].placeIds);
        expect(
          sameSequence,
          `${runs[i].personality} and ${runs[j].personality} produced the same run`,
        ).toBe(false);
      }
    }
  });

  it("Broke: every mission's place carries the free tag", () => {
    const { missions } = generateMissions(inputFor("broke"));
    expect(missions.length).toBeGreaterThan(0);
    for (const mission of missions) {
      expect(placeById(mission.placeId).tags).toContain("free");
      expect(mission.reason.toLowerCase()).toContain("costs exactly nothing");
    }
  });

  it("Introverted: avoids busy places and never stacks market missions", () => {
    const { missions } = generateMissions(inputFor("introverted"));
    let previousWasMarket = false;
    for (const mission of missions) {
      const place = placeById(mission.placeId);
      expect(place.tags).not.toContain("busy");
      if (previousWasMarket) expect(place.category).not.toBe("market");
      previousWasMarket = place.category === "market";
    }
  });

  it("Curious: fills the run with heritage and culture stops", () => {
    const { missions } = generateMissions(inputFor("curious"));
    const heritageish = missions.filter(
      (m) =>
        placeById(m.placeId).category === "heritage" ||
        placeById(m.placeId).category === "culture",
    );
    expect(heritageish.length).toBeGreaterThanOrEqual(2);
  });

  it("Adventurous: reaches the dataset's edges with varied categories", () => {
    const { missions } = generateMissions(inputFor("adventurous"));
    const edgeIds = ["kozhikode--beypore-pulimuttu", "kozhikode--kappad-beach"];
    expect(missions.some((m) => edgeIds.includes(m.placeId))).toBe(true);
    const categories = new Set(missions.map((m) => placeById(m.placeId).category));
    expect(categories.size).toBeGreaterThanOrEqual(3);
  });

  it("Chaotic: attaches exactly one safe constraint per mission", () => {
    const { missions } = generateMissions(inputFor("chaotic"));
    for (const mission of missions) {
      expect(CHAOTIC_CONSTRAINTS).toContain(mission.constraint);
      expect(mission.reason).toContain(mission.constraint ?? "");
    }
  });

  it("Non-chaotic personalities never carry constraints", () => {
    for (const personality of ["curious", "broke", "adventurous", "introverted"] as const) {
      const { missions } = generateMissions(inputFor(personality));
      for (const mission of missions) expect(mission.constraint).toBeUndefined();
    }
  });
});

describe("mission engine — dedupe, resume, and limits", () => {
  it("never issues the same place twice within a run", () => {
    for (const personality of PERSONALITIES) {
      const { missions } = generateMissions(inputFor(personality));
      const ids = missions.map((m) => m.placeId);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("resume: completed places are never re-issued", () => {
    const first = generateMissions(inputFor("curious", { maxMissions: 6 }));
    const completed = first.missions.map((m) => m.placeId);
    const resumed = generateMissions(
      inputFor("curious", { maxMissions: 6, completedPlaceIds: completed }),
    );
    for (const mission of resumed.missions) {
      expect(completed).not.toContain(mission.placeId);
    }
  });

  it("resume: regenerates the same deterministic tail, then continues the run", () => {
    const full = generateMissions(inputFor("broke", { seed: 7 }));
    const done = full.missions.slice(0, 3).map((m) => m.placeId);
    // Resuming asks for up to 6 missions again — the first (length − done)
    // picks must reproduce the original run's tail, then keep filling.
    const resumed = generateMissions(inputFor("broke", { seed: 7, completedPlaceIds: done }));
    const tailLength = full.missions.length - done.length;
    expect(resumed.missions.slice(0, tailLength).map((m) => m.placeId)).toEqual(
      full.missions.slice(3).map((m) => m.placeId),
    );
    for (const mission of resumed.missions) {
      expect(done).not.toContain(mission.placeId);
    }
  });

  it("honours maxMissions and caps at the eligible set", () => {
    expect(generateMissions(inputFor("curious", { maxMissions: 3 })).missions).toHaveLength(3);
    expect(generateMissions(inputFor("curious")).missions).toHaveLength(6);
    expect(generateMissions(inputFor("curious", { maxMissions: 99 })).missions).toHaveLength(12);
  });

  it("returns an empty run with a reason when nothing qualifies", () => {
    const otherCity: Place = { ...placeById("kozhikode--mananchira-square"), cityId: "kochi" };
    const out = generateMissions(inputFor("curious", { places: [otherCity] }));
    expect(out.missions).toHaveLength(0);
    expect(out.reasonLog[0]).toContain("No places qualified");
  });
});

describe("clue honesty — every clue traces to the dataset", () => {
  it("every clue, hint, reason, and constraint stays name-free", () => {
    for (const personality of PERSONALITIES) {
      const { missions } = generateMissions(inputFor(personality, { seed: DEMO_JOURNEY_SEED }));
      for (const mission of missions) assertNoLeaks(mission);
    }
  });

  it("every clue is filled with its own place's clueMaterial", () => {
    for (const personality of PERSONALITIES) {
      const { missions } = generateMissions(inputFor(personality, { seed: 99 }));
      for (const mission of missions) {
        const place = placeById(mission.placeId);
        const clue = mission.clue.toLowerCase();
        const grounded = place.clueMaterial.some((phrase) => clue.includes(phrase.toLowerCase()));
        expect(grounded, `clue "${mission.clue}" does not trace to ${place.id}`).toBe(true);
      }
    }
  });

  it("hints are exactly the category-level hint for the mission's place", () => {
    const { missions } = generateMissions(inputFor("chaotic", { seed: 5 }));
    for (const mission of missions) {
      expect(mission.hint).toBe(CATEGORY_HINTS[placeById(mission.placeId).category]);
    }
  });

  it("falls back honestly when a place has thin attribute data", () => {
    const thin: Place = { ...placeById("kozhikode--mananchira-square"), clueMaterial: [] };
    expect(buildClue(thin, "broke")).toBe(FALLBACK_CLUE);
  });
});
