import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.append(str(ROOT / "scripts"))

import import_data  # type: ignore


class ImportDataTests(unittest.TestCase):
    def test_parse_source_tags_parses_stringified_pairs(self):
        tags = import_data.parse_source_tags("[('bus', 'yes'), ('network', 'SamTrans')]")
        self.assertEqual(tags["bus"], "yes")
        self.assertEqual(tags["network"], "SamTrans")

    def test_classify_mode_prefers_tram_for_light_rail(self):
        mode = import_data.classify_mode(
            {"light_rail": "yes", "bus": "yes", "public_transport": "platform"}
        )
        self.assertEqual(mode, "tram")

    def test_classify_mode_maps_station_to_train_metro(self):
        mode = import_data.classify_mode({"subway": "yes", "public_transport": "station"})
        self.assertEqual(mode, "train_metro")

    def test_classify_mode_returns_none_for_ambiguous_rows(self):
        mode = import_data.classify_mode({"network": "SamTrans"})
        self.assertIsNone(mode)

    def test_inverse_mollweide_origin_is_zero_zero(self):
        lat, lon = import_data.inverse_mollweide(0.0, 0.0)
        self.assertAlmostEqual(lat, 0.0, places=6)
        self.assertAlmostEqual(lon, 0.0, places=6)


if __name__ == "__main__":
    unittest.main()
