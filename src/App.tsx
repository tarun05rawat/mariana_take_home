import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import MapView from "./components/MapView";
import type { QueryResponse } from "./types";
import { buildPdfReport } from "./utils/reportPdf";

const DEFAULT_CENTER: [number, number] = [37.7749, -122.4194];
const DEFAULT_RADIUS = 5;
const MIN_RADIUS = 3;
const MAX_RADIUS = 25;
const DATA_BOUNDS = {
  minLat: 36.85,
  maxLat: 38.72,
  minLon: -123.35,
  maxLon: -121.2,
};

type Point = [number, number];
type SelectionTarget = "primary" | "compare";

type ResultCard = {
  accent: string;
  icon: string;
  label: string;
  primaryValue: number | null;
  secondaryValue: number | null;
  sublabel: string;
};

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }).format(value);
}

function formatCoords(point: Point) {
  return `${point[0].toFixed(4)}, ${point[1].toFixed(4)}`;
}

function toSafeSlug(value: string) {
  return value
    .toLowerCase()
    .replace(/^near\s+/i, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .split("-")
    .slice(0, 8)
    .join("-");
}

function clampRadius(value: number) {
  return Math.min(MAX_RADIUS, Math.max(MIN_RADIUS, value));
}

function isWithinBounds(point: Point) {
  const [lat, lon] = point;
  return (
    lat >= DATA_BOUNDS.minLat &&
    lat <= DATA_BOUNDS.maxLat &&
    lon >= DATA_BOUNDS.minLon &&
    lon <= DATA_BOUNDS.maxLon
  );
}

function parsePoint(searchParams: URLSearchParams, latKey: string, lonKey: string) {
  const lat = Number(searchParams.get(latKey));
  const lon = Number(searchParams.get(lonKey));

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return null;
  }

  const point = [lat, lon] as Point;
  return isWithinBounds(point) ? point : null;
}

function getInitialState() {
  if (typeof window === "undefined") {
    return {
      primaryCenter: DEFAULT_CENTER,
      radiusKm: DEFAULT_RADIUS,
      compareMode: false,
      compareCenter: null as Point | null,
    };
  }

  const searchParams = new URLSearchParams(window.location.search);
  const primaryCenter = parsePoint(searchParams, "lat", "lon") ?? DEFAULT_CENTER;
  const radiusValue = Number(searchParams.get("radiusKm"));
  const radiusKm = Number.isFinite(radiusValue) ? clampRadius(radiusValue) : DEFAULT_RADIUS;
  const compareCenter = parsePoint(searchParams, "compareLat", "compareLon");
  const compareMode =
    searchParams.get("compare") === "1" && compareCenter !== null;

  return {
    primaryCenter,
    radiusKm,
    compareMode,
    compareCenter: compareMode ? compareCenter : null,
  };
}

async function fetchSummary(point: Point, radiusKm: number) {
  const params = new URLSearchParams({
    lat: point[0].toString(),
    lon: point[1].toString(),
    radiusKm: radiusKm.toString(),
  });

  const response = await fetch(`/api/summary?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }

  return (await response.json()) as QueryResponse;
}

function getLocationLabel(result: QueryResponse | null, fallback: string) {
  return result?.locationName?.trim() || fallback;
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
    const duration = 650;

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
    return <span className="value-skeleton" aria-hidden="true" />;
  }

  return <>{formatNumber(displayValue)}</>;
}

function DeltaBadge({
  primaryValue,
  secondaryValue,
}: {
  primaryValue: number | null;
  secondaryValue: number | null;
}) {
  if (primaryValue === null || secondaryValue === null) {
    return <span className="compare-pill compare-pill-placeholder">Waiting for compare point</span>;
  }

  const delta = secondaryValue - primaryValue;
  const prefix = delta > 0 ? "+" : "";
  const tone = delta === 0 ? "is-neutral" : delta > 0 ? "is-positive" : "is-negative";

  return (
    <span className={`compare-pill ${tone}`}>
      Difference {prefix}
      {formatNumber(delta)}
    </span>
  );
}

export default function App() {
  const initialState = useMemo(() => getInitialState(), []);
  const [center, setCenter] = useState<Point>(initialState.primaryCenter);
  const [radiusKm, setRadiusKm] = useState(initialState.radiusKm);
  const [compareMode, setCompareMode] = useState(initialState.compareMode);
  const [compareCenter, setCompareCenter] = useState<Point | null>(initialState.compareCenter);
  const [selectionTarget, setSelectionTarget] = useState<SelectionTarget>(
    initialState.compareMode ? "compare" : "primary",
  );
  const [results, setResults] = useState<QueryResponse | null>(null);
  const [compareResults, setCompareResults] = useState<QueryResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reportFeedback, setReportFeedback] = useState<string | null>(null);
  const [linkFeedback, setLinkFeedback] = useState<string | null>(null);
  const [splitLeftPercent, setSplitLeftPercent] = useState(70);
  const contentGridRef = useRef<HTMLElement | null>(null);

  const focusCenter =
    compareMode && selectionTarget === "compare" && compareCenter ? compareCenter : center;
  const primaryLabel = getLocationLabel(results, "San Francisco");
  const compareLabel = getLocationLabel(compareResults, "Selected compare area");

  useEffect(() => {
    let cancelled = false;

    async function loadSummary() {
      setIsLoading(true);
      setError(null);

      try {
        const [primaryPayload, comparePayload] = await Promise.all([
          fetchSummary(center, radiusKm),
          compareMode && compareCenter
            ? fetchSummary(compareCenter, radiusKm)
            : Promise.resolve(null),
        ]);

        if (!cancelled) {
          setResults(primaryPayload);
          setCompareResults(comparePayload);
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
  }, [center, compareCenter, compareMode, radiusKm]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const searchParams = new URLSearchParams();
    searchParams.set("lat", center[0].toFixed(6));
    searchParams.set("lon", center[1].toFixed(6));
    searchParams.set("radiusKm", radiusKm.toString());

    if (compareMode && compareCenter) {
      searchParams.set("compare", "1");
      searchParams.set("compareLat", compareCenter[0].toFixed(6));
      searchParams.set("compareLon", compareCenter[1].toFixed(6));
    }

    const nextUrl = `${window.location.pathname}?${searchParams.toString()}`;
    window.history.replaceState(null, "", nextUrl);
  }, [center, compareCenter, compareMode, radiusKm]);

  useEffect(() => {
    if (!compareMode) {
      setSelectionTarget("primary");
      setCompareResults(null);
    }
  }, [compareMode]);

  useEffect(() => {
    if (!reportFeedback && !linkFeedback) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setReportFeedback(null);
      setLinkFeedback(null);
    }, 1800);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [reportFeedback, linkFeedback]);

  useEffect(() => {
    function stopDragging() {
      document.body.classList.remove("is-resizing-panels");
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopDragging);
    }

    function handlePointerMove(event: PointerEvent) {
      const grid = contentGridRef.current;
      if (!grid) {
        return;
      }

      const bounds = grid.getBoundingClientRect();
      const nextPercent = ((event.clientX - bounds.left) / bounds.width) * 100;
      const clamped = Math.min(78, Math.max(52, nextPercent));
      setSplitLeftPercent(clamped);
    }

    const startDragging = (event: PointerEvent) => {
      if (window.innerWidth <= 1180) {
        return;
      }

      event.preventDefault();
      document.body.classList.add("is-resizing-panels");
      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", stopDragging, { once: true });
    };

    const handle = document.getElementById("panel-resize-handle");
    handle?.addEventListener("pointerdown", startDragging);

    return () => {
      handle?.removeEventListener("pointerdown", startDragging);
      stopDragging();
    };
  }, []);

  function handleMapSelect(point: Point) {
    if (compareMode && selectionTarget === "compare") {
      setCompareCenter(point);
      return;
    }

    setCenter(point);
  }

  function getShareUrl() {
    if (typeof window === "undefined") {
      return "";
    }

    return `${window.location.origin}${window.location.pathname}${window.location.search}`;
  }

  function triggerDownload(blob: Blob, fileName: string) {
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => {
      URL.revokeObjectURL(objectUrl);
    }, 1000);
  }

  function buildSnapshotSections() {
    const sections = [
      {
        heading: "Primary Area",
        lines: [
          `Label: ${primaryLabel}`,
          `Coordinates: ${formatCoords(center)}`,
          `Radius: ${radiusKm} km`,
          `Estimated population: ${results ? formatNumber(results.estimatedPopulation) : "--"}`,
          `Bus stops: ${results ? formatNumber(results.busStops) : "--"}`,
          `Tram stops: ${results ? formatNumber(results.tramStops) : "--"}`,
          `Train / metro stops: ${
            results ? formatNumber(results.trainMetroStops) : "--"
          }`,
        ],
      },
    ];

    if (compareMode && compareCenter) {
      sections.push({
        heading: "Compare Area",
        lines: [
          `Label: ${compareLabel}`,
          `Coordinates: ${formatCoords(compareCenter)}`,
          `Radius: ${radiusKm} km`,
          `Estimated population: ${
            compareResults ? formatNumber(compareResults.estimatedPopulation) : "--"
          }`,
          `Bus stops: ${compareResults ? formatNumber(compareResults.busStops) : "--"}`,
          `Tram stops: ${compareResults ? formatNumber(compareResults.tramStops) : "--"}`,
          `Train / metro stops: ${
            compareResults ? formatNumber(compareResults.trainMetroStops) : "--"
          }`,
        ],
      });
    }

    sections.push({
      heading: "Method Notes",
      lines: [
        "Population is estimated from aggregated raster cells from the provided GeoTIFF.",
        "Transit categories are derived heuristically from the provided Northern California stop export.",
        "These figures are intended for exploratory analysis and quick comparison, not precise geospatial reporting.",
        `Share URL: ${getShareUrl()}`,
      ],
    });

    return sections;
  }

  async function handleDownloadReport() {
    const generatedAt = new Intl.DateTimeFormat("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date());

    const pdfBlob = buildPdfReport({
      title: compareMode ? "Population Around A Point Comparison" : "Population Around A Point Summary",
      subtitle: "Local exploratory geospatial report",
      sections: buildSnapshotSections(),
      footer: `Generated ${generatedAt} from the Mariana Minerals take-home prototype.`,
    });

    const safePrimary = toSafeSlug(primaryLabel);
    const fileName = compareMode
      ? `population-compare-${safePrimary || "snapshot"}.pdf`
      : `population-summary-${safePrimary || "snapshot"}.pdf`;

    triggerDownload(pdfBlob, fileName);
    setReportFeedback("Report downloaded");
  }

  async function handleCopyLink() {
    try {
      await navigator.clipboard.writeText(getShareUrl());
      setLinkFeedback("Link copied");
    } catch {
      setLinkFeedback("Copy unavailable");
    }
  }

  const sliderProgress = ((radiusKm - MIN_RADIUS) / (MAX_RADIUS - MIN_RADIUS)) * 100;
  const cards: ResultCard[] = [
    {
      accent: "population",
      icon: "PO",
      label: "Estimated Population",
      primaryValue: results?.estimatedPopulation ?? null,
      secondaryValue: compareMode ? compareResults?.estimatedPopulation ?? null : null,
      sublabel: "People inside the current radius",
    },
    {
      accent: "bus",
      icon: "BU",
      label: "Bus Stops",
      primaryValue: results?.busStops ?? null,
      secondaryValue: compareMode ? compareResults?.busStops ?? null : null,
      sublabel: "Street-level bus access points",
    },
    {
      accent: "tram",
      icon: "TR",
      label: "Tram Stops",
      primaryValue: results?.tramStops ?? null,
      secondaryValue: compareMode ? compareResults?.tramStops ?? null : null,
      sublabel: "Light rail and tram stations",
    },
    {
      accent: "rail",
      icon: "RA",
      label: "Train / Metro Stops",
      primaryValue: results?.trainMetroStops ?? null,
      secondaryValue: compareMode ? compareResults?.trainMetroStops ?? null : null,
      sublabel: "Regional rail and metro nodes",
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
            <div className="highlight-chip">Shareable URL state</div>
          </div>
          <div className="hero-brief">
            <div className="hero-brief-card">
              <span className="hero-brief-label">What this tool gives you</span>
              <p>Click a point, choose a radius, and compare plausible population and transit access without leaving the map.</p>
            </div>
            <div className="hero-brief-card">
              <span className="hero-brief-label">Why it feels fast</span>
              <p>SQLite-backed summaries and simplified inclusion math keep the workflow immediate enough for exploratory analysis.</p>
            </div>
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

          <div className="compare-toggle-group" role="tablist" aria-label="Selection mode">
            <button
              className={`compare-toggle ${!compareMode ? "is-active" : ""}`}
              onClick={() => setCompareMode(false)}
              type="button"
            >
              Single point
            </button>
            <button
              className={`compare-toggle ${compareMode ? "is-active" : ""}`}
              onClick={() => {
                setCompareMode(true);
                setSelectionTarget("compare");
              }}
              type="button"
            >
              Compare mode
            </button>
          </div>

          {compareMode ? (
            <div className="compare-target-row">
              <button
                className={`compare-target ${selectionTarget === "primary" ? "is-active" : ""}`}
                onClick={() => setSelectionTarget("primary")}
                type="button"
              >
                Editing primary area
              </button>
              <button
                className={`compare-target ${selectionTarget === "compare" ? "is-active" : ""}`}
                onClick={() => setSelectionTarget("compare")}
                type="button"
              >
                {compareCenter ? "Editing compare area" : "Set compare area"}
              </button>
            </div>
          ) : null}

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

          <div className={`control-meta ${compareMode ? "is-compare" : ""}`}>
            <div className="meta-tile meta-tile-full">
              <span className="meta-label">Primary area</span>
              <strong>{primaryLabel}</strong>
              <span className="meta-detail">{formatCoords(center)}</span>
            </div>
            {compareMode ? (
              <div className="meta-tile meta-tile-full">
                <span className="meta-label">Compare area</span>
                <strong>{compareCenter ? compareLabel : "Click the map to place it"}</strong>
                <span className="meta-detail">
                  {compareCenter ? formatCoords(compareCenter) : "Waiting for selection"}
                </span>
              </div>
            ) : null}
          </div>

          {compareMode && !compareCenter && selectionTarget === "compare" ? (
            <div className="status-banner compare-hint" role="status">
              <span className="status-spinner" aria-hidden="true" />
              <span>Next in-bounds map click will place the compare area.</span>
            </div>
          ) : null}
          {error ? <p className="status-text error-text">{error}</p> : null}
        </div>
      </section>

      <section
        className="content-grid"
        ref={contentGridRef}
        style={{ "--split-left": `${splitLeftPercent}%` } as CSSProperties}
      >
        <div className="map-card">
          <div className="map-card-header">
            <div>
              <p className="panel-eyebrow">Interactive map</p>
              <h3>
                {compareMode
                  ? "Click to position primary and compare circles"
                  : "Click to reposition the analysis circle"}
              </h3>
            </div>
            <div className="map-tip">Tap any town or neighborhood</div>
          </div>

          <div className="map-stage">
            <MapView
              center={center}
              compareCenter={compareMode ? compareCenter : null}
              focusCenter={focusCenter}
              isLoading={isLoading}
              onSelect={handleMapSelect}
              radiusKm={radiusKm}
            />
            <div className="map-overlay map-overlay-top" aria-hidden="true">
              <span className="overlay-chip">
                {compareMode ? "Compare circle estimate" : "Live circle estimate"}
              </span>
            </div>
            <div className="map-overlay map-overlay-bottom">
              <div className="overlay-card">
                <span className="overlay-label">Primary area</span>
                <strong>{primaryLabel}</strong>
                <span className="overlay-detail">{formatCoords(center)}</span>
              </div>
              {compareMode && compareCenter ? (
                <div className="overlay-card overlay-card-secondary">
                  <span className="overlay-label">Compare area</span>
                  <strong>{compareLabel}</strong>
                  <span className="overlay-detail">{formatCoords(compareCenter)}</span>
                </div>
              ) : (
                <div className="overlay-card overlay-card-emphasis">
                  <span className="overlay-label">Radius</span>
                  <strong>{radiusKm} km</strong>
                </div>
              )}
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

        <div
          aria-label="Resize map and results panels"
          className="panel-resize-handle"
          id="panel-resize-handle"
          role="separator"
          aria-orientation="vertical"
          tabIndex={0}
        >
          <span className="panel-resize-handle-line" aria-hidden="true" />
        </div>

        <aside className="results-panel">
          <div className="results-header">
            <div>
              <p className="panel-eyebrow">Results</p>
              <h2>{compareMode ? "Compare radius summary" : "Radius summary"}</h2>
            </div>
            <div className="result-actions">
              <button className="secondary-action-button" onClick={handleCopyLink} type="button">
                {linkFeedback ?? "Copy link"}
              </button>
              <button className="export-button" onClick={handleDownloadReport} type="button">
                {reportFeedback ?? "Download report"}
              </button>
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
                {!compareMode ? (
                  <strong>
                    <AnimatedNumber value={card.primaryValue} />
                  </strong>
                ) : null}
                {compareMode ? (
                  <div className="compare-metric-grid">
                    <div className="compare-metric-cell is-primary">
                      <span className="compare-metric-kicker">Primary area</span>
                      <span className="compare-metric-name">{primaryLabel}</span>
                      <span className="compare-metric-figure">
                        {card.primaryValue === null ? (
                          <span className="mini-skeleton" aria-hidden="true" />
                        ) : (
                          formatNumber(card.primaryValue)
                        )}
                      </span>
                    </div>
                    <div className="compare-metric-cell is-secondary">
                      <span className="compare-metric-kicker">Compare area</span>
                      <span className="compare-metric-name">
                        {compareCenter ? compareLabel : "Waiting for compare area"}
                      </span>
                      <span className="compare-metric-figure">
                        {card.secondaryValue === null ? (
                          <span className="mini-skeleton" aria-hidden="true" />
                        ) : (
                          formatNumber(card.secondaryValue)
                        )}
                      </span>
                    </div>
                  </div>
                ) : null}
                {compareMode ? (
                  <div className="compare-summary-row">
                    <span className="compare-summary-label">At a glance</span>
                    <DeltaBadge
                      primaryValue={card.primaryValue}
                      secondaryValue={card.secondaryValue}
                    />
                  </div>
                ) : null}
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
            <li>Area names are inferred from the nearest named transit stop in the provided local dataset.</li>
            <li>Population uses raster-derived cell aggregation, not exact polygon clipping.</li>
            <li>Transit modes are normalized into bus, tram, and train/metro from raw source tags.</li>
            <li>Circle inclusion uses simplified local distance math for fast exploratory use.</li>
          </ul>
        </div>
      </section>
    </div>
  );
}
