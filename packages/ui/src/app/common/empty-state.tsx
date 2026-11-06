import { EmptyIcon, type EmptyKind } from "./empty-icon";
import { cn } from "../lib/utils";

/**
 * What a screen shows when it has nothing to show.
 *
 * It takes a `kind` rather than an icon now: the seven screens were each choosing a Lucide glyph
 * for their own record and dropping it in a grey disc, which meant seven empty states that looked
 * like seven different products. The drawing belongs to the kind, so the kind is what a caller
 * names. See `empty-icon.tsx` for the grammar.
 */
export function EmptyState({
	kind,
	title,
	body,
	action,
	secondary,
	compact = false,
	className,
}: {
	kind: EmptyKind;
	title: string;
	body: string;
	action?: { label: string; onClick: () => void };
	secondary?: { label: string; onClick: () => void };
	/** Inside a panel rather than in place of a screen: smaller mark, less air, left-aligned. */
	compact?: boolean;
	className?: string;
}) {
	return (
		<div
			className={cn(
				"flex flex-col",
				compact
					? "items-start gap-2 rounded-lg bg-mist px-4 py-4"
					: "items-center justify-center gap-3 px-6 py-14 text-center",
				className,
			)}
		>
			<EmptyIcon kind={kind} size={compact ? 48 : 72} />
			<div className="flex flex-col gap-1">
				<h2 className="font-medium text-ink text-md">{title}</h2>
				<p
					className={cn(
						"text-ink-3 leading-[1.6]",
						compact ? "max-w-[46ch] text-sm" : "max-w-[420px] text-base",
					)}
				>
					{body}
				</p>
			</div>
			{action || secondary ? (
				<div className="mt-1 flex items-center gap-2">
					{action ? (
						<button
							type="button"
							onClick={action.onClick}
							className="flex h-8 items-center justify-center rounded-md bg-abyss px-3 font-medium text-mesh-ink text-xs shadow-primary transition hover:bg-abyss-2 active:scale-[0.98]"
						>
							{action.label}
						</button>
					) : null}
					{secondary ? (
						<button
							type="button"
							onClick={secondary.onClick}
							className="flex h-8 items-center justify-center rounded-md bg-arc-tint px-3 font-medium text-arc-ink text-xs transition-colors hover:bg-arc-soft/50"
						>
							{secondary.label}
						</button>
					) : null}
				</div>
			) : null}
		</div>
	);
}
