/**
 * Pure spherical-geo helpers. Coordinates are [longitude, latitude] per the
 * shared data model. No dependencies, safe for unit tests and edge runtimes.
 */

const EARTH_RADIUS_M = 6_371_000;

/** Great-circle distance between two [lon, lat] points, in meters. */
export function distanceMeters(a: [number, number], b: [number, number]): number {
  const [lon1, lat1] = a;
  const [lon2, lat2] = b;
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const dPhi = ((lat2 - lat1) * Math.PI) / 180;
  const dLambda = ((lon2 - lon1) * Math.PI) / 180;
  const h =
    Math.sin(dPhi / 2) ** 2 +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}
