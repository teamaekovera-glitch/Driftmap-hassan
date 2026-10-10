import type { Metadata } from "next";
import { Suspense } from "react";
import { ReplayPlayer } from "@/components/replay-player";

export const metadata: Metadata = {
  title: "Play My Journey",
  description:
    "Your run, replayed as a scripted travel film — photos, clues, route, and timestamps, straight from the journey store.",
};

export default function ReplayPage() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="font-display text-3xl">Play My Journey</h1>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
        The same records the game wrote, played back as a film — each photograph with its clue,
        each road between stops, and the whole route at the end. Captions are always readable;
        narration and the map are enhancements, never requirements.
      </p>
      <div className="mt-8">
        <Suspense
          fallback={
            <p className="text-sm text-muted" aria-live="polite">
              Warming up the projector…
            </p>
          }
        >
          <ReplayPlayer />
        </Suspense>
      </div>
    </main>
  );
}
