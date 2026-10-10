import type { Metadata } from "next";
import { Button } from "@/components/button";
import { Panel } from "@/components/panel";

export const metadata: Metadata = {
  title: "Replay",
};

export default function ReplayPage() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="font-display text-3xl">Play My Journey</h1>
      <Panel title="Replay stage" className="mt-8">
        <div className="flex aspect-video items-center justify-center border border-line text-center">
          <p className="max-w-sm px-6 text-muted">
            Your run, replayed as a scripted travel film — photos, clues,
            route, and timestamps, straight from the journey store.
          </p>
        </div>
        <div className="mt-5 flex flex-wrap gap-3">
          <Button disabled>Play</Button>
          <Button variant="ghost" disabled>
            Previous
          </Button>
          <Button variant="ghost" disabled>
            Next
          </Button>
          <Button variant="ghost" disabled>
            Restart
          </Button>
        </div>
        <p className="mt-4 text-xs text-muted">
          Transport controls come alive with the replay workstream; captions
          will always be readable even when narration is muted or missing.
        </p>
      </Panel>
    </main>
  );
}
