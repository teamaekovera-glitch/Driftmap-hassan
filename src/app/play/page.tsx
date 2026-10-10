import type { Metadata } from "next";
import { FogMap } from "@/components/fog-map";
import { Chip } from "@/components/chip";
import { Panel } from "@/components/panel";
import { buildMapPreview } from "@/lib/map-preview-fixture";

export const metadata: Metadata = {
  title: "Explore",
};

const PREVIEW = buildMapPreview();

export default function PlayPage() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-display text-3xl">Explore</h1>
        <Chip label="2 of 6 found" active />
      </div>
      <Panel title="Active mission" className="mt-8">
        <p className="font-display text-xl">The fog holds a clue.</p>
        <p className="mt-3 text-muted">
          {PREVIEW.missions[2]?.clue ??
            "Find the place, photograph it, and the route draws itself onward."}
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Chip label="Curious" active />
          <Chip label="Kozhikode" />
        </div>
      </Panel>
      <Panel title="The fog of war" className="mt-8">
        <FogMap
          city={PREVIEW.city}
          fogState={PREVIEW.fogState}
          places={PREVIEW.places}
          className="h-[420px] w-full"
        />
        <p className="mt-3 text-xs text-muted">
          Preview state — two discoveries opened the fog, one mission is
          obscured. The play workstream wires live missions and photo
          completion into this map.
        </p>
      </Panel>
      <p className="mt-8 text-sm text-muted">
        One active mission at a time · progress is saved on this device
      </p>
    </main>
  );
}
