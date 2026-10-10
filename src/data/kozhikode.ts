/**
 * Kozhikode — the curated launch city. Twelve public places from the build
 * spec's evidence region.
 *
 * Coordinates were spot-verified against OpenStreetMap on 2026-10-10
 * (Nominatim + Overpass + Wikipedia cross-checks); the corrections and their
 * evidence are logged in the PR body. Every `clueMaterial` phrase is a
 * checkable, observable attribute — never opening hours, crowd levels, or
 * anything a source did not state. The dataset contains public, appropriate
 * places only.
 */

import type { City, Place } from "@/lib/types";

export const KOZHIKODE: City = {
  id: "kozhikode",
  name: "Kozhikode",
  center: [75.78, 11.2545], // [lon, lat] — Mananchira, the traditional city heart
  zoom: 11,
};

export const KOZHIKODE_PLACES: Place[] = [
  {
    id: "kozhikode--kozhikode-beach",
    cityId: "kozhikode",
    name: "Kozhikode Beach",
    coords: [75.7697, 11.2555], // OSM: കോഴിക്കോട് കടൽത്തീരം node, exact match
    category: "waterfront",
    tags: ["public", "free", "photogenic", "busy"],
    clueMaterial: [
      "a long sand shore beside the city centre",
      "a stone pier walking out into the sea",
      "fishing boats hauled up on the sand",
    ],
    suitability: "public",
    demoPhotoId: "demo-street-art-wall",
  },
  {
    id: "kozhikode--mananchira-square",
    cityId: "kozhikode",
    name: "Mananchira Square",
    coords: [75.78, 11.2545], // OSM 'Mananchira' node 11.2545,75.7800 (spec was ~49m off)
    category: "park",
    tags: ["public", "free", "quiet", "photogenic"],
    clueMaterial: [
      "a centuries-old freshwater tank at the city's heart",
      "lawns and walkways ringing still water",
    ],
    suitability: "public",
  },
  {
    id: "kozhikode--sm-street",
    cityId: "kozhikode",
    name: "SM Street (Sweet Meat Street)",
    coords: [75.7813, 11.2499], // OSM 'Mittayi Theruvu' node (spec pin ~524m north, as the spec anticipated)
    category: "market",
    tags: ["public", "free", "food", "busy", "photogenic"],
    clueMaterial: [
      "a car-free lane lined with sweet and snack shops",
      "the old city's famous shopping street",
    ],
    suitability: "public",
    demoPhotoId: "demo-tea-stall-evening",
  },
  {
    id: "kozhikode--mishkal-mosque",
    cityId: "kozhikode",
    name: "Mishkal Mosque",
    // OSM way/362581916, the named mosque of the Kuttichira precinct —
    // consistent with the en-wiki infobox (11.25, 75.77) and the article's
    // "located in Kuttichira". The spec's 11.2477,75.7868 (Wikidata P625)
    // is the outlier; see PR body. Radius stays generous.
    coords: [75.7761, 11.2456],
    category: "heritage",
    tags: ["public", "free", "historic", "photogenic"],
    clueMaterial: [
      "a 14th-century merchant's mosque",
      "wooden and laterite architecture with carved gables",
      "a medieval Muslim quarter beside an old water tank",
    ],
    suitability: "public",
  },
  {
    id: "kozhikode--tali-shiva-temple",
    cityId: "kozhikode",
    name: "Tali Shiva Temple",
    coords: [75.7872, 11.2486], // OSM 'Tali Temple Pond' 11.24863,75.78724 — 15m from the spec pin, confirmed
    category: "heritage",
    tags: ["public", "free", "historic", "photogenic"],
    clueMaterial: [
      "a Shiva temple beside a large temple pond",
      "traditional Kerala roofed temple architecture",
      "a wooden Koothambalam performance hall",
    ],
    suitability: "public",
  },
  {
    id: "kozhikode--kuttichira-precinct",
    cityId: "kozhikode",
    name: "Kuttichira precinct",
    coords: [75.776, 11.2446], // OSM 'Kuttichira' water body (the tank the quarter is named for)
    category: "street-life",
    tags: ["public", "free", "historic", "photogenic"],
    clueMaterial: [
      "a medieval Muslim quarter of lanes and tanks",
      "old mosques and merchant houses",
      "a large community water tank",
    ],
    suitability: "public",
    demoPhotoId: "demo-heritage-lane",
  },
  {
    id: "kozhikode--sarovaram-biopark",
    cityId: "kozhikode",
    name: "Sarovaram Biopark",
    coords: [75.7923, 11.2679], // OSM 'Sarovaram Biopark' node (spec pin ~1.4km north)
    category: "park",
    tags: ["public", "free", "quiet", "photogenic"],
    clueMaterial: [
      "a biopark of boardwalks over backwater mangroves",
      "a bird-rich wetland park on the canal",
    ],
    suitability: "public",
    demoPhotoId: "demo-mangrove-boardwalk",
  },
  {
    id: "kozhikode--beypore-pulimuttu",
    cityId: "kozhikode",
    name: "Beypore port & Pulimuttu",
    coords: [75.8076, 11.1669], // OSM 'Beypore Port' node, exact match
    category: "waterfront",
    tags: ["public", "free", "photogenic", "busy"],
    clueMaterial: [
      "a working port town at the river mouth",
      "a kilometre-long stone breakwater walking into the sea",
      "shipyards still building wooden trading ships",
    ],
    suitability: "public",
    demoPhotoId: "demo-beypore-shipyard",
  },
  {
    id: "kozhikode--kappad-beach",
    cityId: "kozhikode",
    name: "Kappad Beach",
    coords: [75.7194, 11.3846], // OSM 'kappad beach park' + Wikipedia 'Kappad' (spec pin was ~4.2km off)
    category: "waterfront",
    tags: ["public", "free", "quiet", "photogenic", "historic"],
    clueMaterial: [
      "a quiet northern beach",
      "the shore where a European expedition made landfall in 1498",
      "laterite rocks along the waterline",
    ],
    suitability: "public",
    demoPhotoId: "demo-kappad-sunset",
  },
  {
    id: "kozhikode--pazhassi-raja-museum",
    cityId: "kozhikode",
    name: "Pazhassi Raja Museum",
    coords: [75.7781, 11.2927], // OSM 'Pazhassiraja Archaeological Museum' + Wikipedia geosearch (spec ~2.1km off)
    category: "culture",
    // No 'free' tag: entry may be ticketed, and the dataset stores only
    // verified attributes. Broke missions therefore never select it.
    tags: ["public", "historic", "photogenic"],
    clueMaterial: [
      "an archaeological museum of Kerala history on a green hill",
      "galleries of murals, coins and bronzes",
    ],
    suitability: "public",
  },
  {
    id: "kozhikode--kozhikode-railway-station",
    cityId: "kozhikode",
    name: "Kozhikode Railway Station",
    coords: [75.7812, 11.2461], // OSM node 11.2461,75.7812 (spec ~88m off)
    category: "transit",
    tags: ["public", "busy"],
    clueMaterial: [
      "the city's main railway station",
      "platforms where journeys begin and end",
    ],
    suitability: "public",
  },
  {
    id: "kozhikode--regional-science-centre",
    cityId: "kozhikode",
    name: "Regional Science Centre & Planetarium",
    coords: [75.7856, 11.2633], // OSM 'Regional Science Centre And Planetarium, Calicut' — 10m from spec pin
    category: "culture",
    // No 'free' tag: entry may be ticketed; same honesty rule as the museum.
    tags: ["public", "photogenic"],
    clueMaterial: [
      "a domed planetarium in green grounds",
      "hands-on science exhibits beside the dome",
    ],
    suitability: "public",
  },
];

/**
 * Fixed seed for the bundled demo journey ("Kozhikode — an afternoon, on
 * purpose"). The demo workstream uses it so the judge's run is identical
 * every time; played journeys seed from Date.now() instead.
 */
export const DEMO_JOURNEY_SEED = 20261010;
