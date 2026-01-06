
import { haversine, calculateTotalMiles } from "../utils/haversine";

describe("Haversine Formula", () => {
  test("should calculate the distance between two points correctly", () => {
    const coord1 = { latitude: 34.052235, longitude: -118.243683 }; // Los Angeles
    const coord2 = { latitude: 40.712776, longitude: -74.005974 }; // New York
    const expectedDistanceMeters = 3935700; // More accurate approximate distance

    const distance = haversine(coord1, coord2);
    expect(distance).toBeCloseTo(expectedDistanceMeters, 0); // Allow for 0 meters difference
  });

  test("should return 0 for identical coordinates", () => {
    const coord1 = { latitude: 34.052235, longitude: -118.243683 };
    const coord2 = { latitude: 34.052235, longitude: -118.243683 };

    const distance = haversine(coord1, coord2);
    expect(distance).toBe(0);
  });
});

describe("calculateTotalMiles", () => {
  test("should calculate total miles for a simple trip", () => {
    const locations = [
      { latitude: 34.052235, longitude: -118.243683 }, // Los Angeles
      { latitude: 34.052235, longitude: -118.243683 }, // Still Los Angeles
      { latitude: 34.052235, longitude: -118.243683 + 0.01 }, // A bit east
    ];
    // Very small distance, should be close to 0
    const expectedMiles = haversine(locations[1], locations[2]) / 1609.34;

    const totalMiles = calculateTotalMiles(locations);
    expect(totalMiles).toBeCloseTo(expectedMiles, 5);
  });

  test("should return 0 for an empty locations array", () => {
    const locations = [];
    const totalMiles = calculateTotalMiles(locations);
    expect(totalMiles).toBe(0);
  });

  test("should return 0 for a single location", () => {
    const locations = [{ latitude: 34.052235, longitude: -118.243683 }];
    const totalMiles = calculateTotalMiles(locations);
    expect(totalMiles).toBe(0);
  });
});
