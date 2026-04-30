# Project Context And Running Notes

This file is a living handoff document for the Mariana Minerals take-home. It captures what has been built, why certain choices were made, what has been verified, and what is still left to do.

## Current Architecture

- Frontend: React + TypeScript + Vite
- Map: Leaflet
- Backend: minimal TypeScript HTTP server
- Database: local SQLite
- Importer: Python script that reads the provided zip, parses the transit GeoJSON, and aggregates the population GeoTIFF into queryable cells

## Source Material Reality Check

- The provided assignment bundle in this workspace is `Project Materials/SWE_Interns_Takehome.zip`.
- The original importer was pointing at a different archive name and path layout, which prevented the database from being rebuilt from the real handoff files.
- The importer now resolves the assignment archive from the actual zip in `Project Materials/` and matches inner members by filename rather than assuming one exact top-level folder path.
- The candidate doc confirms the same priorities as the PRD: a working local prototype, explainable preprocessing, pragmatic approximations, and clear run instructions matter more than perfect GIS precision.

## Key Decisions

- Keep the backend local and simple
- Query SQLite through the local `sqlite3` CLI instead of a native Node dependency
- Use heuristic transit mode classification
- Aggregate population raster cells into larger blocks for speed
- Use pragmatic bounding-box + approximate distance math for circle queries
- Standardize the importer on a project-local Python virtualenv so the rebuild path is reproducible

## Recovery Note

The SSD copy initially lost most source files during transfer. This workspace has been reconstructed and should be treated as the active copy going forward.

## Environment Notes

- `npm install` has already been run in this workspace.
- The importer now expects a local `.venv` with:
  - `numpy==2.3.4`
  - `tifffile==2026.4.11`
  - `imagecodecs==2026.3.6`
- `package.json` scripts now use `./.venv/bin/python` for `npm run import-data` and `npm run test:python`.
- Vite and the API server are pinned to `127.0.0.1` instead of wildcard / IPv6 binding because this environment rejected `::1` and `0.0.0.0` listens.

## Verified Status

- `npm run check` passes.
- `npm run build` passes.
- `npm run test:python` passes.
- `npm run test:ts` passes.
- `npm test` passes.
- `npm run import-data` now succeeds against the real assignment zip.
- The rebuilt database currently contains:
  - `47,073` aggregated population cells
  - `37,526` classified transit stops
  - mode counts: `35,360` bus, `1,380` tram, `786` train/metro
- API sanity checks succeeded:
  - `GET /api/health` returns `{"ok":true,"dbExists":true}`
  - `GET /api/summary?lat=37.7749&lon=-122.4194&radiusKm=5` returns plausible values
  - Increasing the radius to `10` km increases population and stop counts as expected
- Browser verification against the running app succeeded for:
  - initial render
  - default 5 km state
  - map click updating the selected point
  - results panel refreshing with new stop counts after a map click
- The frontend now also includes:
  - shareable URL state for primary point, radius, and compare mode
  - compare mode with primary vs compare point summaries
  - skeleton loading treatments in metric cards
  - downloadable PDF reports for single-point and compare mode
  - a copy-link action beside the report export
  - human-friendly area labels inferred from the nearest named transit stop in the provided local dataset

## Automated Test Coverage

- Python tests cover:
  - importer helper behavior
  - database existence and table population
  - expected transit modes present in the rebuilt database
- TypeScript tests cover:
  - `querySummary` returning plausible counts from the real SQLite database
  - radius growth increasing returned counts at the same point
  - a lower-density point returning smaller counts than downtown San Francisco
  - frontend initial fetch and rendering of returned metrics
  - frontend slider-driven refetch behavior
  - frontend map-click-driven refetch behavior
  - frontend URL hydration for point, radius, and compare state
  - invalid compare URL state falling back to single-point mode
  - frontend compare-mode fetch behavior and delta rendering
  - frontend PDF download behavior
  - frontend copy-link behavior
  - frontend error state when the summary request fails

## Known Gaps

- TypeScript-only validation still works through direct `tsc`, but `vitest` / Vite-based commands can fail inside the Codex shell on this external drive because Rollup's native module trips a macOS code-signature / optional-dependency issue. The user's local terminal remains the source of truth for full `npm test` / `npm run build` verification.
- The in-app browser automation could not conclusively validate the native slider end to end, but the slider state transition is now covered in a frontend test and still merits one quick manual browser smoke test before submission.
- There is no dedicated automated API test yet for `/api/summary`; only manual curl checks and browser validation have been done.

## Immediate Next Steps

- Do one final manual browser sanity check of:
  - shareable URL updates while moving the slider or clicking the map
  - compare mode placement and compare result refresh
  - PDF report download behavior in both single and compare mode
  - copy-link behavior
  - nearest-stop area labeling quality on a few representative map clicks
- Decide whether to keep the built SQLite file in the submission or exclude it and rely on the documented importer path.
- Do a final README pass focused on the reviewer journey:
  - install deps
  - create `.venv`
  - import data
  - run app
  - understand approximations and tradeoffs
