import sqlite3
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DB_PATH = ROOT / "data" / "mariana_minerals.sqlite"


class DatabaseSmokeTests(unittest.TestCase):
    def test_database_file_exists(self):
        self.assertTrue(DB_PATH.exists(), f"Expected database at {DB_PATH}")

    def test_expected_tables_have_rows(self):
        connection = sqlite3.connect(DB_PATH)
        try:
            population_count = connection.execute(
                "SELECT COUNT(*) FROM population_cells"
            ).fetchone()[0]
            stop_count = connection.execute(
                "SELECT COUNT(*) FROM transit_stops"
            ).fetchone()[0]
        finally:
            connection.close()

        self.assertGreater(population_count, 0)
        self.assertGreater(stop_count, 0)

    def test_expected_modes_exist(self):
        connection = sqlite3.connect(DB_PATH)
        try:
            modes = {
                row[0]
                for row in connection.execute(
                    "SELECT DISTINCT mode FROM transit_stops ORDER BY mode"
                ).fetchall()
            }
        finally:
            connection.close()

        self.assertTrue({"bus", "tram", "train_metro"}.issubset(modes))


if __name__ == "__main__":
    unittest.main()
