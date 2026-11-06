import { BrandLogo } from "../marketplace/brand-logos";
import { cn } from "../lib/utils";
import type { NodeVariant } from "./node-types";

/**
 * A step's mark. A connected service shows its own logo; Insyte's own actions and AI steps sit dark
 * on `abyss` with a chalk glyph, because they are the product doing the work; a trigger is tinted, as
 * the thing that starts it; logic (wait, split, filter) is a quiet well.
 */
export function StepTile({ variant, size = 20, className }: { variant: NodeVariant; size?: number; className?: string }) {
	if (variant.brand && variant.kind === "action") return <BrandLogo brand={variant.brand} name={variant.category} size={size} className={className} />;
	const Icon = variant.icon;
	const tone =
		variant.kind === "trigger"
			? "bg-signal-green-bg text-signal-green"
			: variant.kind === "action"
				? "bg-abyss text-mesh-ink"
				: "bg-ink/7 text-ink-2";
	return (
		<span
			aria-hidden
			className={cn("inline-flex shrink-0 items-center justify-center", size < 24 ? "rounded-sm" : "rounded-md", tone, className)}
			style={{ width: size, height: size }}
		>
			<Icon style={{ width: Math.round(size * 0.6), height: Math.round(size * 0.6) }} strokeWidth={1.9} />
		</span>
	);
}
