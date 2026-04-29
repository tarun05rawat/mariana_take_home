export type QueryWindow = {
  latDelta: number;
  lonDelta: number;
  lonScale: number;
  radiusSquaredKm: number;
};

export function computeQueryWindow(lat: number, radiusKm: number): QueryWindow {
  const latDelta = radiusKm / 111.32;
  const lonScale = 111.32 * Math.max(Math.cos((lat * Math.PI) / 180), 0.2);
  const lonDelta = radiusKm / lonScale;

  return {
    latDelta,
    lonDelta,
    lonScale,
    radiusSquaredKm: radiusKm * radiusKm,
  };
}
