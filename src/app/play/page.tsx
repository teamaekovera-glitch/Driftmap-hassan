import type { Metadata } from "next";
import { Chip } from "@/components/chip";
import { Panel } from "@/components/panel";

export const metadata: Metadata = {
  title: "Explore",
};

export default function PlayPage() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-display text-3xl">Explore</h1>
        <Chip label="0 of 6 found" active />
      </div>
      <Panel title="Active mission" className="mt-8">
        <p className="font-display text-xl">
          The fog holds a clue — follow it to a real public place.
        </p>
        <p className="mt-3 text-muted">
          The fog-of-war map, cryptic missions, and photo-confirmed completion
          land with the play workstream. Find the place, photograph it, and the
          route draws itself onward.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Chip label="Curious" active />
          <Chip label="Kozhikode" />
        </div>
      </Panel>
      <p className="mt-8 text-sm text-muted">
        One active mission at a time · progress is saved on this device
      </p>
    </main>
  );
}
