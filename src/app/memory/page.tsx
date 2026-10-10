import type { Metadata } from "next";
import { Chip } from "@/components/chip";
import { Panel } from "@/components/panel";

export const metadata: Metadata = {
  title: "Remember",
};

const MODES = ["Map", "Timeline", "Moods"] as const;

export default function MemoryPage() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-display text-3xl">Remember</h1>
        <div className="flex gap-2">
          {MODES.map((mode, index) => (
            <Chip key={mode} label={mode} active={index === 0} />
          ))}
        </div>
      </div>
      <Panel title="Journey" className="mt-8">
        <p className="font-display text-xl">No memories yet.</p>
        <p className="mt-3 text-muted">
          Complete a mission in Explore and the photograph you confirmed will
          be saved here — browsable on a map, a timeline, and by mood. Nothing
          to re-organize, ever.
        </p>
      </Panel>
      <p className="mt-8 text-sm text-muted">
        Journeys live in IndexedDB on this device · export and import are
        lossless copies
      </p>
    </main>
  );
}
