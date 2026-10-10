import { describe, expect, it } from "vitest";
import {
  PERSONALITY_IDS,
  PLACE_CATEGORIES,
  PLACE_TAGS,
  THEME_IDS,
} from "./types";

describe("shared data-model constants", () => {
  it("exposes the five personalities from the spec, in spec order", () => {
    expect([...PERSONALITY_IDS]).toEqual([
      "curious",
      "broke",
      "adventurous",
      "introverted",
      "chaotic",
    ]);
  });

  it("exposes the seven place categories from the spec", () => {
    expect([...PLACE_CATEGORIES]).toEqual([
      "waterfront",
      "market",
      "heritage",
      "park",
      "culture",
      "transit",
      "street-life",
    ]);
  });

  it("exposes the six memory themes from the spec", () => {
    expect([...THEME_IDS]).toEqual([
      "discovery",
      "architecture",
      "food",
      "nature",
      "street-life",
      "unexpected",
    ]);
  });

  it("exposes the constrained place-tag vocabulary", () => {
    expect([...PLACE_TAGS]).toEqual([
      "free",
      "public",
      "quiet",
      "photogenic",
      "historic",
      "food",
      "busy",
    ]);
  });

  it("keeps every id lowercase kebab-case and unique within its list", () => {
    for (const list of [PERSONALITY_IDS, PLACE_CATEGORIES, THEME_IDS, PLACE_TAGS]) {
      for (const id of list) {
        expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      }
      expect(new Set(list).size).toBe(list.length);
    }
  });
});
