"use client";

/**
 * ReplayPlayer — the data surface for /replay: journeys come out of
 * IndexedDB, the viewer picks one, and the film runs. The player owns the
 * data load and the photo object URLs; ReplayRun owns the clock, the
 * controller state machine, and the narration. Nothing here reaches the
 * network — a journey replays offline by construction.
 */
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { KOZHIKODE, KOZHIKODE_PLACES } from "@/data/kozhikode";
import { getPhoto, listJourneys, listMemories, toStorageError } from "@/lib/db";
import {
  buildScenes,
  cityDisplayName,
  INITIAL_REPLAY_STATE,
  narrationTextForScene,
  replayReducer,
  sceneDuration,
  type ReplayEvent,
  type ReplayState,
} from "@/lib/replay";
import type { Journey, MemoryRecord } from "@/lib/types";
import { buttonClasses } from "./button";
import { Panel } from "./panel";
import { ReplayControls } from "./replay-controls";
import { ReplayStage } from "./replay-stage";
import { usePrefersReducedMotion } from "./use-tile-map";

interface LoadedJourney {
  journey: Journey;
  memories: MemoryRecord[];
  photoUrls: Map<string, string>;
}

function journeyLabel(journey: Journey): string {
  const city = cityDisplayName(journey.cityId);
  if (journey.kind === "demo") return `${city} · Demo`;
  return `${city} · ${new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(journey.createdAt)}`;
}

export function ReplayPlayer() {
  const searchParams = useSearchParams();
  const requestedId = searchParams.get("journey");

  const [journeys, setJourneys] = useState<Journey[] | null>(null);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<LoadedJourney | null>(null);
  const [photosLoading, setPhotosLoading] = useState(false);

  // Load the journey list once; honour a ?journey= deep link if it exists.
  useEffect(() => {
    let cancelled = false;
    listJourneys()
      .then((all) => {
        if (cancelled) return;
        setJourneys(all);
        setSelectedId((current) => {
          if (current && all.some((journey) => journey.id === current)) return current;
          const requested =
            requestedId && all.some((journey) => journey.id === requestedId) ? requestedId : undefined;
          return requested ?? all[0]?.id ?? null;
        });
      })
      .catch((error) => {
        if (cancelled) return;
        setStorageError(toStorageError(error).message);
      });
    return () => {
      cancelled = true;
    };
  }, [requestedId]);

  // Load the selected journey's memories and photo object URLs. Object URLs
  // are revoked when the selection changes or the surface unmounts.
  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    const createdUrls: string[] = [];
    setPhotosLoading(true);
    void (async () => {
      const memories = await listMemories(selectedId);
      const photoUrls = new Map<string, string>();
      for (const memory of memories) {
        const photo = await getPhoto(memory.id);
        if (photo) {
          const url = URL.createObjectURL(photo.blob);
          photoUrls.set(memory.id, url);
          createdUrls.push(url);
        }
      }
      const journey = journeys?.find((candidate) => candidate.id === selectedId);
      if (cancelled) return;
      if (journey) setLoaded({ journey, memories, photoUrls });
      setPhotosLoading(false);
    })().catch((error) => {
      if (cancelled) return;
      setStorageError(toStorageError(error).message);
      setPhotosLoading(false);
    });
    return () => {
      cancelled = true;
      for (const url of createdUrls) URL.revokeObjectURL(url);
    };
  }, [selectedId, journeys]);

  if (storageError) {
    return (
      <Panel title="Replay">
        <p className="text-sm leading-relaxed text-ivory">{storageError}</p>
        <div className="mt-4 flex gap-2">
          <Link href="/memory" className={buttonClasses("ghost")}>
            Open the memory browser
          </Link>
        </div>
      </Panel>
    );
  }

  if (journeys === null) {
    return (
      <Panel title="Replay">
        <p className="text-sm text-muted" aria-live="polite">
          Opening the memory vault…
        </p>
      </Panel>
    );
  }

  if (journeys.length === 0) {
    return (
      <Panel title="Replay">
        <p className="font-display text-xl text-ivory">No journeys yet.</p>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          A journey becomes a film when you complete its missions. Play the city — or open the
          bundled demo — and this player will fill with what you found.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/play" className={buttonClasses("primary")}>
            Explore the city
          </Link>
          <Link href="/" className={buttonClasses("ghost")}>
            Try the demo
          </Link>
        </div>
      </Panel>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div
        className="flex flex-wrap items-center gap-1.5"
        role="group"
        aria-label="Choose a journey to replay"
      >
        {journeys.map((journey) => {
          const active = journey.id === (loaded?.journey.id ?? selectedId);
          return (
            <button
              key={journey.id}
              type="button"
              onClick={() => setSelectedId(journey.id)}
              aria-pressed={active}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                active
                  ? "border-accent text-accent"
                  : "border-line text-muted hover:border-accent hover:text-accent"
              }`}
            >
              {journeyLabel(journey)}
            </button>
          );
        })}
      </div>

      {loaded ? (
        <ReplayRun
          key={loaded.journey.id}
          journey={loaded.journey}
          memories={loaded.memories}
          photoUrls={loaded.photoUrls}
          photosLoading={photosLoading}
        />
      ) : (
        <Panel title="Replay">
          <p className="text-sm text-muted" aria-live="polite">
            Loading the journey…
          </p>
        </Panel>
      )}
    </div>
  );
}

interface ReplayRunProps {
  journey: Journey;
  memories: MemoryRecord[];
  photoUrls: Map<string, string>;
  photosLoading: boolean;
}

/**
 * One film. Owns the controller state machine, the scene clock (accumulated
 * across pauses), and narration. Keyed by journey id so a new film starts
 * clean at the poster.
 */
function ReplayRun({ journey, memories, photoUrls, photosLoading }: ReplayRunProps) {
  const scenes = useMemo(
    () => buildScenes(journey, memories, KOZHIKODE_PLACES, KOZHIKODE),
    [journey, memories],
  );
  const sceneCount = scenes.length;
  const runReducer = useCallback(
    (state: ReplayState, event: ReplayEvent) => replayReducer(state, event, sceneCount),
    [sceneCount],
  );
  const [state, dispatch] = useReducer(runReducer, INITIAL_REPLAY_STATE);
  const sceneIndex = state.sceneIndex;

  // The scene clock: elapsed time accumulates across pauses and resumes, and
  // a rAF loop writes live 0..1 progress into a ref for the canvas painter.
  const progressRef = useRef(0);
  const elapsedRef = useRef({ index: -1, ms: 0 });
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    if (state.status !== "playing") return;
    const scene = scenes[sceneIndex];
    if (!scene) return;

    const duration = sceneDuration(scene);
    if (elapsedRef.current.index !== sceneIndex) elapsedRef.current = { index: sceneIndex, ms: 0 };
    const startedAt = performance.now() - elapsedRef.current.ms;
    progressRef.current = Math.min(elapsedRef.current.ms / duration, 1);

    let raf = requestAnimationFrame(function tick() {
      progressRef.current = Math.min(Math.max((performance.now() - startedAt) / duration, 0), 1);
      raf = requestAnimationFrame(tick);
    });
    const timer = setTimeout(() => {
      elapsedRef.current = { index: sceneIndex, ms: duration };
      progressRef.current = 1;
      dispatch({ type: "scene-ended" });
    }, Math.max(0, duration - elapsedRef.current.ms));

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
      if (elapsedRef.current.index === sceneIndex) {
        elapsedRef.current = {
          index: sceneIndex,
          ms: Math.min(duration, elapsedRef.current.ms + (performance.now() - startedAt)),
        };
      }
    };
  }, [state.status, sceneIndex, scenes]);

  // Narration: spoken when speechSynthesis exists, narration is on, and the
  // film is playing. Cancelled on pause/scene-change/unmount. Captions carry
  // the whole experience regardless — narration is always optional.
  const [speechAvailable, setSpeechAvailable] = useState(false);
  const [narrationOn, setNarrationOn] = useState(true);
  useEffect(() => {
    setSpeechAvailable(typeof window !== "undefined" && "speechSynthesis" in window);
  }, []);
  useEffect(() => {
    const synth = typeof window === "undefined" ? undefined : window.speechSynthesis;
    if (!synth) return;
    if (state.status !== "playing" || !narrationOn) {
      synth.cancel();
      return;
    }
    const scene = scenes[sceneIndex];
    if (!scene) return;
    const utterance = new SpeechSynthesisUtterance(narrationTextForScene(scene));
    utterance.rate = 0.95;
    synth.cancel();
    synth.speak(utterance);
    return () => synth.cancel();
  }, [state.status, sceneIndex, narrationOn, speechAvailable, scenes]);

  // The run anchors its backdrop on the bundled city; an unknown city id in
  // the store still films its stops — only the map home differs.
  const city = KOZHIKODE;

  return (
    <div className="flex flex-col gap-4">
      <ReplayStage
        city={city}
        scenes={scenes}
        sceneIndex={sceneIndex}
        status={state.status}
        photoUrls={photoUrls}
        photosLoading={photosLoading}
        isDemo={journey.kind === "demo"}
        progressRef={progressRef}
      />
      <ReplayControls
        scenes={scenes}
        state={state}
        speechAvailable={speechAvailable}
        narrationOn={narrationOn}
        onPlay={() => dispatch({ type: "play" })}
        onPause={() => dispatch({ type: "pause" })}
        onNext={() => dispatch({ type: "next" })}
        onPrevious={() => dispatch({ type: "previous" })}
        onRestart={() => dispatch({ type: "restart" })}
        onGoto={(index) => dispatch({ type: "goto", sceneIndex: index })}
        onToggleNarration={() => setNarrationOn((on) => !on)}
      />
      <p className="text-xs text-muted">
        {reducedMotion
          ? "Reduced motion is on — the film cuts instead of flying, and captions carry every scene."
          : "Sit back, or scrub the strip below the film — the journey is yours."}
      </p>
    </div>
  );
}
