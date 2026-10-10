import { describe, expect, it } from "vitest";
import { KOZHIKODE_PLACES } from "@/data/kozhikode";
import {
  metersToPixels,
  placesForFogState,
  schematicProjection,
} from "./map-geometry";
import type { FogState } from "./fog";
import type { Place } from "./types";

describe("metersToPixels", () => {
  it("maps one earth circumference to one 512px world at zoom 0", () => {
    const pixels = metersToPixels(40_075_016.686, 0, 0);
    expect(pixels).toBeCloseTo(512, 3);
  });

  it("doubles pixels with each zoom step", () => {
    const atFive = metersToPixels(300, 11.25, 5);
    const atSix = metersToPixels(300, 11.25, 6);
    expect(atSix).toBeCloseTo(atFive * 2, 6);
  });

  it("stretches distances away from the equator by cos(latitude)", () => {
    const equator = metersToPixels(300, 0, 12);
    const atSixty = metersToPixels(300, 60, 12);
    expect(atSixty).toBeCloseTo(equator * 2, 3);
  });
});

describe("schematicProjection", () => {
  const projection = schematicProjection(
    [
      [75, 11],
      [76, 12],
    ],
    1000,
    700,
    40,
  );

  it("centers the middle of the extent", () => {
    const [x, y] = projection.project([75.5, 11.5]);
    expect(x).toBeCloseTo(500, 3);
    expect(y).toBeCloseTo(350, 3);
  });

  it("fits the extent inside the padding", () => {
    const [x, y] = projection.project([76, 12]);
    expect(y).toBeGreaterThanOrEqual(40 - 0.5);
    expect(y).toBeLessThanOrEqual(660 + 0.5);
    expect(x).toBeGreaterThanOrEqual(40 - 0.5);
    expect(x).toBeLessThanOrEqual(960 + 0.5);
  });

  it("keeps north up and east right", () => {
    const [east] = projection.project([76, 11.5]);
    const [west] = projection.project([75, 11.5]);
    const [, north] = projection.project([75.5, 12]);
    const [, south] = projection.project([75.5, 11]);
    expect(east).toBeGreaterThan(west);
    expect(north).toBeLessThan(south); // smaller y = higher on screen
  });

  it("converts one degree of latitude to the same pixel scale", () => {
    expect(projection.metersToPixels(111_320)).toBeCloseTo(620, 0);
  });

  it("projects nothing without crashing when given no coordinates", () => {
    const empty = schematicProjection([], 100, 100, 10);
    expect(empty.project([0, 0])).toEqual([50, 50]);
  });
});

describe("placesForFogState", () => {
  const mananchira = place("kozhikode--mananchira-square");
  const smStreet = place("kozhikode--sm-street");

  function place(id: string): Place {
    const found = KOZHIKODE_PLACES.find((p) => p.id === id);
    if (!found) throw new Error(`unknown place ${id}`);
    return found;
  }

  function fogStateWithRevealed(
    coords: [number, number][],
  ): FogState {
    return {
      revealed: coords.map((c) => ({ coords: c, radiusMeters: 300 })),
      routes: [],
      activeTarget: null,
    };
  }

  it("joins revealed stops to places in reveal order", () => {
    const state = fogStateWithRevealed([
      mananchira.coords,
      smStreet.coords,
    ]);
    expect(placesForFogState(state, KOZHIKODE_PLACES)).toEqual([
      mananchira,
      smStreet,
    ]);
  });

  it("skips coordinates no dataset place owns", () => {
    const state = fogStateWithRevealed([
      [0, 0],
      smStreet.coords,
    ]);
    expect(placesForFogState(state, KOZHIKODE_PLACES)).toEqual([smStreet]);
  });

  it("follows the fog state's order, not the dataset's", () => {
    const state = fogStateWithRevealed([
      smStreet.coords,
      mananchira.coords,
    ]);
    expect(placesForFogState(state, KOZHIKODE_PLACES)).toEqual([
      smStreet,
      mananchira,
    ]);
  });
});
