import { createFileRoute } from "@tanstack/react-router";
import { type ArticleSearch, ArticlePage } from "@insyte/ui/app/ai/article-screen";

export const Route = createFileRoute("/_admin/settings/ai/knowledge/$articleId")({
	validateSearch: (s: Record<string, unknown>): ArticleSearch => ({ gap: typeof s.gap === "string" ? s.gap : undefined }),
	component: ArticlePage,
});
