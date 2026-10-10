import Link from "next/link";
import { buttonClasses } from "@/components/button";
import { LandingPick } from "@/components/landing-pick";
import { Panel } from "@/components/panel";
import { ProductPreview } from "@/components/product-preview";
import { TryDemoButton } from "@/components/try-demo-button";
import { DEMO_JOURNEY_TITLE } from "@/lib/demo-journey";

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

      <div className="mt-10 flex flex-wrap gap-4">
        <Link href="/play" className={buttonClasses("primary")}>
          Start exploring
        </Link>
        <Link href="/memory" className={buttonClasses("ghost")}>
          Replay a journey
        </Link>
      </div>

      <ProductPreview />
      <div className="mt-10">
        <LandingPick />
      </div>

      <Panel title="Try the demo" className="mt-10">
        <p className="font-display text-xl">{DEMO_JOURNEY_TITLE}</p>
        <p className="mt-3 text-muted">
          Six found stops across Kozhikode — their clues, their photos, a route
          drawn across an afternoon, and a replay that plays end to end without
          a network. Everything is stored only on this device, and the sample
          photos are labeled Demo.
        </p>
        <p className="mt-3 text-xs text-muted">
          The demo city is a curated subset — twelve places — not a full index
          of Kozhikode.
        </p>
        <div className="mt-5">
          <TryDemoButton />
        </div>
      </Panel>
    </main>
  );
}
