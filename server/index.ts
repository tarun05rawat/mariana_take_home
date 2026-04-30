import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { computeQueryWindow } from "./queryMath";

const execFileAsync = promisify(execFile);
const PORT = 8787;
const HOST = "127.0.0.1";
export const DB_PATH = resolve(process.cwd(), "data", "mariana_minerals.sqlite");

type SummaryRow = {
  estimatedPopulation: number | string;
  busStops: number | string;
  tramStops: number | string;
  trainMetroStops: number | string;
};

type LocationNameRow = {
  raw_name: string | null;
};

function cleanLocationName(rawName: string | null) {
  if (!rawName) {
    return null;
  }

  const trimmed = rawName.trim();
  if (!trimmed) {
    return null;
  }

  if (!trimmed.startsWith("{")) {
    return trimmed;
  }

  const primaryMatch = trimmed.match(/'primary':\s*'([^']+)'/);
  if (primaryMatch?.[1]) {
    return primaryMatch[1].trim();
  }

  const valueMatch = trimmed.match(/'value':\s*'([^']+)'/);
  if (valueMatch?.[1]) {
    return valueMatch[1].trim();
  }

  return null;
}

function sendJson(
  response: import("node:http").ServerResponse,
  statusCode: number,
  payload: unknown,
) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  });
  response.end(JSON.stringify(payload));
}

function toFiniteNumber(input: string | null, fallback?: number) {
  if (input === null) {
    return fallback;
  }

  const value = Number(input);
  return Number.isFinite(value) ? value : fallback;
}

function formatNumber(value: number) {
  return value.toFixed(6);
}

export async function querySummary(lat: number, lon: number, radiusKm: number) {
  const { latDelta, lonDelta, lonScale, radiusSquaredKm } = computeQueryWindow(
    lat,
    radiusKm,
  );

  const sql = `
    SELECT
      ROUND(COALESCE((
        SELECT SUM(population)
        FROM population_cells
        WHERE lat BETWEEN ${formatNumber(lat - latDelta)} AND ${formatNumber(lat + latDelta)}
          AND lon BETWEEN ${formatNumber(lon - lonDelta)} AND ${formatNumber(lon + lonDelta)}
          AND (
            ((lat - ${formatNumber(lat)}) * 111.32) * ((lat - ${formatNumber(lat)}) * 111.32) +
            ((lon - ${formatNumber(lon)}) * ${formatNumber(lonScale)}) * ((lon - ${formatNumber(lon)}) * ${formatNumber(lonScale)})
          ) <= ${formatNumber(radiusSquaredKm)}
      ), 0), 0) AS estimatedPopulation,
      (
        SELECT COUNT(*)
        FROM transit_stops
        WHERE mode = 'bus'
          AND lat BETWEEN ${formatNumber(lat - latDelta)} AND ${formatNumber(lat + latDelta)}
          AND lon BETWEEN ${formatNumber(lon - lonDelta)} AND ${formatNumber(lon + lonDelta)}
          AND (
            ((lat - ${formatNumber(lat)}) * 111.32) * ((lat - ${formatNumber(lat)}) * 111.32) +
            ((lon - ${formatNumber(lon)}) * ${formatNumber(lonScale)}) * ((lon - ${formatNumber(lon)}) * ${formatNumber(lonScale)})
          ) <= ${formatNumber(radiusSquaredKm)}
      ) AS busStops,
      (
        SELECT COUNT(*)
        FROM transit_stops
        WHERE mode = 'tram'
          AND lat BETWEEN ${formatNumber(lat - latDelta)} AND ${formatNumber(lat + latDelta)}
          AND lon BETWEEN ${formatNumber(lon - lonDelta)} AND ${formatNumber(lon + lonDelta)}
          AND (
            ((lat - ${formatNumber(lat)}) * 111.32) * ((lat - ${formatNumber(lat)}) * 111.32) +
            ((lon - ${formatNumber(lon)}) * ${formatNumber(lonScale)}) * ((lon - ${formatNumber(lon)}) * ${formatNumber(lonScale)})
          ) <= ${formatNumber(radiusSquaredKm)}
      ) AS tramStops,
      (
        SELECT COUNT(*)
        FROM transit_stops
        WHERE mode = 'train_metro'
          AND lat BETWEEN ${formatNumber(lat - latDelta)} AND ${formatNumber(lat + latDelta)}
          AND lon BETWEEN ${formatNumber(lon - lonDelta)} AND ${formatNumber(lon + lonDelta)}
          AND (
            ((lat - ${formatNumber(lat)}) * 111.32) * ((lat - ${formatNumber(lat)}) * 111.32) +
            ((lon - ${formatNumber(lon)}) * ${formatNumber(lonScale)}) * ((lon - ${formatNumber(lon)}) * ${formatNumber(lonScale)})
          ) <= ${formatNumber(radiusSquaredKm)}
      ) AS trainMetroStops;
  `;

  const { stdout } = await execFileAsync("sqlite3", ["-json", DB_PATH, sql]);
  const rows = JSON.parse(stdout) as SummaryRow[];
  const row = rows[0];

  return {
    estimatedPopulation: Number(row?.estimatedPopulation ?? 0),
    busStops: Number(row?.busStops ?? 0),
    tramStops: Number(row?.tramStops ?? 0),
    trainMetroStops: Number(row?.trainMetroStops ?? 0),
  };
}

export async function queryLocationName(lat: number, lon: number) {
  const searchRadiusKm = 3;
  const { latDelta, lonDelta, lonScale, radiusSquaredKm } = computeQueryWindow(
    lat,
    searchRadiusKm,
  );

  const sql = `
    SELECT raw_name
    FROM transit_stops
    WHERE raw_name IS NOT NULL
      AND TRIM(raw_name) != ''
      AND lat BETWEEN ${formatNumber(lat - latDelta)} AND ${formatNumber(lat + latDelta)}
      AND lon BETWEEN ${formatNumber(lon - lonDelta)} AND ${formatNumber(lon + lonDelta)}
      AND (
        ((lat - ${formatNumber(lat)}) * 111.32) * ((lat - ${formatNumber(lat)}) * 111.32) +
        ((lon - ${formatNumber(lon)}) * ${formatNumber(lonScale)}) * ((lon - ${formatNumber(lon)}) * ${formatNumber(lonScale)})
      ) <= ${formatNumber(radiusSquaredKm)}
    ORDER BY (
      ((lat - ${formatNumber(lat)}) * 111.32) * ((lat - ${formatNumber(lat)}) * 111.32) +
      ((lon - ${formatNumber(lon)}) * ${formatNumber(lonScale)}) * ((lon - ${formatNumber(lon)}) * ${formatNumber(lonScale)})
    ) ASC
    LIMIT 1;
  `;

  const { stdout } = await execFileAsync("sqlite3", ["-json", DB_PATH, sql]);
  const rows = JSON.parse(stdout || "[]") as LocationNameRow[];
  const rawName = cleanLocationName(rows[0]?.raw_name ?? null);

  if (rawName) {
    return {
      locationName: `Near ${rawName}`,
      locationNameSource: "nearest_stop" as const,
    };
  }

  return {
    locationName: "Selected area",
    locationNameSource: "fallback" as const,
  };
}

export async function requestListener(
  request: IncomingMessage,
  response: ServerResponse<IncomingMessage>,
) {
  if (!request.url) {
    sendJson(response, 400, { error: "Missing request URL." });
    return;
  }

  const url = new URL(request.url, `http://localhost:${PORT}`);

  if (request.method === "OPTIONS") {
    response.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    response.end();
    return;
  }

  if (url.pathname === "/api/health") {
    sendJson(response, 200, {
      ok: true,
      dbExists: existsSync(DB_PATH),
    });
    return;
  }

  if (url.pathname !== "/api/summary" || request.method !== "GET") {
    sendJson(response, 404, { error: "Not found." });
    return;
  }

  if (!existsSync(DB_PATH)) {
    sendJson(response, 503, {
      error: "Database not found. Run `npm run import-data` first.",
    });
    return;
  }

  const lat = toFiniteNumber(url.searchParams.get("lat"));
  const lon = toFiniteNumber(url.searchParams.get("lon"));
  const radiusKm = toFiniteNumber(url.searchParams.get("radiusKm"), 5);

  if (
    lat === undefined ||
    lon === undefined ||
    radiusKm === undefined ||
    radiusKm < 0.1
  ) {
    sendJson(response, 400, {
      error: "Invalid `lat`, `lon`, or `radiusKm` query parameter.",
    });
    return;
  }

  try {
    const [payload, labelPayload] = await Promise.all([
      querySummary(lat, lon, radiusKm),
      queryLocationName(lat, lon),
    ]);
    sendJson(response, 200, {
      ...payload,
      ...labelPayload,
    });
  } catch (error) {
    sendJson(response, 500, {
      error: error instanceof Error ? error.message : "Unexpected server error.",
    });
  }
}

export function createApiServer() {
  return createServer(requestListener);
}

if (import.meta.url === new URL(process.argv[1], "file://").href) {
  const server = createApiServer();
  server.listen(PORT, HOST, () => {
    console.log(`API server listening on http://${HOST}:${PORT}`);
  });
}
