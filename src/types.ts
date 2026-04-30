export type QueryResponse = {
  estimatedPopulation: number;
  busStops: number;
  tramStops: number;
  trainMetroStops: number;
  locationName?: string;
  locationNameSource?: "nearest_stop" | "fallback";
};
