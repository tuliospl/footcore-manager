import struct
import unittest
import zlib
from pathlib import Path

from convert_m26 import ROOT, country_list, decode_team
from java_stream import JavaStream


class M26Test(unittest.TestCase):
    def test_known_source_file(self):
        folder = ROOT / "leia-me-times-csv"
        file = folder / "MKFP 02-09-26/BRA_flamengo.m26"
        team = decode_team(file.read_bytes(), file.name, country_list(folder / "leia-me-times-csv.txt"))
        self.assertEqual(team["name"], "Flamengo")
        self.assertEqual(team["players"], 30)
        self.assertIn("Agustín Rossi;G;ARG;N;31;D;S;Rbo;Fri;0", team["csv"])
        self.assertIn("Pedro;A;BRA;S;29;D;S;Fin;Fri;6", team["csv"])
        self.assertEqual(team["badge"][:8], b"\x89PNG\r\n\x1a\n")
        # Verify CRCs, dimensions and decompressed RGBA row lengths.
        png, offset, image_data = team["badge"], 8, b""
        while offset < len(png):
            size = struct.unpack(">I", png[offset:offset + 4])[0]
            kind, data = png[offset + 4:offset + 8], png[offset + 8:offset + 8 + size]
            crc = struct.unpack(">I", png[offset + 8 + size:offset + 12 + size])[0]
            self.assertEqual(crc, zlib.crc32(kind + data) & 0xffffffff)
            if kind == b"IHDR": self.assertEqual(struct.unpack(">II", data[:8]), (60, 60))
            if kind == b"IDAT": image_data += data
            offset += size + 12
        self.assertEqual(len(zlib.decompress(image_data)), 60 * (60 * 4 + 1))

    def test_bad_streams_fail_without_loading_classes(self):
        for data in [b"not java", b"\xac\xed\x00\x05\x71\x00\x7e\x00\x00", b"\xac\xed\x00\x05\x74\x00\x10a", b"\xac\xed\x00\x05\x7b"]:
            with self.assertRaises(ValueError): JavaStream(data).root()


if __name__ == "__main__":
    unittest.main()
