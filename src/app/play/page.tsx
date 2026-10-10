import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Explore",
};

export default function PlayPage() {
  return (
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-16">
      <h1 className="text-3xl font-bold">Explore</h1>
      <p className="mt-4 text-lg opacity-80">
        Follow the cryptic clue, find the place, photograph it. The fog lifts
        as you go.
      </p>
      <p className="mt-6 text-sm opacity-60">
        Route shell — fog map, mission panel, and photo completion arrive with
        the play flow.
      </p>
    </main>
  );
}
