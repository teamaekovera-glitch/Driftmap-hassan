"use client";

/**
 * PlayScreen — the Explore experience, assembled. The full loop: clue →
 * find → photo → confirm → reveal, over the fog map, with the journey-start
 * and journey-complete states bracketing it. All persistence flows through
 * useGameState; this component stays presentational.
 */

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "./button";
import { ConfirmCapture, type ConfirmCaptureDetails } from "./confirm-capture";
import { FogMap } from "./fog-map";
import { useGameState, type CompletionOutcome } from "./game-state";
import { JourneyStart, PERSONALITY_ORDER } from "./journey-start";
import { MissionPanel } from "./mission-panel";
import { Panel } from "./panel";
import { PhotoSheet, type PhotoSheetSample } from "./photo-sheet";
import { RevealTransition } from "./reveal-transition";
import { DEMO_PHOTO_SOURCES } from "@/data/demo-photos";
import { DEMO_CITY_BUNDLE } from "@/data/cities";
import { computeFogState } from "@/lib/fog";
import type { PersonalityId } from "@/lib/types";

type SheetPhase = "closed" | "pick" | "confirm";

/** The demo journey's bundled sample, offered only in demo-photo mode. */
const DEMO_SAMPLE: PhotoSheetSample = {
  url: DEMO_PHOTO_SOURCES["demo-beypore-shipyard"].url,
  label: "Demo",
};

export function PlayScreen() {
  const gameState = useGameState();
  const { run } = gameState;

  const [sheetPhase, setSheetPhase] = useState<SheetPhase>("closed");
  const [pendingPhoto, setPendingPhoto] = useState<{ blob: Blob; url: string } | null>(null);
  const [reveal, setReveal] = useState<(CompletionOutcome & { photoUrl: string }) | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [demoPhotoAllowed, setDemoPhotoAllowed] = useState(false);
  const [initialPersonality, setInitialPersonality] = useState<PersonalityId | null>(null);

  // Demo photos are an explicit opt-in (?demo-photo=1) so a normal player is
  // never offered someone else's bundled picture as "their" find. A landing
  // pick rides in as ?personality= and pre-selects itself on the start card.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setDemoPhotoAllowed(params.has("demo-photo"));
    const personality = params.get("personality");
    if (personality && PERSONALITY_ORDER.includes(personality as PersonalityId)) {
      setInitialPersonality(personality as PersonalityId);
    }
  }, []);

  // Object URLs are callbacks into the browser's blob store — revoke on replace.
  const pendingUrlRef = useRef<string | null>(null);
  useEffect(() => {
    const previous = pendingUrlRef.current;
    pendingUrlRef.current = pendingPhoto?.url ?? null;
    if (previous && previous !== pendingUrlRef.current) URL.revokeObjectURL(previous);
  }, [pendingPhoto]);
  useEffect(
    () => () => {
      if (pendingUrlRef.current) URL.revokeObjectURL(pendingUrlRef.current);
      if (reveal) URL.revokeObjectURL(reveal.photoUrl);
    },
    [reveal],
  );

  // The fog state both renderers share — a pure function of journey progress.
  const fogState = useMemo(
    () =>
      run
        ? computeFogState(run.journey, run.memories, run.places, run.activeMission ?? undefined)
        : null,
    [run],
  );

  const handleStart = async (personality: PersonalityId) => {
    setStarting(true);
    setStartError(null);
    try {
      await gameState.startJourney(personality);
    } catch (error) {
      setStartError(
        error instanceof Error ? error.message : "The journey could not be started.",
      );
    } finally {
      setStarting(false);
    }
  };

  const openSheet = () => {
    setActionError(null);
    setSheetPhase("pick");
  };

  const handleCapture = (blob: Blob) => {
    setPendingPhoto({ blob, url: URL.createObjectURL(blob) });
    setSheetPhase("confirm");
  };

  const handleRetake = () => {
    setSheetPhase("pick");
  };

  const closeSheet = () => {
    setSheetPhase("closed");
    setPendingPhoto(null);
  };

  const handleConfirm = async ({ note, coords }: ConfirmCaptureDetails) => {
    if (!pendingPhoto) return;
    setBusy(true);
    setActionError(null);
    try {
      const outcome = await gameState.completeActiveMission({
        photo: pendingPhoto.blob,
        note: note.trim() ? note.trim() : undefined,
        coords,
      });
      setReveal({ ...outcome, photoUrl: URL.createObjectURL(outcome.photoAsset.blob) });
      closeSheet();
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "Something went wrong saving this memory.",
      );
    } finally {
      setBusy(false);
    }
  };

  const dismissReveal = () => {
    if (reveal) URL.revokeObjectURL(reveal.photoUrl);
    setReveal(null);
  };

  if (gameState.status === "loading") {
    return (
      <div className="mt-10 animate-pulse" aria-live="polite" aria-label="Loading the game">
        <div className="h-[420px] w-full border border-line bg-ink-raised" />
        <div className="mt-8 h-48 w-full border border-line bg-ink-raised" />
      </div>
    );
  }

  const storageNotice = gameState.storageError ? (
    <p
      role="alert"
      className="mt-4 border border-accent/60 bg-ink-raised px-4 py-3 text-sm text-ivory"
    >
      {gameState.storageError.message} Progress this session lives in memory — use
      Export in Remember to keep it.
      <button
        type="button"
        onClick={gameState.dismissStorageError}
        className="ml-2 text-muted underline hover:text-ivory"
      >
        Dismiss
      </button>
    </p>
  ) : null;

  if (!run) {
    return (
      <div>
        {storageNotice}
        <JourneyStart
          city={DEMO_CITY_BUNDLE.city}
          starting={starting}
          error={startError}
          onStart={handleStart}
          initialPersonality={initialPersonality}
        />
      </div>
    );
  }

  const { journey, activeMission, progress } = run;

  return (
    <div>
      {storageNotice}

      <div className="mt-6 flex items-baseline justify-between gap-4">
        <h1 className="font-display text-3xl text-ivory">
          {journey.personality === "chaotic" ? "A chaotic drift" : `A ${journey.personality} drift`}
        </h1>
        <p className="text-sm text-muted" aria-live="polite">
          {progress.found} of {progress.total} found
        </p>
      </div>

      <figure className="mt-4">
        <FogMap
          city={run.city}
          fogState={fogState ?? { revealed: [], routes: [], activeTarget: null }}
          places={run.places}
          className="h-[420px] w-full border border-line"
        />
        <figcaption className="mt-2 text-xs text-muted">
          Fog over the city — completed finds burn holes in it; the dashed circle hides
          your next target.
        </figcaption>
      </figure>

      {activeMission ? (
        <MissionPanel
          mission={activeMission}
          position={activeMission.index + 1}
          total={progress.total}
          found={progress.found}
          onFindIt={openSheet}
          busy={busy}
        />
      ) : null}

      {progress.complete ? (
        <Panel title="Journey complete" className="mt-8">
          <p className="text-sm text-muted">
            {progress.found} stops across {DEMO_CITY_BUNDLE.city.name} — the run is a
            save file now. Replay it as a film, or browse it in Remember.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link href="/replay">
              <Button>Play my journey</Button>
            </Link>
            <Link href="/memory">
              <Button variant="ghost">Open Remember</Button>
            </Link>
          </div>
        </Panel>
      ) : null}

      <PhotoSheet
        open={sheetPhase === "pick"}
        onClose={closeSheet}
        onCapture={handleCapture}
        samplePhoto={demoPhotoAllowed ? DEMO_SAMPLE : undefined}
      />

      {sheetPhase === "confirm" && pendingPhoto ? (
        <ConfirmCapture
          photoUrl={pendingPhoto.url}
          busy={busy}
          error={actionError}
          onConfirm={handleConfirm}
          onRetake={handleRetake}
          onClose={closeSheet}
        />
      ) : null}

      {reveal ? (
        <RevealTransition
          place={reveal.place}
          mission={reveal.mission}
          memory={reveal.memory}
          photoUrl={reveal.photoUrl}
          isFinal={reveal.runComplete}
          onContinue={dismissReveal}
        />
      ) : null}
    </div>
  );
}
