import { useEffect, useMemo, useState } from "react";
import type { QueryResponse } from "./types";
import MapView from "./components/MapView";

const DEFAULT_CENTER: [number, number] = [37.7749, -122.4194];
const DEFAULT_RADIUS = 5;

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }).format(value);
}

export default function App() {
  const [center, setCenter] = useState<[number, number]>(DEFAULT_CENTER);
  const [radiusKm, setRadiusKm] = useState(DEFAULT_RADIUS);
  const [results, setResults] = useState<QueryResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadSummary() {
      setIsLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams({
          lat: center[0].toString(),
          lon: center[1].toString(),
          radiusKm: radiusKm.toString(),
        });

        const response = await fetch(`/api/summary?${params.toString()}`);
        if (!response.ok) {
          throw new Error(`Request failed with status ${response.status}`);
        }

        const payload = (await response.json()) as QueryResponse;
        if (!cancelled) {
          setResults(payload);
        }
      } catch (requestError) {
        if (!cancelled) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : "Something went wrong while loading results.",
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadSummary();

    return () => {
      cancelled = true;
    };
  }, [center, radiusKm]);

  const cards = useMemo(
    () => [
      {
        label: "Estimated Population",
        value: results ? formatNumber(results.estimatedPopulation) : "--",
      },
      {
        label: "Bus Stops",
        value: results ? formatNumber(results.busStops) : "--",
      },
      {
        label: "Tram Stops",
        value: results ? formatNumber(results.tramStops) : "--",
      },
      {
        label: "Train / Metro Stops",
        value: results ? formatNumber(results.trainMetroStops) : "--",
      },
    ],
    [results],
  );

  return (
    <div className="app-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">Mariana Minerals Take-Home</p>
          <h1>Population around a point</h1>
          <p className="intro">
            Click the map to place a point, then adjust the radius to estimate
            local population and transit stop counts.
          </p>
        </div>

        <div className="controls-card">
          <label className="slider-label" htmlFor="radius">
            Radius: <strong>{radiusKm} km</strong>
          </label>
          <input
            id="radius"
            max={25}
            min={3}
            onChange={(event) => setRadiusKm(Number(event.target.value))}
            type="range"
            value={radiusKm}
          />
          <p className="coordinate-text">
            Selected point: {center[0].toFixed(4)}, {center[1].toFixed(4)}
          </p>
          {isLoading ? <p className="status-text">Updating results…</p> : null}
          {error ? <p className="status-text error-text">{error}</p> : null}
        </div>
      </section>

      <section className="content-grid">
        <div className="map-card">
          <MapView center={center} onSelect={setCenter} radiusKm={radiusKm} />
        </div>

        <aside className="results-panel">
          <h2>Results</h2>
          <div className="results-grid">
            {cards.map((card) => (
              <article className="result-card" key={card.label}>
                <p>{card.label}</p>
                <strong>{card.value}</strong>
              </article>
            ))}
          </div>
          <div className="notes-card">
            <h3>Approximation notes</h3>
            <p>
              Population is estimated from aggregated raster cells. Transit
              categories are mapped heuristically from the source tags.
            </p>
          </div>
        </aside>
      </section>
    </div>
  );
}
