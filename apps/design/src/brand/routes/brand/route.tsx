import { BrandBook } from "@insyte/ui/brand/book/shell"
import { createFileRoute } from "@tanstack/react-router"

/**
 * `/brand`: the brand book. The layout draws the whole book — bar, menu, chapter, transitions —
 * from the chapter registry in `@insyte/ui/brand/book`, keyed by the param below rather than by an
 * outlet, so a leaving chapter stays what it was while it animates out.
 */
export const Route = createFileRoute("/brand")({ component: BrandBook })
