"use client";

/**
 * ProductPreview — the landing's live product preview. It runs the real
 * map-preview fixture (the mission engine at a fixed seed, a two-stops-found
 * progression, the fog state derived exactly as the game derives it) through
 * the real schematic renderer — the same component that takes over when
 * tiles fail. No map library, no network: what the visitor sees is the
 * product's own picture of a run in progress.
 */

import { SchematicMap } from "./schematic-map";
import { Panel } from "./panel";
import { buildMapPreview } from "@/lib/map-preview-fixture";

export function ProductPreview() {
  const preview = buildMapPreview();

  return (
    <Panel title="Live preview — a run, mid-drift" className="mt-16">
      <SchematicMap
        city={preview.city}
        fogState={preview.fogState}
        places={preview.places}
        className="h-[380px] w-full"
      />
      <p className="mt-3 text-xs leading-relaxed text-muted">
        Two stops found, one in the field, three still buried — rendered by the
        game&rsquo;s schematic map over a real mission state. Online, the same state
        draws over street tiles; offline, this picture is the product.
      </p>
    </Panel>
  );
}
