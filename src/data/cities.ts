/**
 * City registry — the bundled datasets a journey can resolve against. One
 * curated city at launch (spec scope boundary); a second demo dataset may
 * join only when grounded in checkable sources.
 */

import { KOZHIKODE, KOZHIKODE_PLACES } from "./kozhikode";
import type { City, Place } from "@/lib/types";

export interface CityBundle {
  city: City;
  places: Place[];
}

const BUNDLES: Record<string, CityBundle> = {
  [KOZHIKODE.id]: { city: KOZHIKODE, places: KOZHIKODE_PLACES },
};

/** The bundle for a city id, or undefined when the id names no bundled city. */
export function getCityBundle(cityId: string): CityBundle | undefined {
  return BUNDLES[cityId];
}

/** The launch city's bundle — used by journey creation and the demo seeder. */
export const DEMO_CITY_BUNDLE: CityBundle = BUNDLES[KOZHIKODE.id];
