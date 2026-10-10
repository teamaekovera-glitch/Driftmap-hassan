/**
 * Tile-health state machine — the fallback switch as pure logic. The live map
 * stays in `tiles` mode only while the Positron style and its tiles behave;
 * any failure signal drops it to `schematic`, and an explicit retry earns a
 * fresh attempt. OpenFreeMap's terms are as-is with no SLA (build spec), so
 * the schematic is not an error state — it is a designed mode of the game.
 */

export type MapMode = "tiles" | "schematic";

export type TileEvent =
  /** The map emitted an error event (style, glyph, or tile fetch failed). */
  | "tile-failed"
  /** No load confirmation within TILE_LOAD_TIMEOUT_MS. */
  | "load-timeout"
  /** Style loaded and the first frame rendered — tiles are healthy. */
  | "loaded"
  /** The player asked the tiles to try again. */
  | "retry";

/** Spec's load budget before the schematic takes over (~6s). */
export const TILE_LOAD_TIMEOUT_MS = 6_000;

/**
 * The full transition table, total over every mode/event pair — an unknown
 * combination is a no-op rather than a crash.
 */
export function nextMapMode(mode: MapMode, event: TileEvent): MapMode {
  switch (event) {
    case "retry":
      return "tiles";
    case "tile-failed":
    case "load-timeout":
      return "schematic";
    case "loaded":
      return mode;
  }
}
