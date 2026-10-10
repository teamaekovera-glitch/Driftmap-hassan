/**
 * Bundled demo photo manifest — the static assets behind every place with a
 * `demoPhotoId` (see kozhikode.ts). The six JPEGs ship in `public/demo/`,
 * already compressed by the photo pipeline's conventions (long edge
 * ≤ 1600px, JPEG quality ≈ 0.82, a few hundred KB each), so seeding copies
 * bytes instead of re-encoding a camera original.
 *
 * The generated images are labeled Demo wherever they surface — they stand
 * in for a player's own captures; nothing here is scraped photography.
 */

export interface DemoPhotoSource {
  /** Same-origin URL of the bundled asset — no network beyond the app host. */
  url: string;
  width: number;
  height: number;
}

export const DEMO_PHOTO_SOURCES: Record<string, DemoPhotoSource> = {
  "demo-street-art-wall": { url: "/demo/street-art-wall.jpg", width: 1152, height: 928 },
  "demo-tea-stall-evening": { url: "/demo/tea-stall-evening.jpg", width: 1152, height: 928 },
  "demo-heritage-lane": { url: "/demo/heritage-lane.jpg", width: 1152, height: 928 },
  "demo-mangrove-boardwalk": { url: "/demo/mangrove-boardwalk.jpg", width: 1152, height: 928 },
  "demo-beypore-shipyard": { url: "/demo/beypore-shipyard.jpg", width: 1152, height: 928 },
  "demo-kappad-sunset": { url: "/demo/kappad-sunset.jpg", width: 1152, height: 928 },
};
