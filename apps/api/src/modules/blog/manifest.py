from src.core.module_registry import HttpEntry, ModuleManifest, ToolManifest
from src.modules.blog.schemas import (
    BlogReadPublicInput,
    BlogReadPublicOutput,
    BlogSearchPublicInput,
    BlogSearchPublicOutput,
)


BLOG_READ_PUBLIC = "blog.article.read_public"

BLOG_MANIFEST = ModuleManifest(
    id="blog-content",
    version="1",
    owner="blog",
    capabilities=(BLOG_READ_PUBLIC,),
    http_entries=(HttpEntry("GET", "/blogs/"), HttpEntry("GET", "/blogs/{blog_id}")),
    skills=("blog-qa@1", "blog-qa@2"),
    data_owners=("mysql.blog", "mysql.blog_tag", "mongo.blogs"),
    tools=(
        ToolManifest(
            id="blog.search_public",
            version="1",
            module_id="blog-content",
            model_name="blog_search_public",
            capability=BLOG_READ_PUBLIC,
            effect="read",
            data_class="public",
            confirmation="none",
            input_schema_ref="BlogSearchPublicInput",
            output_schema_ref="BlogSearchPublicOutput",
        ),
        ToolManifest(
            id="blog.read_public",
            version="1",
            module_id="blog-content",
            model_name="blog_read_public",
            capability=BLOG_READ_PUBLIC,
            effect="read",
            data_class="public",
            confirmation="none",
            input_schema_ref="BlogReadPublicInput",
            output_schema_ref="BlogReadPublicOutput",
        ),
    ),
)

BLOG_SCHEMAS = {
    schema.__name__: schema
    for schema in (
        BlogSearchPublicInput,
        BlogSearchPublicOutput,
        BlogReadPublicInput,
        BlogReadPublicOutput,
    )
}
