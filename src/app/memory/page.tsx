import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Remember",
};

export default function MemoryPage() {
  return (
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-16">
      <h1 className="text-3xl font-bold">Remember</h1>
      <p className="mt-4 text-lg opacity-80">
        Every photograph you confirmed becomes a memory — browsable on a map, a
        timeline, and by mood.
      </p>
      <p className="mt-6 text-sm opacity-60">
        Route shell — the memory browser and journey management arrive with the
        memory flow.
      </p>
    </main>
  );
}
