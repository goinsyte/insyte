import { cn } from "../lib/utils";

/**
 * "Binnenkort": what is designed but not built (PRODUCT.md, ADR-0027 — MCP, the agent on more
 * channels). A dashed outline in `ink-3`, the marketing site's coming-soon chip drawn for the
 * console: it is a label, never a button, and nothing beside it pretends to work.
 */
export function SoonChip({ className, label = "Binnenkort", dark = false }: { className?: string; label?: string; dark?: boolean }) {
	return (
		<span className={cn("inline-flex h-5 w-fit shrink-0 items-center rounded-full border border-dashed px-2 font-normal text-xs", dark ? "border-mesh-ink/35 text-mesh-ink-2" : "border-ink/25 text-ink-3", className)}>
			{label}
		</span>
	);
}
