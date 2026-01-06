
/**
 * Calculates the distance between two coordinates using the Haversine formula.
 * @param {{latitude: number, longitude: number}} coord1 - The first coordinate.
 * @param {{latitude: number, longitude: number}} coord2 - The second coordinate.
 * @returns {number} The distance in meters.
 */
function haversine(coord1, coord2) {
  const R = 6371000; // Earth's radius in meters
  const toRad = (deg) => deg * (Math.PI / 180);

  const dLat = toRad(coord2.latitude - coord1.latitude);
  const dLon = toRad(coord2.longitude - coord1.longitude);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(coord1.latitude)) *
      Math.cos(toRad(coord2.latitude)) *
      Math.sin(dLon / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // Distance in meters
}

/**
 * Calculates the total miles of a trip from an array of locations.
 * @param {Array<{latitude: number, longitude: number}>} locations - The array of locations.
 * @returns {number} The total distance in miles.
 */
function calculateTotalMiles(locations) {
  if (!locations || locations.length < 2) {
    return 0;
  }

  let totalMeters = 0;
  for (let i = 1; i < locations.length; i++) {
    totalMeters += haversine(locations[i - 1], locations[i]);
  }

  return totalMeters / 1609.34; // Convert meters to miles
}

export default {
  haversine,
  calculateTotalMiles,
};
