/**
 * Replay tests — the film is a pure function of the store. Covers the spec's
 * replay acceptance rows: scene ordering (title → stop/route pairs → finale),
 * controller transitions, honest time/duration labels (null clocks never
 * fabricate), and backdrop derivation that draws the journey as it plays.
 */

import { describe, expect, it } from "vitest";
import { KOZHIKODE, KOZHIKODE_PLACES } from "@/data/kozhikode";
import { distanceMeters } from "./geo";
import {
  buildScenes,
  cityDisplayName,
  formatTimeLabel,
  INITIAL_REPLAY_STATE,
  journeyDurationLabel,
  narrationTextForScene,
  replayBackdrop,
  replayReducer,
  SCENE_DURATION_MS,
  sceneDuration,
  type ReplayEvent,
  type ReplayScene,
  type ReplayState,
} from "./replay";
import type { Journey, MemoryRecord, Place } from "./types";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const JOURNEY: Journey = {
  id: "j-replay-test",
  cityId: "kozhikode",
  personality: "curious",
  seed: 7,
  kind: "played",
  status: "completed",
  missionIds: [
    "j-replay-test--m0",
    "j-replay-test--m1",
    "j-replay-test--m2",
    "j-replay-test--m3",
  ],
  createdAt: Date.UTC(2026, 9, 10, 9, 0),
};

const T0 = Date.UTC(2026, 9, 10, 10, 42); // 10:42 AM UTC
const T2 = T0 + 84 * 60_000; // 84 minutes later

function memory(partial: {
  id: string;
  missionId: string;
  placeId: string;
  completedAt: number | null;
  journeyId?: string;
}): MemoryRecord {
  return {
    id: partial.id,
    journeyId: partial.journeyId ?? JOURNEY.id,
    missionId: partial.missionId,
    placeId: partial.placeId,
    completedAt: partial.completedAt,
    verification: "player-confirmed",
    clue: "The water keeps its secrets. Find a long sand shore beside the city centre.",
    caption: "You followed the clue to the shore and kept the photograph.",
    theme: "discovery",
  };
}

/**
 * Three completed stops (beach → Mananchira → SM Street), deliberately out of
 * order, with: a foreign journey's memory, a memory pointing at an unknown
 * place, and one stop whose clock could not be trusted.
 */
const MEMORIES: MemoryRecord[] = [
  memory({ id: "mem-2", missionId: `${JOURNEY.id}--m2`, placeId: "kozhikode--sm-street", completedAt: T2 }),
  memory({ id: "mem-0", missionId: `${JOURNEY.id}--m0`, placeId: "kozhikode--kozhikode-beach", completedAt: T0 }),
  memory({
    id: "mem-foreign",
    missionId: "j-other--m0",
    placeId: "kozhikode--kappad-beach",
    completedAt: T0,
    journeyId: "j-other",
  }),
  memory({ id: "mem-1", missionId: `${JOURNEY.id}--m1`, placeId: "kozhikode--mananchira-square", completedAt: null }),
  memory({ id: "mem-unknown-place", missionId: `${JOURNEY.id}--m3`, placeId: "kozhikode--nowhere", completedAt: T2 }),
];

const BEACH = KOZHIKODE_PLACES.find((p) => p.id === "kozhikode--kozhikode-beach") as Place;
const MANANCHIRA = KOZHIKODE_PLACES.find((p) => p.id === "kozhikode--mananchira-square") as Place;
const SM_STREET = KOZHIKODE_PLACES.find((p) => p.id === "kozhikode--sm-street") as Place;

function sceneKinds(scenes: ReplayScene[]): ReplayScene["kind"][] {
  return scenes.map((scene) => scene.kind);
}

function stopScenes(scenes: ReplayScene[]): Extract<ReplayScene, { kind: "stop" }>[] {
  return scenes.filter((scene): scene is Extract<ReplayScene, { kind: "stop" }> => scene.kind === "stop");
}

function finaleScene(scenes: ReplayScene[]): Extract<ReplayScene, { kind: "finale" }> {
  const finale = scenes[scenes.length - 1];
  if (finale.kind !== "finale") throw new Error("expected the finale scene");
  return finale;
}

// ---------------------------------------------------------------------------
// buildScenes
// ---------------------------------------------------------------------------

describe("buildScenes", () => {
  it("orders title → stop/route pairs → finale from store data", () => {
    const scenes = buildScenes(JOURNEY, MEMORIES, KOZHIKODE_PLACES, KOZHIKODE);
    expect(sceneKinds(scenes)).toEqual([
      "title",
      "stop", // beach (m0)
      "route",
      "stop", // Mananchira (m1 — null clock, still present)
      "route",
      "stop", // SM Street (m2)
      "finale",
    ]);
  });

  it("keeps memories of other journeys and unknown places out of the film", () => {
    const scenes = buildScenes(JOURNEY, MEMORIES, KOZHIKODE_PLACES, KOZHIKODE);
    expect(stopScenes(scenes).map((scene) => scene.coords)).toEqual([
      BEACH.coords,
      MANANCHIRA.coords,
      SM_STREET.coords,
    ]);
  });

  it("fills stop scenes from the memory record, clue and caption verbatim", () => {
    const scenes = buildScenes(JOURNEY, MEMORIES, KOZHIKODE_PLACES, KOZHIKODE);
    const [firstStop] = stopScenes(scenes);
    if (!firstStop) throw new Error("expected a stop scene");
    expect(firstStop.memoryId).toBe("mem-0");
    expect(firstStop.photoId).toBe("mem-0"); // one memory, one photo
    expect(firstStop.coords).toEqual(BEACH.coords);
    expect(firstStop.clue).toBe(MEMORIES[1].clue);
    expect(firstStop.caption).toBe(MEMORIES[1].caption);
  });

  it("renders untrusted clocks as 'Time unknown', never a fabricated moment", () => {
    const stops = stopScenes(buildScenes(JOURNEY, MEMORIES, KOZHIKODE_PLACES, KOZHIKODE));
    expect(stops[1].timeLabel).toBe("Time unknown"); // Mananchira — null clock
    expect(stops[0].timeLabel.length).toBeGreaterThan(0); // trusted clock → a real label
  });

  it("summarizes the run in the finale: stops, distance, duration", () => {
    const finale = finaleScene(buildScenes(JOURNEY, MEMORIES, KOZHIKODE_PLACES, KOZHIKODE));
    expect(finale.stopCount).toBe(3);
    const expectedKm =
      Math.round(
        ((distanceMeters(BEACH.coords, MANANCHIRA.coords) +
          distanceMeters(MANANCHIRA.coords, SM_STREET.coords)) /
          1000) *
          10,
      ) / 10;
    expect(finale.totalDistanceKm).toBe(expectedKm);
    expect(finale.durationLabel).toBe("1 h 24 min"); // T0 → T2, both trusted
  });

  it("omits the duration line when the clock gave fewer than two trusted stamps", () => {
    const oneClock = [
      memory({ id: "mem-0", missionId: `${JOURNEY.id}--m0`, placeId: "kozhikode--kozhikode-beach", completedAt: T0 }),
      memory({ id: "mem-1", missionId: `${JOURNEY.id}--m1`, placeId: "kozhikode--mananchira-square", completedAt: null }),
    ];
    expect(finaleScene(buildScenes(JOURNEY, oneClock, KOZHIKODE_PLACES, KOZHIKODE)).durationLabel).toBeNull();
  });

  it("replays a journey with no memories as title → finale, honestly empty", () => {
    const scenes = buildScenes(JOURNEY, [], KOZHIKODE_PLACES, KOZHIKODE);
    expect(sceneKinds(scenes)).toEqual(["title", "finale"]);
    expect(finaleScene(scenes)).toEqual({
      kind: "finale",
      journeyId: JOURNEY.id,
      stopCount: 0,
      totalDistanceKm: 0,
      durationLabel: null,
    });
  });

  it("is deterministic — identical inputs produce identical scenes", () => {
    const a = buildScenes(JOURNEY, MEMORIES, KOZHIKODE_PLACES, KOZHIKODE);
    const b = buildScenes(JOURNEY, MEMORIES, KOZHIKODE_PLACES, KOZHIKODE);
    expect(a).toEqual(b);
  });

  it("names the title scene from the city object, or dresses the city id", () => {
    const withCity = buildScenes(JOURNEY, MEMORIES, KOZHIKODE_PLACES, KOZHIKODE);
    const withoutCity = buildScenes(JOURNEY, MEMORIES, KOZHIKODE_PLACES);
    expect(withCity[0].kind).toBe("title");
    expect(withoutCity[0].kind).toBe("title");
    if (withCity[0].kind !== "title" || withoutCity[0].kind !== "title") throw new Error("unreachable");
    expect(withCity[0].cityName).toBe("Kozhikode");
    expect(withoutCity[0].cityName).toBe("Kozhikode"); // cityId dressed for display
    expect(withCity[0].startedAt).toBe(JOURNEY.createdAt);
  });
});

// ---------------------------------------------------------------------------
// Time and duration labels
// ---------------------------------------------------------------------------

describe("formatTimeLabel", () => {
  it("formats a trusted timestamp in the given zone", () => {
    expect(formatTimeLabel(T0, { locale: "en-US", timeZone: "UTC" })).toBe("10:42 AM");
  });

  it("says 'Time unknown' for untrusted clocks", () => {
    expect(formatTimeLabel(null)).toBe("Time unknown");
    expect(formatTimeLabel(Number.NaN)).toBe("Time unknown");
  });
});

describe("journeyDurationLabel", () => {
  it("spans first to last trusted timestamp", () => {
    const memories = [
      memory({ id: "a", missionId: "m0", placeId: "kozhikode--kozhikode-beach", completedAt: T0 }),
      memory({ id: "b", missionId: "m1", placeId: "kozhikode--mananchira-square", completedAt: T2 }),
    ];
    expect(journeyDurationLabel(memories)).toBe("1 h 24 min");
  });

  it("needs two trusted stamps to claim a duration", () => {
    const single = [
      memory({ id: "a", missionId: "m0", placeId: "kozhikode--kozhikode-beach", completedAt: T0 }),
    ];
    expect(journeyDurationLabel(single)).toBeNull();
    expect(journeyDurationLabel([])).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Controller state machine
// ---------------------------------------------------------------------------

describe("replayReducer", () => {
  const COUNT = 4; // title, stop, route, finale
  const playing = (index: number): ReplayState => ({ status: "playing", sceneIndex: index });
  const paused = (index: number): ReplayState => ({ status: "paused", sceneIndex: index });
  const finished = (index: number): ReplayState => ({ status: "finished", sceneIndex: index });

  it("starts from the idle poster and plays from scene 0", () => {
    expect(replayReducer(INITIAL_REPLAY_STATE, { type: "play" }, COUNT)).toEqual(playing(0));
    expect(replayReducer(INITIAL_REPLAY_STATE, { type: "pause" }, COUNT)).toEqual(INITIAL_REPLAY_STATE);
  });

  it("pauses and resumes without losing the scene", () => {
    expect(replayReducer(playing(2), { type: "pause" }, COUNT)).toEqual(paused(2));
    expect(replayReducer(paused(2), { type: "play" }, COUNT)).toEqual(playing(2));
  });

  it("advances on scene-ended and finishes at the last scene", () => {
    expect(replayReducer(playing(0), { type: "scene-ended" }, COUNT)).toEqual(playing(1));
    expect(replayReducer(playing(3), { type: "scene-ended" }, COUNT)).toEqual(finished(3));
    expect(replayReducer(paused(0), { type: "scene-ended" }, COUNT)).toEqual(paused(0));
  });

  it("restarts the film from finished on play", () => {
    expect(replayReducer(finished(3), { type: "play" }, COUNT)).toEqual(playing(0));
  });

  it("keeps playing through next/previous, pausing an idle scrub, ending at the edge", () => {
    expect(replayReducer(INITIAL_REPLAY_STATE, { type: "next" }, COUNT)).toEqual(paused(1));
    expect(replayReducer(playing(1), { type: "next" }, COUNT)).toEqual(playing(2));
    expect(replayReducer(playing(3), { type: "next" }, COUNT)).toEqual(finished(3));
    expect(replayReducer(finished(3), { type: "next" }, COUNT)).toEqual(finished(3));
    expect(replayReducer(playing(2), { type: "previous" }, COUNT)).toEqual(playing(1));
    expect(replayReducer(finished(3), { type: "previous" }, COUNT)).toEqual(paused(2));
    expect(replayReducer(playing(0), { type: "previous" }, COUNT)).toEqual(playing(0));
  });

  it("scrubs to a clamped scene and pauses", () => {
    expect(replayReducer(playing(1), { type: "goto", sceneIndex: 2 }, COUNT)).toEqual(paused(2));
    expect(replayReducer(playing(2), { type: "goto", sceneIndex: 99 }, COUNT)).toEqual(paused(3));
    expect(replayReducer(playing(2), { type: "goto", sceneIndex: -5 }, COUNT)).toEqual(paused(0));
    expect(replayReducer(finished(3), { type: "goto", sceneIndex: 1 }, COUNT)).toEqual(paused(1));
  });

  it("restart returns to the idle poster; an empty scene list ignores everything", () => {
    expect(replayReducer(playing(2), { type: "restart" }, COUNT)).toEqual(INITIAL_REPLAY_STATE);
    const events: ReplayEvent[] = [
      { type: "play" },
      { type: "pause" },
      { type: "next" },
      { type: "previous" },
      { type: "goto", sceneIndex: 1 },
      { type: "restart" },
      { type: "scene-ended" },
    ];
    for (const event of events) {
      expect(replayReducer(playing(0), event, 0)).toEqual(playing(0));
    }
  });

  it("maps every scene kind to a duration", () => {
    const scenes: ReplayScene[] = [
      { kind: "title", journeyId: "j", cityName: "K", startedAt: 0 },
      { kind: "stop", memoryId: "m", photoId: "m", coords: [0, 0], clue: "c", caption: "c", timeLabel: "t" },
      { kind: "route", from: [0, 0], to: [1, 1] },
      { kind: "finale", journeyId: "j", stopCount: 1, totalDistanceKm: 0, durationLabel: null },
    ];
    for (const scene of scenes) {
      expect(sceneDuration(scene)).toBe(SCENE_DURATION_MS[scene.kind]);
    }
  });
});

// ---------------------------------------------------------------------------
// Narration text
// ---------------------------------------------------------------------------

describe("narrationTextForScene", () => {
  it("narrates stops with the store's own caption, nothing invented", () => {
    const scene: ReplayScene = {
      kind: "stop",
      memoryId: "m",
      photoId: "m",
      coords: BEACH.coords,
      clue: "clue",
      caption: "You followed the clue to the shore and kept the photograph.",
      timeLabel: "10:42 AM",
    };
    expect(narrationTextForScene(scene)).toBe(scene.caption);
  });

  it("keeps title, route, and finale to plain data statements", () => {
    expect(narrationTextForScene({ kind: "title", journeyId: "j", cityName: "Kozhikode", startedAt: 0 })).toBe(
      "Kozhikode. A journey, replayed from your photographs.",
    );
    expect(narrationTextForScene({ kind: "route", from: [0, 0], to: [1, 1] })).toBe(
      "The road between two discoveries.",
    );
    expect(
      narrationTextForScene({
        kind: "finale",
        journeyId: "j",
        stopCount: 3,
        totalDistanceKm: 4.2,
        durationLabel: "42 min",
      }),
    ).toBe("3 stops. 4.2 kilometres. That was the day.");
  });
});

// ---------------------------------------------------------------------------
// Backdrop derivation
// ---------------------------------------------------------------------------

describe("replayBackdrop", () => {
  const scenes = buildScenes(JOURNEY, MEMORIES, KOZHIKODE_PLACES, KOZHIKODE);
  // [title, stop beach, route, stop mananchira, route, stop sm street, finale]

  it("shows an empty map on the title", () => {
    const backdrop = replayBackdrop(scenes, 0, 0.5, KOZHIKODE_PLACES);
    expect(backdrop.stops).toEqual([]);
    expect(backdrop.routes).toEqual([]);
    expect(backdrop.currentLeg).toBeNull();
    expect(backdrop.currentStop).toBeNull();
  });

  it("reveals the current stop and keeps it spotlit", () => {
    const backdrop = replayBackdrop(scenes, 1, 0.5, KOZHIKODE_PLACES);
    expect(backdrop.stops.map((stop) => stop.name)).toEqual(["Kozhikode Beach"]);
    expect(backdrop.currentStop?.name).toBe("Kozhikode Beach");
    expect(backdrop.currentLeg).toBeNull();
  });

  it("draws the current leg at the playhead's progress on route scenes", () => {
    const backdrop = replayBackdrop(scenes, 2, 0.4, KOZHIKODE_PLACES);
    expect(backdrop.currentLeg).toEqual({ from: BEACH.coords, to: MANANCHIRA.coords });
    expect(backdrop.legProgress).toBe(0.4);
    expect(backdrop.currentStop).toBeNull();
    expect(backdrop.routes).toEqual([]); // no completed legs yet
  });

  it("accumulates stops and legs as the film advances", () => {
    const backdrop = replayBackdrop(scenes, 3, 0.9, KOZHIKODE_PLACES);
    expect(backdrop.stops.map((stop) => stop.name)).toEqual(["Kozhikode Beach", "Mananchira Square"]);
    expect(backdrop.routes).toEqual([[BEACH.coords, MANANCHIRA.coords]]);
    expect(backdrop.currentLeg).toBeNull(); // the leg finished with its scene
  });

  it("clamps leg progress and shows the whole route at the finale", () => {
    const midRoute = replayBackdrop(scenes, 4, 7, KOZHIKODE_PLACES);
    expect(midRoute.legProgress).toBe(1);
    expect(midRoute.currentLeg).toEqual({ from: MANANCHIRA.coords, to: SM_STREET.coords });

    const finale = replayBackdrop(scenes, scenes.length - 1, 0.5, KOZHIKODE_PLACES);
    expect(finale.stops.length).toBe(3);
    expect(finale.routes.length).toBe(2);
    expect(finale.currentLeg).toBeNull();
    expect(finale.currentStop).toBeNull();
  });

  it("tolerates an out-of-range playhead", () => {
    expect(replayBackdrop(scenes, 99, 0.5, KOZHIKODE_PLACES).stops.length).toBe(3);
    expect(replayBackdrop([], 0, 0.5, KOZHIKODE_PLACES).stops).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// City display name
// ---------------------------------------------------------------------------

describe("cityDisplayName", () => {
  it("prefers the city object's name and dresses a bare id otherwise", () => {
    expect(cityDisplayName("kozhikode", KOZHIKODE)).toBe("Kozhikode");
    expect(cityDisplayName("kozhikode")).toBe("Kozhikode");
    expect(cityDisplayName("station-side-drift")).toBe("Station Side Drift");
  });
});
