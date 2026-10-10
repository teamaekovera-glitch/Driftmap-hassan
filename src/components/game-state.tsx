"use client";

/**
 * The game-state context — hydrated. Screens read the run through useGameState
 * and stay presentational; persistence lives beneath a `PlayStore` that
 * degrades to in-memory when IndexedDB is unavailable or a write fails (spec:
 * the app keeps running rather than corrupting state — failures surface as a
 * visible notice with export-first guidance).
 *
 * Mission status is derived state here, never stored: a run regenerates
 * deterministically from its journey record and statuses come from memories.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { DEMO_CITY_BUNDLE } from "@/data/cities";
import { StorageError, toStorageError } from "@/lib/db";
import {
  completeMission as completeMissionFlow,
  createIdbPlayStore,
  createMemoryPlayStore,
  loadJourneyState,
  startJourney as startJourneyFlow,
  type JourneyRunState,
  type PlayStore,
} from "@/lib/play-flow";
import type { MemoryRecord, Mission, PersonalityId, Place, PhotoAsset } from "@/lib/types";

/**
 * Kept compatible with the pre-hydration skeleton's union; this provider
 * produces `loading` → `ready` (and `ready` with a storage error for the
 * degraded in-memory mode).
 */
export type GameStateStatus = "idle" | "loading" | "ready" | "error";

/** What a confirmed capture hands back to the caller for the reveal. */
export interface CompletionOutcome {
  mission: Mission;
  place: Place;
  memory: MemoryRecord;
  photoAsset: PhotoAsset;
  /** True when this was the last mission of the run. */
  runComplete: boolean;
}

export interface GameState {
  status: GameStateStatus;
  /** The active run, or null when no journey has been started. */
  run: JourneyRunState | null;
  /** Set when persistence failed — the UI renders the degraded-mode notice. */
  storageError: StorageError | null;
  startJourney(personality: PersonalityId): Promise<void>;
  completeActiveMission(input: {
    photo: Blob;
    note?: string;
    coords?: [number, number] | null;
  }): Promise<CompletionOutcome>;
  dismissStorageError(): void;
}

const GameStateContext = createContext<GameState | null>(null);

export function GameStateProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<GameStateStatus>("loading");
  const [run, setRun] = useState<JourneyRunState | null>(null);
  const [storageError, setStorageError] = useState<StorageError | null>(null);

  const runRef = useRef<JourneyRunState | null>(null);
  const storeRef = useRef<PlayStore | null>(null);

  const applyRun = useCallback((next: JourneyRunState | null) => {
    runRef.current = next;
    setRun(next);
  }, []);

  // First mount: open IndexedDB and resume the newest active journey.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const store = createIdbPlayStore();
        const loaded = await loadJourneyState(store);
        if (cancelled) return;
        storeRef.current = store;
        applyRun(loaded);
      } catch (error) {
        // Storage unavailable at open — play continues in memory this session.
        const storageFailure = toStorageError(error);
        if (cancelled) return;
        storeRef.current = createMemoryPlayStore();
        setStorageError(storageFailure);
        applyRun(null);
      } finally {
        if (!cancelled) setStatus("ready");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [applyRun]);

  /**
   * Run an action against the active store. A storage failure degrades the
   * session to the in-memory store (seeded with the run loaded so far) and
   * retries there once — an action never dead-ends on a quota or private
   * mode; the notice tells the player what happened.
   */
  const withStore = useCallback(
    async <T,>(action: (store: PlayStore) => Promise<T>): Promise<T> => {
      const store = storeRef.current;
      if (!store) throw new Error("Game state is not ready yet.");
      try {
        return await action(store);
      } catch (error) {
        const storageFailure = toStorageError(error);
        const current = runRef.current;
        storeRef.current = createMemoryPlayStore(
          current ? { journeys: [current.journey], memories: current.memories } : {},
        );
        setStorageError(storageFailure);
        return action(storeRef.current);
      }
    },
    [],
  );

  const startJourney = useCallback(
    async (personality: PersonalityId) => {
      const started = await withStore(async (store) =>
        startJourneyFlow(store, {
          city: DEMO_CITY_BUNDLE.city,
          places: DEMO_CITY_BUNDLE.places,
          personality,
        }),
      );
      applyRun({
        journey: started.journey,
        city: DEMO_CITY_BUNDLE.city,
        places: DEMO_CITY_BUNDLE.places,
        missions: started.missions,
        memories: [],
        activeMission: started.missions[0] ?? null,
        progress: {
          found: 0,
          total: started.missions.length,
          complete: started.missions.length === 0,
          current: 1,
        },
        reasonLog: started.reasonLog,
      });
    },
    [applyRun, withStore],
  );

  const completeActiveMission = useCallback(
    async (input: {
      photo: Blob;
      note?: string;
      coords?: [number, number] | null;
    }): Promise<CompletionOutcome> => {
      const current = runRef.current;
      const mission = current?.activeMission;
      if (!current || !mission) {
        throw new Error("No active mission to complete.");
      }
      const place = current.places.find((candidate) => candidate.id === mission.placeId);
      if (!place) {
        throw new Error("The active mission's place is missing from the dataset.");
      }

      const result = await withStore(async (store) =>
        completeMissionFlow(store, {
          journey: current.journey,
          missions: current.missions,
          mission,
          place,
          photo: input.photo,
          note: input.note,
          coords: input.coords ?? null,
        }),
      );

      const nextActive =
        result.missions.find((candidate) => candidate.status === "active") ?? null;
      applyRun({
        ...current,
        journey: result.journey,
        missions: result.missions,
        memories: [...current.memories, result.memory],
        activeMission: nextActive,
        progress: result.progress,
      });

      return {
        mission,
        place,
        memory: result.memory,
        photoAsset: result.photoAsset,
        runComplete: result.progress.complete,
      };
    },
    [applyRun, withStore],
  );

  const dismissStorageError = useCallback(() => setStorageError(null), []);

  const value = useMemo<GameState>(
    () => ({
      status,
      run,
      storageError,
      startJourney,
      completeActiveMission,
      dismissStorageError,
    }),
    [status, run, storageError, startJourney, completeActiveMission, dismissStorageError],
  );

  return <GameStateContext.Provider value={value}>{children}</GameStateContext.Provider>;
}

export function useGameState(): GameState {
  const state = useContext(GameStateContext);
  if (!state) {
    throw new Error("useGameState must be used inside <GameStateProvider>.");
  }
  return state;
}
