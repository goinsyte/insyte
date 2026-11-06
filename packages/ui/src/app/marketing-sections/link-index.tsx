import { ArrowRight, ArrowUpRight } from "../../icons";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { cn } from "../lib/utils";

/**
 * Where a closing section sends the operator: a page in the console, a page on goinsyte.com (always
 * a new tab, marked with the up-right arrow), or something on this page, such as a dialog.
 */
export type Destination = { to: string; search?: Record<string, unknown> } | { href: string } | { onClick: () => void };

/**
 * One element for all three, so a row or a call to action is the whole target whatever it opens.
 * `group/dest` is what the travelling arrow listens to.
 */
export function DestinationLink({ dest, className, children, label }: { dest: Destination; className?: string; children: ReactNode; label?: string }) {
	const cls = cn("group/dest", className);
	if ("onClick" in dest)
		return (
			<button type="button" onClick={dest.onClick} className={cn("cursor-pointer text-left", cls)} aria-label={label}>
				{children}
			</button>
		);
	if ("href" in dest)
		return (
			<a href={dest.href} target="_blank" rel="noreferrer" className={cls} aria-label={label ? `${label} (opent in een nieuw tabblad)` : undefined}>
				{children}
			</a>
		);
	return (
		<Link to={dest.to} search={dest.search as never} className={cls} aria-label={label}>
			{children}
		</Link>
	);
}

/**
 * The arrow that travels: on hover or focus of its destination it leaves to the right and a second
 * one arrives from the left into its place, the way a site's index row answers a pointer. An external
 * destination's arrow leaves up and to the right instead. Under reduced motion the stylesheet takes
 * the transition to 1ms, and since both arrows end where the first one started, nothing visibly moves.
 */
export function TravelArrow({ external = false, className }: { external?: boolean; className?: string }) {
	const Icon = external ? ArrowUpRight : ArrowRight;
	const move = "transition-transform duration-base ease-out-expo";
	return (
		<span aria-hidden className={cn("relative inline-flex shrink-0 overflow-hidden", className)}>
			<Icon
				className={cn(
					"size-full",
					move,
					external
						? "group-hover/dest:translate-x-[120%] group-hover/dest:-translate-y-[120%] group-focus-visible/dest:translate-x-[120%] group-focus-visible/dest:-translate-y-[120%]"
						: "group-hover/dest:translate-x-[120%] group-focus-visible/dest:translate-x-[120%]",
				)}
				strokeWidth={1.75}
			/>
			<Icon
				className={cn(
					"absolute inset-0 size-full",
					move,
					external
						? "-translate-x-[120%] translate-y-[120%] group-hover/dest:translate-x-0 group-hover/dest:translate-y-0 group-focus-visible/dest:translate-x-0 group-focus-visible/dest:translate-y-0"
						: "-translate-x-[120%] group-hover/dest:translate-x-0 group-focus-visible/dest:translate-x-0",
				)}
				strokeWidth={1.75}
			/>
		</span>
	);
}

export type IndexItem = Destination & { id: string; label: string; body: string };

const SIZE = {
	/* Under a list: a step quieter than the table it follows. */
	md: { row: "px-3 py-2.5", label: "text-ink-2 text-md", body: "text-sm", arrow: "size-4" },
} as const;

/**
 * Style A, the link index. Two forms:
 *
 * - `lg`, a page's closing index (the dashboard foot, a partner's start): one brand plate, the
 *   heading at its top and the destinations in a grid of compact links — a label, one line on what
 *   is there, the travelling arrow. The plate is the brand's ground, so the section reads as Insyte
 *   speaking, and the links stay at reading size rather than shouting.
 * - `md`, under a list: plain rows a step quieter than the table they follow.
 *
 * The whole link is the target; on hover or focus it lifts and the arrow travels.
 */
export function LinkIndex({ items, heading, label, size = "lg", className }: { items: ReadonlyArray<IndexItem>; heading?: string; label?: string; size?: "lg" | keyof typeof SIZE; className?: string }) {
	const id = `index-${items.map((i) => i.id).join("-")}`;
	if (items.length === 0) return null;
	const labelled = { "aria-labelledby": heading ? id : undefined, "aria-label": heading ? undefined : label };

	if (size === "lg")
		return (
			<section {...labelled} className={cn("plate relative overflow-hidden rounded-2xl p-5 sm:p-6", className)}>
				{heading ? (
					<h2 id={id} className="relative mb-3 px-3 font-medium text-mesh-ink text-md">
						{heading}
					</h2>
				) : null}
				<ul className="relative grid gap-1 sm:grid-cols-2 xl:grid-cols-3">
					{items.map((item) => {
						const external = "href" in item;
						return (
							<li key={item.id}>
								<DestinationLink
									dest={item}
									className="flex h-full w-full items-start gap-3 rounded-lg px-3 py-3 transition-colors hover:bg-mesh-ink/8 focus-visible:bg-mesh-ink/8"
								>
									<span className="flex min-w-0 flex-1 flex-col gap-0.5">
										<span className="font-medium text-base text-mesh-ink">
											{item.label}
											{external ? <span className="sr-only"> (opent in een nieuw tabblad)</span> : null}
										</span>
										<span className="text-mesh-ink-2 text-sm text-pretty">{item.body}</span>
									</span>
									<TravelArrow external={external} className="mt-0.5 size-4 text-mesh-ink-2 transition-colors group-hover/dest:text-mesh-ink group-focus-visible/dest:text-mesh-ink" />
								</DestinationLink>
							</li>
						);
					})}
				</ul>
			</section>
		);

	const s = SIZE[size];
	return (
		<section {...labelled} className={cn("flex flex-col gap-1", className)}>
			{heading ? (
				<h2 id={id} className="px-1 font-medium text-ink text-md">
					{heading}
				</h2>
			) : null}
			<ul className="flex flex-col">
				{items.map((item) => {
					const external = "href" in item;
					return (
						<li key={item.id}>
							<DestinationLink
								dest={item}
								className={cn(
									"grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-6 gap-y-0.5 rounded-lg transition-colors hover:bg-arc-tint focus-visible:bg-arc-tint md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto]",
									s.row,
								)}
							>
								<span className={cn("min-w-0 font-medium transition-colors group-hover/dest:text-arc-ink group-focus-visible/dest:text-arc-ink", s.label)}>
									{item.label}
									{external ? <span className="sr-only"> (opent in een nieuw tabblad)</span> : null}
								</span>
								<span className={cn("col-start-1 row-start-2 min-w-0 text-ink-3 text-pretty md:col-start-2 md:row-start-1", s.body)}>{item.body}</span>
								<TravelArrow
									external={external}
									className={cn("col-start-2 row-span-2 row-start-1 text-ink-3 transition-colors group-hover/dest:text-arc-ink group-focus-visible/dest:text-arc-ink md:col-start-3 md:row-span-1", s.arrow)}
								/>
							</DestinationLink>
						</li>
					);
				})}
			</ul>
		</section>
	);
}
