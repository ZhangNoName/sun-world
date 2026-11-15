import importlib.util
import sys
import unittest
from dataclasses import replace
from pathlib import Path

from pydantic import ValidationError


API_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(API_ROOT))

from src.core.module_registry import HttpEntry, ModuleDependency, ModuleManifest, ModuleRegistry
from src.modules.blog.manifest import BLOG_MANIFEST, BLOG_SCHEMAS
from src.modules.blog.schemas import BlogReadPublicInput, BlogSearchPublicInput


class ModuleRegistryTests(unittest.TestCase):
    def registry(self, *modules, schemas=None):
        return ModuleRegistry(modules or (BLOG_MANIFEST,), BLOG_SCHEMAS if schemas is None else schemas)

    def test_explicit_business_and_model_names_map_both_ways(self):
        registry = self.registry()
        self.assertEqual(set(registry.tools), {"blog.search_public", "blog.read_public"})
        for tool in registry.tools.values():
            self.assertEqual(registry.model_names[tool.model_name], tool.id)
        self.assertEqual(registry.capabilities, {"blog.article.read_public"})

    def test_duplicate_modules_and_capabilities_fail(self):
        with self.assertRaisesRegex(ValueError, "duplicate module"):
            self.registry(BLOG_MANIFEST, BLOG_MANIFEST)
        with self.assertRaisesRegex(ValueError, "capability"):
            self.registry(BLOG_MANIFEST, ModuleManifest(
                id="other", version="1", owner="other", capabilities=BLOG_MANIFEST.capabilities,
            ))
        with self.assertRaisesRegex(ValueError, "capability"):
            self.registry(replace(BLOG_MANIFEST, capabilities=BLOG_MANIFEST.capabilities * 2))

    def test_http_method_is_case_insensitive_for_duplicate_detection(self):
        with self.assertRaisesRegex(ValueError, "HTTP entry"):
            self.registry(BLOG_MANIFEST, ModuleManifest(
                id="other", version="1", owner="other", http_entries=(HttpEntry("get", "/blogs/"),),
            ))
        with self.assertRaisesRegex(ValueError, "HTTP entry"):
            self.registry(BLOG_MANIFEST, ModuleManifest(
                id="other", version="1", owner="other",
                http_entries=(HttpEntry("GET", "/blogs/{article_id}"),),
            ))

    def test_duplicate_tool_id_and_model_name_fail(self):
        first, second = BLOG_MANIFEST.tools
        for duplicate in (replace(second, id=first.id), replace(second, model_name=first.model_name)):
            with self.subTest(tool=duplicate), self.assertRaisesRegex(ValueError, "duplicate"):
                self.registry(replace(BLOG_MANIFEST, tools=(first, duplicate)))

    def test_tool_owner_and_capability_must_belong_to_module(self):
        first = BLOG_MANIFEST.tools[0]
        for invalid in (replace(first, module_id="other"), replace(first, capability="blog.publish")):
            with self.subTest(tool=invalid), self.assertRaises(ValueError):
                self.registry(replace(BLOG_MANIFEST, tools=(invalid,)))

    def test_schema_references_are_not_implicit_or_aliased(self):
        with self.assertRaisesRegex(ValueError, "unknown schema"):
            self.registry(schemas={})
        wrong = dict(BLOG_SCHEMAS, BlogSearchPublicInput=BlogReadPublicInput)
        with self.assertRaisesRegex(ValueError, "name mismatch"):
            self.registry(schemas=wrong)

    def test_dependency_missing_version_mismatch_and_cycle_fail(self):
        other = ModuleManifest(id="other", version="1", owner="other")
        for dependency in (ModuleDependency("missing", "1"), ModuleDependency("other", "2")):
            with self.subTest(dependency=dependency), self.assertRaisesRegex(ValueError, "dependency"):
                self.registry(replace(BLOG_MANIFEST, dependencies=(dependency,)), other)
        with self.assertRaisesRegex(ValueError, "cycle"):
            self.registry(
                replace(BLOG_MANIFEST, dependencies=(ModuleDependency("other", "1"),)),
                replace(other, dependencies=(ModuleDependency("blog-content", "1"),)),
            )

    def test_dependency_exact_version_is_accepted(self):
        other = ModuleManifest(id="other", version="1", owner="other")
        self.registry(replace(BLOG_MANIFEST, dependencies=(ModuleDependency("other", "1"),)), other)

    def test_export_has_no_handlers_or_runtime_credentials(self):
        exported = self.registry().export()
        self.assertEqual(exported["protocol_version"], "1")
        properties = exported["schemas"]["BlogReadPublicInput"]["properties"]
        self.assertEqual(set(properties), {"article_id"})
        self.assertFalse(exported["schemas"]["BlogReadPublicInput"]["additionalProperties"])

    def test_generated_catalog_has_no_drift(self):
        root = API_ROOT.parents[1]
        script = root / "scripts/export-agent-contracts.py"
        spec = importlib.util.spec_from_file_location("export_agent_contracts", script)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        self.assertEqual(
            (root / "packages/contracts/agent/tool-catalog.json").read_text(encoding="utf-8"),
            module.render(),
        )


class BlogToolSchemaTests(unittest.TestCase):
    def test_query_normalizes_before_defaults_and_bounds(self):
        value = BlogSearchPublicInput(query="  test  ")
        self.assertEqual(value.model_dump(), {"query": "test", "limit": 10})
        self.assertEqual(len(BlogSearchPublicInput(query=" " + "x" * 200 + " ").query), 200)

    def test_invalid_search_inputs_and_identity_injection_are_rejected(self):
        for value in (
            {"query": " "}, {"query": "x" * 201}, {"query": 3},
            {"query": "x", "limit": 0}, {"query": "x", "limit": 11},
            {"query": "x", "limit": True}, {"query": "x", "limit": "1"},
            {"query": "x", "owner": 1}, {"query": "x", "api_url": "https://example.invalid"},
        ):
            with self.subTest(value=value), self.assertRaises(ValidationError):
                BlogSearchPublicInput.model_validate(value)

    def test_article_id_requires_strict_positive_integer(self):
        for article_id in (0, -1, True, "1", 1.0):
            with self.subTest(article_id=article_id), self.assertRaises(ValidationError):
                BlogReadPublicInput(article_id=article_id)
        self.assertEqual(BlogReadPublicInput(article_id=1).article_id, 1)
        with self.assertRaises(ValidationError):
            BlogReadPublicInput(article_id=1, user_id=1)


if __name__ == "__main__":
    unittest.main()
