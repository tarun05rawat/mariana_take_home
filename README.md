# Mariana Minerals Take-Home

This project is a local prototype inspired by Tom Forth's "Population around a point" UI. It lets you click a map in the San Francisco / Northern California region, choose a radius, and view approximate population and transit stop counts within that circle.

## Stack

- React + TypeScript + Vite frontend
- Minimal TypeScript HTTP server for the local API
- SQLite database created from the provided source files
- Python importer for GeoJSON and GeoTIFF preprocessing

## Prerequisites

- Node.js 20+
- npm 10+
- Python 3.11+
- `sqlite3` CLI available on your path

## Run Locally

1. Install frontend dependencies:

```bash
npm install
```

2. Create a local Python environment for the importer and tests:

```bash
python3 -m venv .venv
./.venv/bin/pip install -r requirements.txt
```

3. Build the local SQLite database from the provided files:

```bash
npm run import-data
```

4. Start the frontend and backend together:

```bash
npm run dev
```

5. Open the app at `http://127.0.0.1:5173`.

## Tests

Run the Python tests:

```bash
npm run test:python
```

Run the TypeScript tests:

```bash
npm run test:ts
```

Run the full test suite:

```bash
npm test
```

## Useful Commands

```bash
npm run check
npm run test:python
npm run test:ts
npm test
npm run build
npm run dev:server
npm run dev:client
```

## Simplifications And Tradeoffs

- Population is estimated from aggregated raster cells, not exact raster clipping against a true circle.
- Transit stop types are derived heuristically from source tags:
  - `tram` if the tags indicate tram or light rail
  - `train_metro` if the tags indicate train, subway, station, halt, or platform
  - `bus` if the tags indicate `bus=yes`
- Circle inclusion uses an equirectangular approximation after an initial latitude/longitude bounding-box filter.
- Non-point transit geometries are reduced to simple centroids.
- The importer resolves files from the provided `Project Materials/SWE_Interns_Takehome.zip` bundle and matches members by filename so it can tolerate the top-level folder structure in the assignment archive.

