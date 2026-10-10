"use client";

/**
 * JourneyStart — the /play screen when no journey is active: pick a
 * personality and start. The personality changes which places qualify and in
 * what order (the engine's contract), so each option carries a plain-language
 * blurb instead of marketing.
 */

import { useRef, useState } from "react";
import { Button } from "./button";
import { Panel } from "./panel";
import type { City, PersonalityId } from "@/lib/types";

export interface JourneyStartProps {
  city: City;
  starting: boolean;
  /** Start failure message from the caller, or null. */
  error: string | null;
  onStart: (personality: PersonalityId) => void;
  /** A pick carried from another screen (landing ?personality=). */
  initialPersonality?: PersonalityId | null;
}

/**
 * Shared with the landing screen's pick so both pickers describe the
 * personalities identically — one vocabulary, never drift.
 */
export const PERSONALITY_BLURBS: Record<PersonalityId, string> = {
  curious: "Heritage, culture, and places that reward a second look.",
  broke: "Only free places — the run costs exactly nothing.",
  adventurous: "Long hops and maximum variety, out toward the edges.",
  introverted: "Quiet greens over busy circuits.",
  chaotic: "The seed's dice choose. Expect twists.",
};

export const PERSONALITY_ORDER: PersonalityId[] = [
  "curious",
  "broke",
  "adventurous",
  "introverted",
  "chaotic",
];

export function JourneyStart({
  city,
  starting,
  error,
  onStart,
  initialPersonality = null,
}: JourneyStartProps) {
  const [selected, setSelected] = useState<PersonalityId | null>(initialPersonality);
  const groupRef = useRef<HTMLDivElement>(null);

  // Roving arrow-key selection across the radio-style options.
  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const index = selected ? PERSONALITY_ORDER.indexOf(selected) : -1;
    const delta = event.key === "ArrowDown" ? 1 : -1;
    const next =
      PERSONALITY_ORDER[(index + delta + PERSONALITY_ORDER.length) % PERSONALITY_ORDER.length];
    setSelected(next);
    const radio = groupRef.current?.querySelector<HTMLInputElement>(
      `input[value="${next}"]`,
    );
    radio?.focus();
  };

  return (
    <Panel title="Begin a drift" className="mt-8">
      <p className="text-sm text-muted">
        Six missions through {city.name}. One active at a time — each completed find
        reveals the map a little more.
      </p>

      {error ? (
        <p role="alert" className="mt-4 border border-line bg-ink px-3 py-2 text-sm text-ivory">
          {error}
        </p>
      ) : null}

      <div
        ref={groupRef}
        role="radiogroup"
        aria-label="Choose a personality"
        onKeyDown={handleKeyDown}
        className="mt-5 flex flex-col gap-2"
      >
        {PERSONALITY_ORDER.map((personality) => {
          const checked = selected === personality;
          return (
            <label
              key={personality}
              className={`flex cursor-pointer items-start gap-3 border px-4 py-3 transition-colors ${
                checked ? "border-accent bg-ink" : "border-line hover:border-muted"
              }`}
            >
              <input
                type="radio"
                name="personality"
                value={personality}
                checked={checked}
                onChange={() => setSelected(personality)}
                disabled={starting}
                className="mt-1 h-4 w-4 accent-[#e8a33d]"
              />
              <span>
                <span className="font-display text-lg capitalize text-ivory">
                  {personality}
                </span>
                <span className="mt-0.5 block text-xs text-muted">
                  {PERSONALITY_BLURBS[personality]}
                </span>
              </span>
            </label>
          );
        })}
      </div>

      <div className="mt-6">
        <Button
          onClick={() => selected && onStart(selected)}
          disabled={!selected || starting}
        >
          {starting ? "Dealing missions…" : "Start exploring"}
        </Button>
      </div>
      <p className="mt-3 text-xs text-muted">
        Progress saves on this device. No account, no network needed.
      </p>
    </Panel>
  );
}
