import { describe, expect, it } from "vitest";
import { KOZHIKODE, KOZHIKODE_PLACES } from "./kozhikode";
import { PLACE_CATEGORIES, PLACE_TAGS } from "@/lib/types";
import { distanceMeters } from "@/lib/geo";

// Kozhikode district bounding box — every pin must sit inside it.
const BBOX = { minLat: 11.1, maxLat: 11.5, minLon: 75.6, maxLon: 75.9 };

describe("Kozhikode dataset", () => {
  it("carries exactly the spec's twelve public places", () => {
    expect(KOZHIKODE_PLACES).toHaveLength(12);
  });

  it("has unique, well-formed place ids and names", () => {
    const ids = new Set(KOZHIKODE_PLACES.map((p) => p.id));
    const names = new Set(KOZHIKODE_PLACES.map((p) => p.name));
    expect(ids.size).toBe(KOZHIKODE_PLACES.length);
    expect(names.size).toBe(KOZHIKODE_PLACES.length);
    for (const place of KOZHIKODE_PLACES) {
      expect(place.id).toMatch(/^kozhikode--[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(place.name.length).toBeGreaterThan(0);
      expect(place.cityId).toBe("kozhikode");
      expect(place.suitability).toBe("public");
    }
  });

  it("uses only the constrained tag vocabulary", () => {
    for (const place of KOZHIKODE_PLACES) {
      for (const tag of place.tags) {
        expect(PLACE_TAGS).toContain(tag);
      }
    }
  });

  it("uses only the spec's categories", () => {
    for (const place of KOZHIKODE_PLACES) {
      expect(PLACE_CATEGORIES).toContain(place.category);
    }
  });

  it("keeps every pin inside the Kozhikode bounding box", () => {
    for (const place of KOZHIKODE_PLACES) {
      const [lon, lat] = place.coords;
      expect(lat).toBeGreaterThanOrEqual(BBOX.minLat);
      expect(lat).toBeLessThanOrEqual(BBOX.maxLat);
      expect(lon).toBeGreaterThanOrEqual(BBOX.minLon);
      expect(lon).toBeLessThanOrEqual(BBOX.maxLon);
    }
  });

  it("keeps every pin distinct mission geography (>80m apart)", () => {
    for (let i = 0; i < KOZHIKODE_PLACES.length; i++) {
      for (let j = i + 1; j < KOZHIKODE_PLACES.length; j++) {
        const d = distanceMeters(KOZHIKODE_PLACES[i].coords, KOZHIKODE_PLACES[j].coords);
        expect(d).toBeGreaterThan(80);
      }
    }
  });

  it("gives every place grounded clue material", () => {
    for (const place of KOZHIKODE_PLACES) {
      expect(place.clueMaterial.length).toBeGreaterThan(0);
      for (const phrase of place.clueMaterial) {
        expect(phrase.length).toBeGreaterThan(0);
      }
    }
  });

  it("labels demo photos as demo assets", () => {
    for (const place of KOZHIKODE_PLACES) {
      if (place.demoPhotoId !== undefined) {
        expect(place.demoPhotoId.startsWith("demo-")).toBe(true);
      }
    }
  });

  it("exposes the city record with sane defaults", () => {
    expect(KOZHIKODE.id).toBe("kozhikode");
    expect(KOZHIKODE.name).toBe("Kozhikode");
    const [lon, lat] = KOZHIKODE.center;
    expect(lat).toBeGreaterThan(11.1);
    expect(lat).toBeLessThan(11.5);
    expect(lon).toBeGreaterThan(75.6);
    expect(lon).toBeLessThan(75.9);
    expect(KOZHIKODE.zoom).toBeGreaterThan(0);
  });
});
