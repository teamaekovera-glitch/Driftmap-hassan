"use client";

/**
 * MemoryBrowser — the Remember experience. One client-side view over the
 * journey store: three modes (map, timeline, moods) over the selected
 * journey's memories, plus journey management (resume, replay, delete,
 * export) and whole-store import with visible validation errors.
 *
 * One load per tick: journeys and every memory record come back together
 * (records are tiny — photos stay in IndexedDB until usePhotoUrls asks for
 * specific blobs), and all derived views — per-journey counts, the selected
 * journey's memories, timeline groups, theme collections — are pure
 * projections of that state.
 *
 * Degraded modes are designed states: storage failure renders the message's
 * guidance; a failed import renders the validation error and changes
 * nothing; missing photos fall back to placeholders.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button, buttonClasses } from "./button";
import { JourneyCard } from "./journey-card";
import { MemoryCard } from "./memory-card";
import { MemoryMap } from "./memory-map";
import { MoodChips } from "./mood-chips";
import { TimelineList } from "./timeline-list";
import { usePhotoUrls } from "./use-photo-urls";
import { KOZHIKODE, KOZHIKODE_PLACES } from "@/data/kozhikode";
import {
  deleteJourney,
  exportAll,
  exportJourney,
  importAll,
  listJourneys,
  listMemories,
  toStorageError,
  updateMemoryTheme,
  ImportError,
  type DriftmapExport,
} from "@/lib/db";
import { computeFogState } from "@/lib/fog";
import {
  groupMemoriesByDay,
  groupMemoriesByTheme,
  orderMemoriesForJourney,
} from "@/lib/memory-views";
import type { City, Journey, MemoryRecord, ThemeId } from "@/lib/types";

/** Cities with bundled datasets — the browser renders only what exists. */
const CITIES: Record<string, City> = { [KOZHIKODE.id]: KOZHIKODE };
const PLACES_BY_CITY: Record<string, typeof KOZHIKODE_PLACES> = {
  [KOZHIKODE.id]: KOZHIKODE_PLACES,
};

type LoadStatus = "loading" | "ready" | "error";
type Mode = "map" | "timeline" | "moods";

const MODES: { id: Mode; label: string }[] = [
  { id: "map", label: "Map" },
  { id: "timeline", label: "Timeline" },
  { id: "moods", label: "Moods" },
];

/** Trigger a download of an export payload as pretty-printed JSON. */
function downloadJson(data: DriftmapExport): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `driftmap-export-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export function MemoryBrowser() {
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [journeys, setJourneys] = useState<Journey[]>([]);
  const [allMemories, setAllMemories] = useState<MemoryRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("map");
  const [moodFilter, setMoodFilter] = useState<ThemeId | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Bump to reload the store after a mutation (delete, import).
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((value) => value + 1), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [allJourneys, allRecords] = await Promise.all([listJourneys(), listMemories()]);
        if (cancelled) return;
        setJourneys(allJourneys);
        setAllMemories(allRecords);
        setSelectedId((current) =>
          current !== null && allJourneys.some((journey) => journey.id === current)
            ? current
            : (allJourneys[0]?.id ?? null),
        );
        setStatus("ready");
      } catch (error) {
        if (cancelled) return;
        setStatus("error");
        setLoadError(toStorageError(error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tick]);

  const selected = journeys.find((journey) => journey.id === selectedId) ?? null;
  // Memoized so downstream useMemo deps stay stable across renders.
  const city = useMemo(() => (selected ? (CITIES[selected.cityId] ?? null) : null), [selected]);
  const places = useMemo(() => (selected ? (PLACES_BY_CITY[selected.cityId] ?? []) : []), [selected]);

  const memories = useMemo(
    () => allMemories.filter((memory) => memory.journeyId === selectedId),
    [allMemories, selectedId],
  );
  const memoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const memory of allMemories) {
      counts[memory.journeyId] = (counts[memory.journeyId] ?? 0) + 1;
    }
    return counts;
  }, [allMemories]);

  const placeNames = useMemo(
    () => Object.fromEntries(places.map((place) => [place.id, place.name])),
    [places],
  );
  const placeIds = useMemo(() => new Set(places.map((place) => place.id)), [places]);

  const fogState = useMemo(
    () => (selected ? computeFogState(selected, memories, places) : null),
    [selected, memories, places],
  );

  const photoUrls = usePhotoUrls(memories);

  // MemoryMap wants URLs parallel to fogState.revealed — journey order over
  // memories whose places the dataset knows (matching computeFogState's own
  // filter, so indices align even around corrupt records).
  const mapPhotoUrls = useMemo(() => {
    if (!fogState) return undefined;
    return orderMemoriesForJourney(memories)
      .filter((memory) => placeIds.has(memory.placeId))
      .map((memory) => photoUrls[memory.id]);
  }, [fogState, memories, photoUrls, placeIds]);

  const timelineGroups = useMemo(() => groupMemoriesByDay(memories), [memories]);
  const themeCollections = useMemo(() => groupMemoriesByTheme(memories), [memories]);

  async function handleDelete(journeyId: string) {
    setBusy(true);
    setActionError(null);
    setNotice(null);
    try {
      await deleteJourney(journeyId);
      setNotice("Journey deleted — its photos went with it.");
      refresh();
    } catch (error) {
      setActionError(toStorageError(error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleExport(journeyId: string | null) {
    setBusy(true);
    setActionError(null);
    setNotice(null);
    try {
      const data = journeyId === null ? await exportAll() : await exportJourney(journeyId);
      downloadJson(data);
      const count = data.journeys.length;
      setNotice(
        `Export downloaded — ${count} ${count === 1 ? "journey" : "journeys"}, ${data.memories.length} memories.`,
      );
    } catch (error) {
      setActionError(toStorageError(error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleImport(file: File) {
    setBusy(true);
    setImportError(null);
    setNotice(null);
    try {
      const text = await file.text();
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new ImportError("bad-format", `"${file.name}" is not valid JSON.`);
      }
      const summary = await importAll(parsed);
      setNotice(
        `Imported ${summary.journeys} ${summary.journeys === 1 ? "journey" : "journeys"}, ` +
          `${summary.memories} ${summary.memories === 1 ? "memory" : "memories"}, ` +
          `${summary.photos} ${summary.photos === 1 ? "photo" : "photos"}.`,
      );
      refresh();
    } catch (error) {
      setImportError(toStorageError(error).message);
    } finally {
      setBusy(false);
    }
  }

  function handleThemeChange(memoryId: string, theme: ThemeId) {
    setActionError(null);
    updateMemoryTheme(memoryId, theme)
      .then(() => {
        setAllMemories((current) =>
          current.map((memory) => (memory.id === memoryId ? { ...memory, theme } : memory)),
        );
      })
      .catch((error: unknown) => {
        setActionError(toStorageError(error).message);
      });
  }

  const hasJourneys = status === "ready" && journeys.length > 0;

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-3xl">Remember</h1>
        {hasJourneys ? <ModeTabs mode={mode} onSelect={setMode} /> : null}
      </div>

      {status === "loading" ? (
        <p className="mt-8 text-muted" role="status">
          Opening your journeys…
        </p>
      ) : null}

      {status === "error" ? (
        <section aria-label="Storage problem" className="mt-8 border border-red-900/60 p-5">
          <h2 className="font-display text-xl">Journeys could not be opened</h2>
          <p className="mt-3 text-sm text-muted">{loadError}</p>
          <Button variant="ghost" className="mt-4" onClick={refresh}>
            Try again
          </Button>
        </section>
      ) : null}

      {status === "ready" && journeys.length === 0 ? (
        <section className="mt-8">
          <p className="font-display text-xl">No memories yet.</p>
          <p className="mt-3 text-muted">
            Complete a mission in Explore and the photograph you confirmed will
            be saved here — browsable on a map, a timeline, and by mood. Nothing
            to re-organize, ever.
          </p>
          <Link href="/play" className={buttonClasses("primary") + " mt-5"}>
            Start exploring
          </Link>
        </section>
      ) : null}

      {hasJourneys ? (
        <>
          <section aria-label="Journeys" className="mt-6 grid gap-3 sm:grid-cols-2">
            {journeys.map((journey) => (
              <JourneyCard
                key={journey.id}
                journey={journey}
                cityName={CITIES[journey.cityId]?.name ?? journey.cityId}
                memoryCount={memoryCounts[journey.id] ?? 0}
                stopCount={journey.missionIds.length}
                selected={journey.id === selectedId}
                onSelect={() => {
                  setSelectedId(journey.id);
                  setNotice(null);
                  setActionError(null);
                  setImportError(null);
                }}
                resumeHref={`/play?journey=${encodeURIComponent(journey.id)}`}
                replayHref={`/replay?journey=${encodeURIComponent(journey.id)}`}
                onExport={() => void handleExport(journey.id)}
                onDelete={() => void handleDelete(journey.id)}
                busy={busy}
              />
            ))}
          </section>

          {notice ? (
            <p role="status" className="mt-6 border-l-2 border-accent pl-3 text-sm">
              {notice}
            </p>
          ) : null}
          {actionError ? (
            <p role="alert" className="mt-6 border border-red-900/60 p-3 text-sm text-red-300">
              {actionError}
            </p>
          ) : null}

          {selected && fogState ? (
            <section aria-label={`${mode} view`} className="mt-6">
              {mode === "map" ? (
                <>
                  <MemoryMap
                    city={city ?? KOZHIKODE}
                    fogState={fogState}
                    places={places}
                    photoUrls={mapPhotoUrls}
                    className="h-[420px] w-full"
                  />
                  {memories.length === 0 ? (
                    <p className="mt-3 text-xs text-muted">
                      The map wakes up with the first confirmed photo.
                    </p>
                  ) : null}
                </>
              ) : null}
              {mode === "timeline" ? (
                <TimelineList
                  groups={timelineGroups}
                  photoUrls={photoUrls}
                  placeNames={placeNames}
                  onThemeChange={handleThemeChange}
                />
              ) : null}
              {mode === "moods" ? (
                <div className="space-y-5">
                  <MoodChips
                    collections={themeCollections}
                    active={moodFilter}
                    onSelect={setMoodFilter}
                  />
                  {memories.length === 0 ? (
                    <p className="py-6 text-center text-muted">
                      Moods arrive with the first confirmed photo.
                    </p>
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-2">
                      {orderMemoriesForJourney(memories)
                        .filter((memory) => moodFilter === null || memory.theme === moodFilter)
                        .map((memory) => (
                          <MemoryCard
                            key={memory.id}
                            memory={memory}
                            placeName={placeNames[memory.placeId]}
                            photoUrl={photoUrls[memory.id]}
                            onThemeChange={handleThemeChange}
                          />
                        ))}
                    </div>
                  )}
                </div>
              ) : null}
            </section>
          ) : null}

          <section aria-label="Journey data" className="mt-10 border border-line bg-ink-raised">
            <h2 className="border-b border-line px-5 py-3 text-xs font-medium uppercase tracking-[0.2em] text-muted">
              Journey data
            </h2>
            <div className="flex flex-wrap items-center gap-3 p-5">
              <Button variant="ghost" onClick={() => void handleExport(null)} disabled={busy}>
                Export everything (JSON)
              </Button>
              <label className={`${buttonClasses("ghost")} cursor-pointer`}>
                Import JSON
                <input
                  type="file"
                  accept="application/json,.json"
                  className="sr-only"
                  aria-label="Import a Driftmap export file"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = ""; // allow re-choosing the same file
                    if (file) void handleImport(file);
                  }}
                />
              </label>
              <p className="w-full text-xs text-muted sm:w-auto sm:flex-1">
                Exports are lossless copies of this device&apos;s store. Importing
                replaces what is here now with the file&apos;s contents.
              </p>
            </div>
            {importError ? (
              <p role="alert" className="border-t border-red-900/60 p-4 text-sm text-red-300">
                {importError}
              </p>
            ) : null}
          </section>
        </>
      ) : null}

      <p className="mt-8 text-sm text-muted">
        Journeys live in IndexedDB on this device · export and import are
        lossless copies
      </p>
    </main>
  );
}

function ModeTabs({ mode, onSelect }: { mode: Mode; onSelect: (mode: Mode) => void }) {
  return (
    <div role="tablist" aria-label="Memory browser mode" className="flex gap-2">
      {MODES.map(({ id, label }) => (
        <button
          key={id}
          role="tab"
          type="button"
          aria-selected={mode === id}
          onClick={() => onSelect(id)}
          className={`rounded-full border px-4 py-1 text-xs tracking-wide transition-colors ${
            mode === id
              ? "border-accent text-accent"
              : "border-line text-muted hover:border-accent hover:text-accent"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
