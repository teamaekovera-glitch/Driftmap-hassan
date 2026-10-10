"use client";

/**
 * ReplayControls — the transport for the film: play/pause, previous/next,
 * restart, narration mute, and the scrubbable scene strip. Every control is
 * a real button, keyboard-operable, with visible focus states inherited from
 * the design system. The narration toggle says why it is disabled when
 * speechSynthesis is missing — the captions carry the experience regardless.
 */
import { Button } from "./button";
import type { ReplayScene, ReplayState } from "@/lib/replay";

export interface ReplayControlsProps {
  scenes: ReplayScene[];
  state: ReplayState;
  /** speechSynthesis exists in this browser. */
  speechAvailable: boolean;
  narrationOn: boolean;
  onPlay: () => void;
  onPause: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onRestart: () => void;
  onGoto: (sceneIndex: number) => void;
  onToggleNarration: () => void;
}

function sceneLabel(allScenes: ReplayScene[], index: number): string {
  const scene = allScenes[index];
  switch (scene.kind) {
    case "title":
      return "Start";
    case "stop": {
      // Count stops, not scenes, so the strip reads like a film's chapters.
      let stopNumber = 0;
      for (let i = 0; i <= index; i++) {
        if (allScenes[i].kind === "stop") stopNumber++;
      }
      return `Stop ${stopNumber}`;
    }
    case "route":
      return "En route";
    case "finale":
      return "Finale";
  }
}

function sceneTooltip(scene: ReplayScene): string | undefined {
  switch (scene.kind) {
    case "stop":
      return scene.caption;
    case "finale":
      return "The summary";
    case "title":
      return "The opening";
    default:
      return undefined;
  }
}

export function ReplayControls({
  scenes,
  state,
  speechAvailable,
  narrationOn,
  onPlay,
  onPause,
  onNext,
  onPrevious,
  onRestart,
  onGoto,
  onToggleNarration,
}: ReplayControlsProps) {
  const playing = state.status === "playing";
  const lastScene = scenes.length - 1;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" onClick={onRestart} aria-label="Restart the replay">
          Restart
        </Button>
        <Button variant="ghost" onClick={onPrevious} disabled={state.sceneIndex === 0} aria-label="Previous scene">
          Previous
        </Button>
        {playing ? (
          <Button variant="primary" onClick={onPause} aria-label="Pause the replay">
            Pause
          </Button>
        ) : (
          <Button
            variant="primary"
            onClick={onPlay}
            aria-label={state.status === "playing" ? undefined : "Play the replay"}
          >
            {state.status === "finished" ? "Replay" : "Play"}
          </Button>
        )}
        <Button
          variant="ghost"
          onClick={onNext}
          disabled={state.sceneIndex === lastScene && state.status === "finished"}
          aria-label="Next scene"
        >
          Next
        </Button>
        <Button
          variant="ghost"
          onClick={onToggleNarration}
          disabled={!speechAvailable}
          aria-pressed={narrationOn}
          title={
            speechAvailable
              ? narrationOn
                ? "Mute narration"
                : "Turn on narration"
              : "Speech synthesis is unavailable in this browser — captions carry the film."
          }
        >
          Narration: {speechAvailable ? (narrationOn ? "On" : "Off") : "N/A"}
        </Button>
        <p className="ml-auto text-xs text-muted" aria-live="polite">
          {scenes.length > 0
            ? `Scene ${state.sceneIndex + 1} of ${scenes.length}`
            : "No scenes"}
        </p>
      </div>

      {/* Scrubbable scene strip — a chapter list for the film. */}
      <nav aria-label="Replay scenes">
        <ol className="flex flex-wrap gap-1.5">
          {scenes.map((scene, index) => {
            const active = index === state.sceneIndex;
            const visited = index < state.sceneIndex;
            return (
              <li key={`${scene.kind}-${index}`}>
                <button
                  type="button"
                  onClick={() => onGoto(index)}
                  title={sceneTooltip(scene)}
                  aria-current={active ? "true" : undefined}
                  aria-label={`${sceneLabel(scenes, index)} (scene ${index + 1})`}
                  className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                    active
                      ? "border-accent text-accent"
                      : visited
                        ? "border-line text-ivory hover:border-accent hover:text-accent"
                        : "border-line text-muted hover:border-accent hover:text-accent"
                  }`}
                >
                  {sceneLabel(scenes, index)}
                </button>
              </li>
            );
          })}
        </ol>
      </nav>
    </div>
  );
}
