# Mariana Minerals Take-Home

This project is a local exploratory geospatial analytics tool inspired by Tom Forth's "Population around a point" interaction model. A reviewer can click anywhere inside the supported Northern California dataset, adjust a radius, and immediately inspect approximate population and nearby transit infrastructure.

## What The App Does

- Renders an interactive map centered on San Francisco / Northern California
- Lets the user place a point and resize the analysis circle from `3 km` to `25 km`
- Estimates population within the circle from locally preprocessed raster-derived cells
- Counts nearby `bus`, `tram`, and `train / metro` stops from the provided transit dataset
- Supports side-by-side compare mode with two named areas
- Persists app state in the URL for shareable views
- Exports a concise PDF report for both single-point and compare workflows
- Provides a copy-link action for the current view

## Architecture

- Frontend: React + TypeScript + Vite
- Map: Leaflet + OpenStreetMap tiles
- Backend: minimal local TypeScript HTTP server
- Database: local SQLite rebuilt from the provided source files
- Import pipeline: Python preprocessing for GeoJSON + GeoTIFF inputs

## Reviewer Setup

### Prerequisites

- Node.js `20+`
- npm `10+`
- Python `3.11+`
- `sqlite3` CLI available on the shell path

### Quick Setup

For the easiest local setup path, you can run:

```bash
./scripts/setup.sh
```

What this script does:

- checks for `node`, `npm`, `python3`, and `sqlite3`
- attempts Homebrew installs on macOS when a required tool is missing
- runs `npm install`
- creates `.venv`
- installs Python dependencies from `requirements.txt`

After the script finishes:

```bash
npm run import-data
npm run dev
```

### Manual Setup

1. Install frontend dependencies:

```bash
npm install
```

2. Create the local Python virtual environment:

```bash
python3 -m venv .venv
./.venv/bin/pip install -r requirements.txt
```

3. Build the local SQLite database from the provided assignment materials:

```bash
npm run import-data
```

4. Start the frontend and backend together:

```bash
npm run dev
```

5. Open the app:

```text
http://127.0.0.1:5173
```

### Notes For Reviewers

- The SQLite database is intentionally not committed. The repo includes a reproducible importer, and `npm run import-data` rebuilds the local database from the provided files.
- The importer reads from `Project Materials/SWE_Interns_Takehome.zip` and matches archive members by filename so the rebuild path is robust to the source folder structure inside the archive.
- The app is designed to run entirely locally. No hosted backend or external data service is required.
- On macOS, if system dependencies are missing and Homebrew is available, `./scripts/setup.sh` will attempt to install them automatically.

## Core Reviewer Flow

1. Open the app at `http://127.0.0.1:5173`
2. Click a point inside the highlighted Northern California dataset bounds
3. Move the radius slider between `3 km` and `25 km`
4. Inspect the live summary cards for population and transit counts
5. Toggle `Compare mode` to place a second point and compare two nearby areas
6. Use `Copy link` or `Download report` to verify the export/share workflow

## Features In The Final App

### Core MVP

- Click-to-place point selection
- Visible circle around the selected point
- Adjustable radius slider with default `5 km`
- Results for:
  - estimated population
  - bus stops
  - tram stops
  - train / metro stops

### Product Extensions

- Compare mode with primary vs compare area summaries
- Nearest-stop derived area labels such as `Near ...`
- Dataset-bounds overlay with dimmed unsupported regions
- Bounds warning popup for out-of-scope clicks
- Animated metric updates and loading skeletons
- Downloadable PDF summary report
- Shareable URL state
- Resizable map / results split for desktop exploration

## Testing

Run static type checks:

```bash
npm run check
```

Run Python tests:

```bash
npm run test:python
```

Run TypeScript tests:

```bash
npm run test:ts
```

Run the full test suite:

```bash
npm test
```

Build the production frontend:

```bash
npm run build
```

## Useful Commands

```bash
npm run check
npm run import-data
npm run test:python
npm run test:ts
npm test
npm run build
npm run dev
npm run dev:server
npm run dev:client
```

## Data Processing, Assumptions, And Tradeoffs

- Population is estimated from aggregated raster cells rather than exact geospatial clipping against a mathematically precise circle.
- Transit mode classification is heuristic:
  - `tram` if the source tags imply tram or light rail
  - `train_metro` if the source tags imply train, subway, station, halt, or platform
  - `bus` if the source tags imply `bus=yes`
- Circle inclusion uses an approximate equirectangular distance calculation after a latitude / longitude bounding-box filter.
- Non-point transit geometries are reduced to centroids for simpler querying.
- Area labels are inferred from the nearest named transit stop in the provided local dataset rather than from an external reverse-geocoding service.
- The map intentionally limits interaction to the provided Northern California dataset coverage so the experience stays aligned with the supplied source material.

## How AI Was Used In Development

AI was used as an engineering accelerator, not as a substitute for system design or implementation judgment.

- AI-assisted planning was used to quickly break the take-home into a vertical slice: importer, SQLite schema, query path, API, and interaction model.
- AI-supported scaffolding helped accelerate boilerplate generation for React, TypeScript, tests, and PDF export utilities, which reduced setup overhead and kept more time focused on product decisions.
- Iterative prompt-driven UI exploration was used like rapid design pairing: experimenting on hierarchy, spacing, compare-mode ergonomics, loading states, and report formatting while preserving the app's functional constraints.
- Agentic debugging workflows were used to diagnose interaction bugs, URL-state edge cases, stale event handlers, and report-layout issues through repeated inspect-edit-verify loops.
- AI-assisted test generation helped expand regression coverage around radius changes, compare mode, URL hydration, export flows, and failure states.

The final implementation still reflects explicit human choices around architecture, heuristic classification, approximation boundaries, reviewer UX, and what not to over-engineer for an MVP.
