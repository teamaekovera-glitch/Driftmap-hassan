"use client";

/**
 * TryDemoButton — the landing's "Try the demo" action. Seeds the demo
 * journey on demand (idempotent — an intact copy costs one store read),
 * then deep-links into Remember with the demo pre-selected, where Play My
 * Journey is the completed card's primary action. A storage failure renders
 * its honest message instead of navigating — the demo never half-loads.
 */

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "./button";
import { DEMO_CITY_BUNDLE } from "@/data/cities";
import { toStorageError } from "@/lib/db";
import {
  DEMO_JOURNEY_ID,
  createIdbDemoStore,
  ensureDemoJourney,
  loadBundledDemoPhoto,
} from "@/lib/demo-journey";

export function TryDemoButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      await ensureDemoJourney(createIdbDemoStore(), loadBundledDemoPhoto, DEMO_CITY_BUNDLE);
      router.push(`/memory?journey=${encodeURIComponent(DEMO_JOURNEY_ID)}`);
    } catch (cause) {
      setError(toStorageError(cause).message);
      setBusy(false);
    }
  }

  return (
    <div>
      <Button onClick={() => void start()} disabled={busy} aria-busy={busy}>
        {busy ? "Setting up the demo…" : "Try the demo"}
      </Button>
      {error ? (
        <p role="alert" className="mt-3 border border-red-900/60 p-3 text-sm text-red-300">
          {error}
        </p>
      ) : null}
    </div>
  );
}
