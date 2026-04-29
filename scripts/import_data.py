import ast
import json
import math
import sqlite3
import tempfile
import zipfile
from io import BytesIO
from pathlib import Path
from typing import Iterable

ROOT = Path(__file__).resolve().parents[1]
PROJECT_MATERIALS = ROOT / "Project Materials"
SOURCE_ARCHIVE_CANDIDATES = [
    PROJECT_MATERIALS / "SWE_Interns_Takehome.zip",
    PROJECT_MATERIALS / "project-materials-MarianaMinerals.zip",
]
DATA_DIR = ROOT / "data"
DB_PATH = DATA_DIR / "mariana_minerals.sqlite"
POPULATION_INNER_ZIP_NAME = "GHS_POP_E2030_GLOBE_R2023A_54009_100_V1_0_R5_C8.zip"
STOPS_FILE_NAME = "sf_transit_stops.geojson"
BLOCK_SIZE = 20
EARTH_RADIUS = 6378137.0


def ensure_dirs() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)


def resolve_source_archive() -> Path:
    for candidate in SOURCE_ARCHIVE_CANDIDATES:
        if candidate.exists():
            return candidate
    searched = ", ".join(str(path) for path in SOURCE_ARCHIVE_CANDIDATES)
    raise FileNotFoundError(f"Could not find assignment archive. Searched: {searched}")


def find_member_name(archive: zipfile.ZipFile, file_name: str) -> str:
    for member_name in archive.namelist():
        if member_name.endswith(file_name):
            return member_name
    raise FileNotFoundError(f"Could not find `{file_name}` inside `{archive.filename}`.")


def normalize_name(raw_name: object) -> str | None:
    if raw_name is None:
        return None
    if isinstance(raw_name, str):
        try:
            raw_name = ast.literal_eval(raw_name)
        except Exception:
            return raw_name
    if isinstance(raw_name, dict):
        primary = raw_name.get("primary")
        return primary if isinstance(primary, str) and primary else None
    return None


def parse_source_tags(raw_tags: object) -> dict[str, str]:
    if raw_tags is None:
        return {}
    if isinstance(raw_tags, str):
        try:
            raw_tags = ast.literal_eval(raw_tags)
        except Exception:
            return {}
    tags: dict[str, str] = {}
    if isinstance(raw_tags, (list, tuple)):
        for item in raw_tags:
            if isinstance(item, (list, tuple)) and len(item) == 2:
                key, value = item
                tags[str(key)] = str(value)
    return tags


def flatten_coordinates(coordinates: object) -> Iterable[tuple[float, float]]:
    if (
        isinstance(coordinates, (list, tuple))
        and len(coordinates) >= 2
        and all(isinstance(value, (int, float)) for value in coordinates[:2])
    ):
        yield (float(coordinates[0]), float(coordinates[1]))
        return

    if isinstance(coordinates, (list, tuple)):
        for item in coordinates:
            yield from flatten_coordinates(item)


def derive_centroid(feature: dict) -> tuple[float, float] | None:
    geometry = feature.get("geometry") or {}
    coordinates = list(flatten_coordinates(geometry.get("coordinates")))
    if not coordinates:
        return None
    lon = sum(point[0] for point in coordinates) / len(coordinates)
    lat = sum(point[1] for point in coordinates) / len(coordinates)
    return (lat, lon)


def classify_mode(tags: dict[str, str]) -> str | None:
    railway = tags.get("railway")
    if (
        tags.get("tram") == "yes"
        or tags.get("light_rail") == "yes"
        or tags.get("station") == "light_rail"
        or railway == "tram_stop"
    ):
        return "tram"
    if (
        tags.get("subway") == "yes"
        or tags.get("train") == "yes"
        or railway in {"station", "halt", "stop", "platform"}
        or tags.get("public_transport") == "station"
    ):
        return "train_metro"
    if tags.get("bus") == "yes":
        return "bus"
    return None


def inverse_mollweide(x: float, y: float) -> tuple[float, float]:
    theta = math.asin(max(-1.0, min(1.0, y / (math.sqrt(2) * EARTH_RADIUS))))
    latitude = math.asin(
        max(-1.0, min(1.0, (2 * theta + math.sin(2 * theta)) / math.pi))
    )
    cos_theta = math.cos(theta)
    if abs(cos_theta) < 1e-12:
        longitude = 0.0
    else:
        longitude = (math.pi * x) / (2 * math.sqrt(2) * EARTH_RADIUS * cos_theta)
    return (math.degrees(latitude), math.degrees(longitude))


def create_schema(connection: sqlite3.Connection) -> None:
    connection.executescript(
        """
        DROP TABLE IF EXISTS population_cells;
        DROP TABLE IF EXISTS transit_stops;

        CREATE TABLE population_cells (
          cell_id INTEGER PRIMARY KEY,
          lat REAL NOT NULL,
          lon REAL NOT NULL,
          population REAL NOT NULL,
          approx_area_m2 REAL NOT NULL
        );

        CREATE TABLE transit_stops (
          stop_id TEXT PRIMARY KEY,
          lat REAL NOT NULL,
          lon REAL NOT NULL,
          mode TEXT NOT NULL,
          raw_name TEXT,
          raw_tags TEXT NOT NULL
        );

        CREATE INDEX idx_population_cells_lat_lon ON population_cells(lat, lon);
        CREATE INDEX idx_transit_stops_lat_lon ON transit_stops(lat, lon);
        CREATE INDEX idx_transit_stops_mode ON transit_stops(mode);
        """
    )


def import_transit_stops(connection: sqlite3.Connection) -> None:
    source_archive = resolve_source_archive()
    with zipfile.ZipFile(source_archive) as archive:
        stops_path = find_member_name(archive, STOPS_FILE_NAME)
        payload = json.loads(archive.read(stops_path))

    rows: list[tuple[str, float, float, str, str | None, str]] = []
    skipped = 0
    for index, feature in enumerate(payload.get("features", [])):
        tags = parse_source_tags((feature.get("properties") or {}).get("source_tags"))
        mode = classify_mode(tags)
        centroid = derive_centroid(feature)
        if not mode or centroid is None:
            skipped += 1
            continue

        stop_id = str((feature.get("properties") or {}).get("id") or f"stop-{index}")
        name = normalize_name((feature.get("properties") or {}).get("names"))
        lat, lon = centroid
        rows.append((stop_id, lat, lon, mode, name, json.dumps(tags, sort_keys=True)))

    connection.executemany(
        """
        INSERT INTO transit_stops (stop_id, lat, lon, mode, raw_name, raw_tags)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        rows,
    )
    print(f"Imported {len(rows)} transit stops. Skipped {skipped} ambiguous rows.")


def import_population(connection: sqlite3.Connection) -> None:
    import numpy as np
    from tifffile import TiffFile

    source_archive = resolve_source_archive()
    with zipfile.ZipFile(source_archive) as archive:
        population_zip_path = find_member_name(archive, POPULATION_INNER_ZIP_NAME)
        inner_zip_bytes = archive.read(population_zip_path)

    with tempfile.TemporaryDirectory() as temp_dir:
        temp_path = Path(temp_dir)
        with zipfile.ZipFile(BytesIO(inner_zip_bytes)) as inner_zip:
            tif_member = next(name for name in inner_zip.namelist() if name.endswith(".tif"))
            tif_path = temp_path / "population.tif"
            tif_path.write_bytes(inner_zip.read(tif_member))

        with TiffFile(tif_path) as tif:
            page = tif.pages[0]
            data = page.asarray()
            scale_x, scale_y, _ = page.tags["ModelPixelScaleTag"].value
            _, _, _, tie_x, tie_y, _ = page.tags["ModelTiepointTag"].value

    if data.shape[0] % BLOCK_SIZE != 0 or data.shape[1] % BLOCK_SIZE != 0:
        raise ValueError("Population raster dimensions must be divisible by BLOCK_SIZE.")

    population = np.nan_to_num(data, nan=0.0, posinf=0.0, neginf=0.0)
    aggregated = population.reshape(
        data.shape[0] // BLOCK_SIZE,
        BLOCK_SIZE,
        data.shape[1] // BLOCK_SIZE,
        BLOCK_SIZE,
    ).sum(axis=(1, 3))

    rows: list[tuple[int, float, float, float, float]] = []
    approx_area = float((scale_x * BLOCK_SIZE) * (scale_y * BLOCK_SIZE))
    cell_id = 1

    for block_row in range(aggregated.shape[0]):
        for block_col in range(aggregated.shape[1]):
            total_population = float(aggregated[block_row, block_col])
            if total_population <= 0:
                continue

            center_row = block_row * BLOCK_SIZE + (BLOCK_SIZE / 2)
            center_col = block_col * BLOCK_SIZE + (BLOCK_SIZE / 2)
            x = tie_x + center_col * scale_x
            y = tie_y - center_row * scale_y
            lat, lon = inverse_mollweide(x, y)
            rows.append((cell_id, lat, lon, total_population, approx_area))
            cell_id += 1

    connection.executemany(
        """
        INSERT INTO population_cells (cell_id, lat, lon, population, approx_area_m2)
        VALUES (?, ?, ?, ?, ?)
        """,
        rows,
    )
    print(f"Imported {len(rows)} aggregated population cells.")


def main() -> None:
    ensure_dirs()
    if DB_PATH.exists():
        DB_PATH.unlink()

    connection = sqlite3.connect(DB_PATH)
    try:
        create_schema(connection)
        import_transit_stops(connection)
        import_population(connection)
        connection.commit()
    finally:
        connection.close()

    print(f"SQLite database created at {DB_PATH}")


if __name__ == "__main__":
    main()
