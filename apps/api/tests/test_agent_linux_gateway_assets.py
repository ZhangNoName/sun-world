"""Actual bounded codec regression, without extracting or running Linux binaries."""

import importlib.util
from pathlib import Path
import unittest

import zstandard

ROOT = Path(__file__).resolve().parents[3]
spec = importlib.util.spec_from_file_location('linux_gateway_assets_test', ROOT / 'scripts/agent-linux-vm-gateway.py')
gateway = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gateway)


class LinuxGatewayAssetTests(unittest.TestCase):
    def test_unknown_size_frame_uses_actual_byte_window_units(self):
        source = b'A' * 131072
        encoded = zstandard.ZstdCompressor(write_content_size=False).compress(source)
        parameters = zstandard.get_frame_parameters(encoded)
        self.assertEqual(parameters.content_size, zstandard.CONTENTSIZE_UNKNOWN)
        self.assertEqual(parameters.window_size, 131072)
        with self.assertRaises(zstandard.ZstdError):
            zstandard.ZstdDecompressor(max_window_size=2048).decompress(encoded, max_output_size=len(source))
        self.assertEqual(gateway.openssl_archive(encoded, lambda raw: raw), source)
        self.assertEqual(zstandard.ZstdDecompressor(max_window_size=131072).decompress(
            encoded, max_output_size=len(source)), source)

    def test_truncation_extra_frames_window_and_actual_output_overflow_rejected(self):
        source = b'BOUNDED_SYNTHETIC_PACKAGE' * 10000
        encoded = zstandard.ZstdCompressor(write_content_size=False).compress(source)
        too_large = zstandard.ZstdCompressor(write_content_size=False).compress(b'A' * (8 * 1024**2 + 1))
        known_large = zstandard.ZstdCompressor().compress(b'A' * (8 * 1024**2 + 1))
        for candidate in (encoded[:-1], encoded + b'trailing', encoded + encoded, too_large, known_large):
            with self.subTest(length=len(candidate)), self.assertRaises(Exception):
                gateway.openssl_archive(candidate, lambda raw: raw)

    def test_contract_json_rejects_duplicate_keys_float_and_nonfinite(self):
        self.assertEqual(gateway.strict_json(b'{"fixed":1}'), {'fixed': 1})
        for candidate in (b'{"fixed":1,"fixed":2}', b'{"fixed":1.0}', b'{"fixed":NaN}'):
            with self.assertRaises(Exception):
                gateway.strict_json(candidate)
