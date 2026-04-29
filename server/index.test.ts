import { describe, expect, it } from "vitest";
import { DB_PATH, querySummary } from "./index";

describe("querySummary", () => {
  it("uses the rebuilt local database", async () => {
    expect(DB_PATH.endsWith("data/mariana_minerals.sqlite")).toBe(true);
  });

  it("returns plausible counts for downtown San Francisco at 5 km", async () => {
    const result = await querySummary(37.7749, -122.4194, 5);

    expect(result.estimatedPopulation).toBeGreaterThan(100000);
    expect(result.busStops).toBeGreaterThan(1000);
    expect(result.tramStops).toBeGreaterThan(100);
    expect(result.trainMetroStops).toBeGreaterThan(10);
  });

  it("increases counts when radius increases at the same point", async () => {
    const small = await querySummary(37.7749, -122.4194, 5);
    const large = await querySummary(37.7749, -122.4194, 10);

    expect(large.estimatedPopulation).toBeGreaterThan(small.estimatedPopulation);
    expect(large.busStops).toBeGreaterThan(small.busStops);
    expect(large.tramStops).toBeGreaterThanOrEqual(small.tramStops);
    expect(large.trainMetroStops).toBeGreaterThanOrEqual(small.trainMetroStops);
  });

  it("returns smaller counts for a less dense point nearby", async () => {
    const downtown = await querySummary(37.7749, -122.4194, 5);
    const peninsula = await querySummary(37.4519, -122.1822, 5);

    expect(peninsula.estimatedPopulation).toBeLessThan(downtown.estimatedPopulation);
    expect(peninsula.busStops).toBeLessThan(downtown.busStops);
  });
});
