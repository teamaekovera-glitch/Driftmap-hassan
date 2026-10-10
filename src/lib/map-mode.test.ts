import { describe, expect, it } from "vitest";
import { nextMapMode, TILE_LOAD_TIMEOUT_MS, type MapMode, type TileEvent } from "./map-mode";

describe("nextMapMode", () => {
  it("keeps tiles mode when tiles load", () => {
    expect(nextMapMode("tiles", "loaded")).toBe<MapMode>("tiles");
  });

  it("drops to schematic on a tile error", () => {
    expect(nextMapMode("tiles", "tile-failed")).toBe<MapMode>("schematic");
  });

  it("drops to schematic when the load budget expires", () => {
    expect(nextMapMode("tiles", "load-timeout")).toBe<MapMode>("schematic");
  });

  it("retry re-arms the tiles from schematic", () => {
    expect(nextMapMode("schematic", "retry")).toBe<MapMode>("tiles");
  });

  it("is a no-op for failure and load signals while already schematic", () => {
    for (const event of ["tile-failed", "load-timeout", "loaded"] as const satisfies TileEvent[]) {
      expect(nextMapMode("schematic", event)).toBe<MapMode>("schematic");
    }
  });

  it("ignores retry while already in tiles mode", () => {
    expect(nextMapMode("tiles", "retry")).toBe<MapMode>("tiles");
  });

  it("keeps the spec's ~6s load budget", () => {
    expect(TILE_LOAD_TIMEOUT_MS).toBe(6_000);
  });
});
