import { describe, expect, it } from "vitest";
import { KOZHIKODE_PLACES } from "@/data/kozhikode";
import { buildMapPreview } from "./map-preview-fixture";

describe("buildMapPreview", () => {
  it("is deterministic — two calls build identical previews", () => {
    expect(JSON.parse(JSON.stringify(buildMapPreview()))).toEqual(
      JSON.parse(JSON.stringify(buildMapPreview())),
    );
  });

  it("derives a fog state with two revealed stops and one route segment", () => {
    const { fogState } = buildMapPreview();
    expect(fogState.revealed).toHaveLength(2);
    expect(fogState.routes).toHaveLength(1);
    expect(fogState.routes[0]).toEqual([
      fogState.revealed[0].coords,
      fogState.revealed[1].coords,
    ]);
  });

  it("obscures a distinct active target while stops stay revealed", () => {
    const { fogState } = buildMapPreview();
    expect(fogState.activeTarget).not.toBeNull();
    const revealedCoords = fogState.revealed.map((stop) => stop.coords.join(","));
    expect(revealedCoords).not.toContain(fogState.activeTarget!.coords.join(","));
  });

  it("pins the revealed coordinates to the first two missions' places", () => {
    const { fogState, missions } = buildMapPreview();
    expect(missions.length).toBeGreaterThanOrEqual(3);
    expect(missions.map((m) => m.status)).toEqual([
      "complete",
      "complete",
      "active",
      "locked",
      "locked",
      "locked",
    ]);
    const placesById = new Map(KOZHIKODE_PLACES.map((p) => [p.id, p]));
    fogState.revealed.forEach((stop, index) => {
      const place = placesById.get(missions[index].placeId);
      expect(place).toBeDefined();
      expect(stop.coords).toEqual(place!.coords);
    });
  });
});
