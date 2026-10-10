"use client";

/**
 * LandingPick — the landing's city + personality pick. Kozhikode is the one
 * curated launch city, so the city field states a fact rather than offering
 * a choice. The personality radios mirror JourneyStart's keyboard model and
 * reuse its blurbs; carrying the pick to /play?personality= keeps journey
 * creation in exactly one place — the play screen's own start card.
 */

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Button } from "./button";
import { Panel } from "./panel";
import { PERSONALITY_BLURBS, PERSONALITY_ORDER } from "./journey-start";
import { KOZHIKODE } from "@/data/kozhikode";
import type { PersonalityId } from "@/lib/types";

export function LandingPick() {
  const router = useRouter();
  const [selected, setSelected] = useState<PersonalityId | null>(null);
  const groupRef = useRef<HTMLDivElement>(null);

  // Roving arrow-key selection, matching the play screen's radio group.
  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const index = selected ? PERSONALITY_ORDER.indexOf(selected) : -1;
    const delta = event.key === "ArrowDown" ? 1 : -1;
    const next =
      PERSONALITY_ORDER[(index + delta + PERSONALITY_ORDER.length) % PERSONALITY_ORDER.length];
    setSelected(next);
    groupRef.current
      ?.querySelector<HTMLInputElement>(`input[value="${next}"]`)
      ?.focus();
  };

  return (
    <Panel title="Begin a drift">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-muted">City</p>
        <p className="mt-1 text-sm">
          <span className="font-display text-lg text-ivory">{KOZHIKODE.name}</span>
          <span className="ml-2 text-xs text-muted">the launch city — more follow</span>
        </p>
      </div>

      <p className="mt-5 text-xs uppercase tracking-[0.2em] text-muted">Personality</p>
      <div
        ref={groupRef}
        role="radiogroup"
        aria-label="Choose a personality"
        onKeyDown={handleKeyDown}
        className="mt-2 flex flex-col gap-2"
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
                name="landing-personality"
                value={personality}
                checked={checked}
                onChange={() => setSelected(personality)}
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
          onClick={() => router.push(`/play?personality=${selected}`)}
          disabled={!selected}
        >
          Start exploring
        </Button>
      </div>
      <p className="mt-3 text-xs text-muted">
        You will confirm the run on the next screen — nothing starts until then.
      </p>
    </Panel>
  );
}
