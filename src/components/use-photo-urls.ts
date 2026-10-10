"use client";

/**
 * Photo object URLs for a set of memories. The hook owns the blob→URL
 * lifecycle — MemoryMap and the memory cards just read `urls[memory.id]`.
 * A photo that is missing (not yet captured) or unreadable simply has no
 * entry; callers render their placeholder. Degradation by design: one bad
 * blob never crashes the browser.
 */

import { useEffect, useState } from "react";
import { getPhoto } from "@/lib/db";
import type { MemoryRecord } from "@/lib/types";

export function usePhotoUrls(memories: MemoryRecord[]): Record<string, string> {
  const [urls, setUrls] = useState<Record<string, string>>({});

  // Summarize the dependency: memory ids fully determine the work.
  const key = memories.map((memory) => memory.id).join("|");

  useEffect(() => {
    if (memories.length === 0) {
      setUrls({});
      return;
    }
    let cancelled = false;
    const created: string[] = [];

    (async () => {
      const next: Record<string, string> = {};
      for (const memory of memories) {
        try {
          const photo = await getPhoto(memory.id);
          if (!photo) continue;
          const url = URL.createObjectURL(photo.blob);
          created.push(url);
          next[memory.id] = url;
        } catch (error) {
          // Degraded mode: the memory record survives; its card falls back
          // to the placeholder. Surfaced to the console, never to a crash.
          console.warn(`Photo for memory "${memory.id}" could not be read.`, error);
        }
        if (cancelled) return;
      }
      if (!cancelled) setUrls(next);
    })();

    return () => {
      cancelled = true;
      for (const url of created) URL.revokeObjectURL(url);
    };
    // `memories` is summarized by `key`; reading it inside is the point.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return urls;
}
