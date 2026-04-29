import { useEffect, useState, type CSSProperties } from "react";
import type { QueryResponse } from "./types";
import MapView from "./components/MapView";

const DEFAULT_CENTER: [number, number] = [37.7749, -122.4194];
const DEFAULT_RADIUS = 5;
const MIN_RADIUS = 3;
const MAX_RADIUS = 25;

type ResultCard = {
  accent: string;
  icon: string;
  label: string;
  sublabel: string;
  value: number | null;
};

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }).format(value);
}

function AnimatedNumber({ value }: { value: number | null }) {
  const [displayValue, setDisplayValue] = useState<number | null>(value);

  useEffect(() => {
    if (value === null) {
      setDisplayValue(null);
      return;
    }

    let frame = 0;
    const startValue = displayValue ?? 0;
    const delta = value - startValue;
    const startedAt = performance.now();
    const duration = 700;

    function tick(now: number) {
      const progress = Math.min((now - startedAt) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayValue(Math.round(startValue + delta * eased));

      if (progress < 1) {
        frame = window.requestAnimationFrame(tick);
      }
    }

    frame = window.requestAnimationFrame(tick);

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [displayValue, value]);

  if (displayValue === null) {
    return <>--</>;
  }

  return <>{formatNumber(displayValue)}</>;
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

  const sliderProgress = ((radiusKm - MIN_RADIUS) / (MAX_RADIUS - MIN_RADIUS)) * 100;
  const cards: ResultCard[] = [
    {
      accent: "population",
      icon: "PO",
      label: "Estimated Population",
      sublabel: "People inside the current radius",
      value: results?.estimatedPopulation ?? null,
    },
    {
      accent: "bus",
      icon: "BU",
      label: "Bus Stops",
      sublabel: "Street-level bus access points",
      value: results?.busStops ?? null,
    },
    {
      accent: "tram",
      icon: "TR",
      label: "Tram Stops",
      sublabel: "Light rail and tram stations",
      value: results?.tramStops ?? null,
    },
    {
      accent: "rail",
      icon: "RA",
      label: "Train / Metro Stops",
      sublabel: "Regional rail and metro nodes",
      value: results?.trainMetroStops ?? null,
    },
  ];

  return (
    <div className="app-shell">
      <div className="ambient ambient-left" aria-hidden="true" />
      <div className="ambient ambient-right" aria-hidden="true" />

      <section className="hero">
        <div className="hero-copy">
          <div className="headline-wrap">
            <p className="eyebrow">Mariana Minerals Take-Home</p>
            <h1>Population around a point</h1>
            <h2>Inspect population and transit coverage around any point in Northern California.</h2>
          </div>
          <p className="intro">
            Click anywhere on the map, sweep the radius, and get a fast,
            explainable approximation of population and nearby transit
            infrastructure without leaving the browser.
          </p>
          <div className="hero-highlights">
            <div className="highlight-chip">Local SQLite-backed analysis</div>
            <div className="highlight-chip">Approximate circle query</div>
          </div>
        </div>

        <div className="controls-card">
          <div className="controls-header">
            <div>
              <p className="controls-title">Search radius</p>
              <p className="controls-subtitle">
                Shape the coverage area around the current point.
              </p>
            </div>
            <div className="radius-badge">
              <span>Radius:</span>
              <strong>{radiusKm} km</strong>
            </div>
          </div>

          <div
            className="slider-shell"
            style={{ "--slider-progress": `${sliderProgress}%` } as CSSProperties}
          >
            <label className="slider-label" htmlFor="radius">
              Radius: {radiusKm} km
            </label>
            <input
              aria-label={`Radius: ${radiusKm} km`}
              id="radius"
              max={MAX_RADIUS}
                min={MIN_RADIUS}
                onChange={(event) => setRadiusKm(Number(event.target.value))}
                type="range"
                value={radiusKm}
              />
            <div className="slider-scale" aria-hidden="true">
              <span>{MIN_RADIUS} km</span>
              <span>{MAX_RADIUS} km</span>
            </div>
          </div>

          <div className="control-meta">
            <div className="meta-tile meta-tile-full">
              <span className="meta-label">Selected point</span>
              <strong>
                {center[0].toFixed(4)}, {center[1].toFixed(4)}
              </strong>
            </div>
          </div>

          {isLoading ? (
            <div className="status-banner" role="status">
              <span className="status-spinner" aria-hidden="true" />
              <span>Updating results…</span>
            </div>
          ) : null}
          {error ? <p className="status-text error-text">{error}</p> : null}
        </div>
      </section>

      <section className="content-grid">
        <div className="map-card">
          <div className="map-card-header">
            <div>
              <p className="panel-eyebrow">Interactive map</p>
              <h3>Click to reposition the analysis circle</h3>
            </div>
            <div className="map-tip">Tap any town or neighborhood</div>
          </div>

          <div className="map-stage">
            <MapView
              center={center}
              isLoading={isLoading}
              onSelect={setCenter}
              radiusKm={radiusKm}
            />
            <div className="map-overlay map-overlay-top" aria-hidden="true">
              <span className="overlay-chip">Live circle estimate</span>
              <span className="overlay-chip overlay-chip-muted">
                {radiusKm} km coverage
              </span>
            </div>
            <div className="map-overlay map-overlay-bottom">
              <div className="overlay-card">
                <span className="overlay-label">Selected point</span>
                <strong>
                  {center[0].toFixed(4)}, {center[1].toFixed(4)}
                </strong>
              </div>
              <div className="overlay-card overlay-card-emphasis">
                <span className="overlay-label">Radius</span>
                <strong>{radiusKm} km</strong>
              </div>
            </div>
            {isLoading ? (
              <div className="map-loading-scrim" aria-hidden="true">
                <div className="map-loading-card">
                  <span className="status-spinner" />
                  <span>Refreshing circle metrics</span>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <aside className="results-panel">
          <div className="results-header">
            <div>
              <p className="panel-eyebrow">Results</p>
              <h2>Radius summary</h2>
            </div>
          </div>

          <div className="results-grid">
            {cards.map((card) => (
              <article
                className={`result-card result-card-${card.accent} ${
                  isLoading ? "is-loading" : ""
                }`}
                key={card.label}
              >
                <div className="result-card-head">
                  <span className="result-icon" aria-hidden="true">
                    {card.icon}
                  </span>
                  <div>
                    <p>{card.label}</p>
                    <span className="result-sublabel">{card.sublabel}</span>
                  </div>
                </div>
                <strong>
                  <AnimatedNumber value={card.value} />
                </strong>
              </article>
            ))}
          </div>
        </aside>
      </section>

      <section className="notes-strip">
        <div className="notes-card notes-card-wide">
          <div className="notes-header">
            <div>
              <p className="panel-eyebrow">Approximation notes</p>
              <h3>How the local estimate is produced</h3>
            </div>
            <span className="notes-badge">Method</span>
          </div>
          <p>
            Population is estimated from aggregated raster cells from the
            provided population GeoTIFF. Transit categories are derived from
            the provided San Francisco / Northern California stop export using
            pragmatic heuristics.
          </p>
          <ul className="notes-list">
            <li>Population uses raster-derived cell aggregation, not exact polygon clipping.</li>
            <li>Transit modes are normalized into bus, tram, and train/metro from raw source tags.</li>
            <li>Circle inclusion uses simplified local distance math for fast exploratory use.</li>
          </ul>
        </div>
      </section>
    </div>
  );
}
