import type { Metadata } from "next";
import { PlayScreen } from "@/components/play-screen";

export const metadata: Metadata = {
  title: "Explore · Driftmap",
  description:
    "Follow a cryptic clue to a real place, photograph the find, and watch the city reveal itself.",
};

export default function PlayPage() {
  return (
    <main className="mx-auto min-h-dvh w-full max-w-xl px-5 py-10">
      <PlayScreen />
    </main>
  );
}
