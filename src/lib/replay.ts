/**
 * Cinematic replay — the film derived entirely from the journey store.
 *
 * `buildScenes` turns journeys + memories + places into an ordered scene
 * list (title → stop/route pairs → finale); the small reducer below is the
 * player state machine (idle → playing ⇄ paused → finished) the spec
 * describes. Everything here is pure: no React, no network, no clock reads
 * beyond formatting values the store already holds.
 *
 * Honesty rules that shape this module:
 * - Captions and clues come from the store as-is; narration text is built
 *   from local templates that only claim what the data shows. Nothing here
 *   claims to know the player's feelings.
 * - A memory whose place is unknown is skipped, never crashed on; a memory
 *   with an untrusted clock (`completedAt: null`) keeps its stop and says
 *   "Time unknown".
 */

import { distanceMeters } from "./geo";
import { orderMemoriesForJourney } from "./fog";
import type { City, Journey, MemoryRecord, Place } from "./types";

// ---------------------------------------------------------------------------
// Scenes
// ---------------------------------------------------------------------------

export type ReplayScene =
  | { kind: "title"; journeyId: string; cityName: string; startedAt: number }
  | {
      kind: "stop";
      /** Equals the photo id — one memory, one photo. */
      memoryId: string;
      photoId: string;
      coords: [number, number];
      clue: string;
      caption: string;
      timeLabel: string;
    }
  | { kind: "route"; from: [number, number]; to: [number, number] }
  | {
      kind: "finale";
      journeyId: string;
      stopCount: number;
      totalDistanceKm: number;
      /**
       * Clock-trusted span of the run, or null when fewer than two stops
       * have trusted timestamps — the film omits the line rather than
       * inventing a duration.
       */
      durationLabel: string | null;
    };

/**
 * The film's scene list, in order. Memories are ordered for the journey
 * (mission index first, untrusted clocks last); each stop gets its scene,
 * consecutive stops get the route leg between them, and the finale carries
 * the run's summary. Memories from other journeys are ignored; memories
 * pointing at unknown places are skipped safely.
 *
 * The `city` argument only names the title scene; without it the city id is
 * dressed for display ("kozhikode" → "Kozhikode") — no facts invented.
 */
export function buildScenes(
  journey: Journey,
  memories: MemoryRecord[],
  places: Place[],
  city?: City,
): ReplayScene[] {
  const placesById = new Map(places.map((place) => [place.id, place]));
  const ordered = orderMemoriesForJourney(
    memories.filter((memory) => memory.journeyId === journey.id),
  );

  const scenes: ReplayScene[] = [
    {
      kind: "title",
      journeyId: journey.id,
      cityName: cityDisplayName(journey.cityId, city),
      startedAt: journey.createdAt,
    },
  ];

  const legs: [number, number][][] = [];
  let previousCoords: [number, number] | null = null;
  for (const memory of ordered) {
    const place = placesById.get(memory.placeId);
    if (!place) continue; // unknown place reference — skip, never crash
    if (previousCoords) {
      legs.push([previousCoords, place.coords]);
      scenes.push({ kind: "route", from: previousCoords, to: place.coords });
    }
    scenes.push({
      kind: "stop",
      memoryId: memory.id,
      photoId: memory.id,
      coords: place.coords,
      clue: memory.clue,
      caption: memory.caption,
      timeLabel: formatTimeLabel(memory.completedAt),
    });
    previousCoords = place.coords;
  }

  scenes.push({
    kind: "finale",
    journeyId: journey.id,
    stopCount: ordered.filter((memory) => placesById.has(memory.placeId)).length,
    totalDistanceKm: totalDistanceKm(legs),
    durationLabel: journeyDurationLabel(ordered),
  });

  return scenes;
}

/** The finale's distance line: great-circle kilometres over the run's legs, 1 dp. */
function totalDistanceKm(legs: [number, number][][]): number {
  const meters = legs.reduce(
    (sum, [from, to]) => sum + distanceMeters(from, to),
    0,
  );
  return Math.round((meters / 1000) * 10) / 10;
}

/** "kozhikode" → "Kozhikode"; the city object wins when provided. */
export function cityDisplayName(cityId: string, city?: City): string {
  if (city) return city.name;
  return cityId
    .split("-")
    .map((word) => (word ? word[0].toUpperCase() + word.slice(1) : word))
    .join(" ");
}

// ---------------------------------------------------------------------------
// Time labels — the clock the store actually has, honestly rendered
// ---------------------------------------------------------------------------

const TIME_UNKNOWN_LABEL = "Time unknown";

/**
 * A stop's timestamp as a wall-clock label. Untrusted clocks (null) get an
 * honest "Time unknown" rather than a fabricated moment. Locale and zone
 * are injectable so tests can pin the output.
 */
export function formatTimeLabel(
  completedAt: number | null,
  options?: { locale?: string; timeZone?: string },
): string {
  if (completedAt === null || !Number.isFinite(completedAt)) {
    return TIME_UNKNOWN_LABEL;
  }
  return new Intl.DateTimeFormat(options?.locale, {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    ...(options?.timeZone ? { timeZone: options.timeZone } : {}),
  }).format(completedAt);
}

/**
 * The run's duration from its trusted timestamps (last stop minus first).
 * Fewer than two trusted timestamps → null: the film omits the duration
 * line instead of pretending.
 */
export function journeyDurationLabel(memories: MemoryRecord[]): string | null {
  const times = memories
    .map((memory) => memory.completedAt)
    .filter((time): time is number => typeof time === "number" && Number.isFinite(time));
  if (times.length < 2) return null;

  const spanMs = Math.max(Math.max(...times) - Math.min(...times), 0);
  const totalMinutes = Math.round(spanMs / 60_000);
  if (totalMinutes < 1) return "under a minute";
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes} min`;
  if (minutes === 0) return `${hours} h`;
  return `${hours} h ${minutes} min`;
}

// ---------------------------------------------------------------------------
// Scene timing
// ---------------------------------------------------------------------------

/** Per-kind scene length, in ms — the film's editing rhythm. */
export const SCENE_DURATION_MS = {
  title: 3_200,
  stop: 6_000,
  route: 2_600,
  finale: 6_000,
} as const satisfies Record<ReplayScene["kind"], number>;

export function sceneDuration(scene: ReplayScene): number {
  return SCENE_DURATION_MS[scene.kind];
}

// ---------------------------------------------------------------------------
// The player state machine — idle → playing ⇄ paused → finished
// ---------------------------------------------------------------------------

export type ReplayStatus = "idle" | "playing" | "paused" | "finished";

export interface ReplayState {
  status: ReplayStatus;
  sceneIndex: number;
}

export const INITIAL_REPLAY_STATE: ReplayState = { status: "idle", sceneIndex: 0 };

export type ReplayEvent =
  | { type: "play" }
  | { type: "pause" }
  | { type: "next" }
  | { type: "previous" }
  | { type: "goto"; sceneIndex: number }
  | { type: "restart" }
  /** The current scene's timer ran out while playing. */
  | { type: "scene-ended" };

/**
 * Transition table, total over every (state, event) pair — unknown
 * combinations are no-ops rather than crashes. Player semantics:
 * - play from idle or finished starts (or restarts) the film at scene 0;
 * - next/previous move the scene and keep playing; at the edges next ends
 *   the film and previous holds;
 * - scrubbing (goto) pauses — browsing the film frame by frame;
 * - restart returns to the idle poster.
 */
export function replayReducer(
  state: ReplayState,
  event: ReplayEvent,
  sceneCount: number,
): ReplayState {
  if (sceneCount <= 0) return state;

  const lastIndex = sceneCount - 1;
  const { status, sceneIndex } = state;

  switch (event.type) {
    case "play": {
      if (status === "playing") return state;
      const restarting = status === "finished" || status === "idle";
      return {
        status: "playing",
        sceneIndex: restarting ? 0 : sceneIndex,
      };
    }
    case "pause":
      return status === "playing" ? { status: "paused", sceneIndex } : state;
    case "scene-ended": {
      if (status !== "playing") return state;
      return sceneIndex >= lastIndex
        ? { status: "finished", sceneIndex }
        : { status: "playing", sceneIndex: sceneIndex + 1 };
    }
    case "next": {
      if (sceneIndex >= lastIndex) {
        return status === "playing" ? { status: "finished", sceneIndex } : state;
      }
      return {
        status: status === "idle" ? "paused" : status,
        sceneIndex: sceneIndex + 1,
      };
    }
    case "previous": {
      if (sceneIndex <= 0) return state;
      return {
        status: status === "finished" ? "paused" : status,
        sceneIndex: sceneIndex - 1,
      };
    }
    case "goto": {
      const target = Math.min(Math.max(Math.trunc(event.sceneIndex), 0), lastIndex);
      return { status: "paused", sceneIndex: target };
    }
    case "restart":
      return { status: "idle", sceneIndex: 0 };
  }
}

// ---------------------------------------------------------------------------
// Narration text — local templates, readable captions carry the real film
// ---------------------------------------------------------------------------

/**
 * What the narrator says for each scene. Templates only restate what the
 * scene's own data shows — never a feeling, never an invented fact.
 */
export function narrationTextForScene(scene: ReplayScene): string {
  switch (scene.kind) {
    case "title":
      return `${scene.cityName}. A journey, replayed from your photographs.`;
    case "stop":
      return scene.caption;
    case "route":
      return "The road between two discoveries.";
    case "finale":
      return `${scene.stopCount} stops. ${scene.totalDistanceKm} kilometres. That was the day.`;
  }
}

// ---------------------------------------------------------------------------
// Backdrop derivation — what the map behind the film should show
// ---------------------------------------------------------------------------

export interface ReplayBackdropState {
  /** Stops revealed so far, in journey order. */
  stops: { coords: [number, number]; name: string | undefined }[];
  /** Route legs completed so far. */
  routes: [number, number][][];
  /** The leg the film is currently drawing (route scenes), else null. */
  currentLeg: { from: [number, number]; to: [number, number] } | null;
  /** 0..1 draw progress of the current leg. */
  legProgress: number;
  /** The stop currently on stage (stop scenes), else null. */
  currentStop: { coords: [number, number]; name: string | undefined } | null;
}

/**
 * The map backdrop as a pure function of the scene list and playhead: the
 * film literally draws the journey as it plays — stops appear, legs fill
 * in, the whole route is on screen for the finale. Places join by coords
 * (the same join the fog renderers use).
 */
export function replayBackdrop(
  scenes: ReplayScene[],
  sceneIndex: number,
  legProgress: number,
  places: Place[],
): ReplayBackdropState {
  const empty: ReplayBackdropState = {
    stops: [],
    routes: [],
    currentLeg: null,
    legProgress: 0,
    currentStop: null,
  };

  const nameFor = (coords: [number, number]): string | undefined =>
    places.find(
      (place) => place.coords[0] === coords[0] && place.coords[1] === coords[1],
    )?.name;

  const backdrop: ReplayBackdropState = { ...empty, stops: [], routes: [] };

  for (let index = 0; index <= Math.min(sceneIndex, scenes.length - 1); index++) {
    const scene = scenes[index];
    const isPlayhead = index === Math.min(sceneIndex, scenes.length - 1);
    switch (scene.kind) {
      case "title":
        break;
      case "stop": {
        backdrop.stops.push({ coords: scene.coords, name: nameFor(scene.coords) });
        const previous = backdrop.stops[backdrop.stops.length - 2];
        if (previous) backdrop.routes.push([previous.coords, scene.coords]);
        if (isPlayhead) {
          backdrop.currentStop = { coords: scene.coords, name: nameFor(scene.coords) };
          backdrop.currentLeg = null;
        }
        break;
      }
      case "route": {
        if (isPlayhead) {
          backdrop.currentLeg = { from: scene.from, to: scene.to };
          backdrop.currentStop = null;
          backdrop.legProgress = Math.min(Math.max(legProgress, 0), 1);
        }
        break;
      }
      case "finale":
        break;
    }
  }

  return backdrop;
}
