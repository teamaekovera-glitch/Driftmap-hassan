import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Replay",
};

export default function ReplayPage() {
  return (
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-16">
      <h1 className="text-3xl font-bold">Play My Journey</h1>
      <p className="mt-4 text-lg opacity-80">
        Your run, replayed as a scripted travel film — photos, clues, route,
        and timestamps, straight from the journey store.
      </p>
      <p className="mt-6 text-sm opacity-60">
        Route shell — the cinematic player arrives with the replay flow.
      </p>
    </main>
  );
}
