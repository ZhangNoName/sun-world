import json
import shutil
import subprocess
import sys
import unittest
from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import ValidationError


API_ROOT = Path(__file__).resolve().parents[1]
REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
if str(API_ROOT) not in sys.path:
    sys.path.insert(0, str(API_ROOT))


class IntegrationCatalogTests(unittest.TestCase):
    def setUp(self):
        from src.modules.integrations.router import router

        application = FastAPI()
        application.include_router(router)
        self.client = TestClient(application)

    def test_lists_reviewed_cli_connectors_without_runtime_secrets(self):
        response = self.client.get("/integrations/v1/connectors")

        self.assertEqual(response.status_code, 200)
        connectors = response.json()["data"]
        self.assertEqual([item["adapter_id"] for item in connectors], ["feishu", "zhihu"])
        self.assertEqual(connectors[0]["execution"], "local_cli")
        self.assertNotIn("binary_path", response.text)
        self.assertNotIn("credential", response.text)

    def test_returns_one_connector_or_a_stable_not_found_error(self):
        found = self.client.get("/integrations/v1/connectors/zhihu")
        self.assertEqual(found.status_code, 200)
        self.assertEqual(found.json()["data"]["transport"], "cli")

        missing = self.client.get("/integrations/v1/connectors/missing")
        self.assertEqual(missing.status_code, 404)
        self.assertEqual(
            missing.json()["detail"]["code"],
            "INTEGRATION_CONNECTOR_NOT_FOUND",
        )

    def test_rejects_duplicate_adapter_and_capability_identifiers(self):
        from src.modules.integrations.registry import IntegrationRegistry
        from src.modules.integrations.schemas import (
            IntegrationCapability,
            IntegrationConnector,
        )

        capability = IntegrationCapability(
            id="data.read",
            description="Read data.",
            effect="read",
            confirmation="never",
        )
        connector = IntegrationConnector(
            adapter_id="example",
            display_name="Example",
            transport="cli",
            execution="local_cli",
            official_source="https://example.com/cli",
            capabilities=[capability],
        )
        with self.assertRaises(ValueError):
            IntegrationRegistry([connector, connector])
        with self.assertRaises(ValidationError):
            IntegrationConnector(
                adapter_id="duplicate",
                display_name="Duplicate",
                transport="cli",
                execution="local_cli",
                official_source="https://example.com/cli",
                capabilities=[capability, capability],
            )

    def test_cli_public_projection_matches_the_api_reviewed_catalog(self):
        from src.modules.integrations.registry import IntegrationRegistry

        node = shutil.which("node")
        self.assertIsNotNone(node, "Node.js is required for catalog parity checks")
        script = """
import { listIntegrationConnectors } from './packages/cli/src/integrations/manifests.mjs'
process.stdout.write(JSON.stringify(listIntegrationConnectors()))
"""
        completed = subprocess.run(
            [node, "--input-type=module", "--eval", script],
            cwd=REPOSITORY_ROOT,
            check=True,
            capture_output=True,
            text=True,
            timeout=10,
        )
        cli_connectors = json.loads(completed.stdout)
        api_connectors = [
            connector.model_dump(mode="json")
            for connector in IntegrationRegistry().list_connectors()
        ]

        self.assertEqual(cli_connectors, api_connectors)


if __name__ == "__main__":
    unittest.main()
