import Link from "next/link";
import { buttonClasses } from "@/components/button";
import { Chip } from "@/components/chip";
import { Panel } from "@/components/panel";
import { PERSONALITY_IDS } from "@/lib/types";

export default function LandingPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-20">
      <p className="text-xs uppercase tracking-[0.3em] text-muted">
        A city exploration game
      </p>
      <h1 className="mt-4 font-display text-5xl leading-tight">
        Get lost. <span className="text-accent">On purpose.</span>
      </h1>
      <p className="mt-6 max-w-xl text-lg text-muted">
        Driftmap turns exploring a real city into a playable game — and the
        finished run into a cinematic travel film. Choose a personality, follow
        cryptic missions to real public places, and let the city reveal itself
        one photograph at a time.
      </p>
      <div className="mt-6 flex flex-wrap gap-2" aria-label="Personalities">
        {PERSONALITY_IDS.map((personality) => (
          <Chip
            key={personality}
            label={
              personality.charAt(0).toUpperCase() + personality.slice(1)
            }
          />
        ))}
      </div>
      <div className="mt-10 flex flex-wrap gap-4">
        <Link href="/play" className={buttonClasses("primary")}>
          Start exploring
        </Link>
        <Link href="/replay" className={buttonClasses("ghost")}>
          Replay a journey
        </Link>
      </div>
      <Panel title="Try the demo" className="mt-16">
        <p className="text-muted">
          A seeded Kozhikode afternoon — six found places, photos, and a replay
          that plays end to end without a network. The demo city is a curated
          subset, not a full index.
        </p>
        <p className="mt-3 text-xs text-muted">
          Demo seeding lands with the demo workstream; the route shells are in
          place today.
        </p>
      </Panel>
    </main>
  );
}
