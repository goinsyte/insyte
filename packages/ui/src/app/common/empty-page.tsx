import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { EmptyIcon, type EmptyKind } from "./empty-icon";
import { DestinationLink, type IndexItem, TravelArrow } from "../marketing-sections/link-index";
import { cn } from "../lib/utils";

/**
 * What an area shows before it has ever held a record: the first day, not a filter that matched
 * nothing (that is `EmptyState`, inside the table).
 *
 * The table used to stay on screen with its column heads over a hole, a small mark in the middle,
 * and a grey promotional block underneath — three things saying "nothing yet" at three volumes.
 * This replaces all three with one column read top to bottom: the hatch band with the area's mark
 * in it and the count it would otherwise show, what will arrive here and how, the one or two things
 * to do about it, and a short list of places to start. Left-aligned and set high, because the
 * operator reads it the way they would read the list it stands in for.
 *
 * The motion is the band's: the mark breathes (its own grammar, see `empty-icon.tsx`) and one Arc
 * point travels the hatch once every few seconds, the record on its way. Reduced motion keeps the
 * drawing and drops the travel.
 */

type Action = { label: string; onClick: () => void; icon?: ReactNode };

export function EmptyPage({
	kind,
	count,
	title,
	body,
	action,
	secondary,
	starts,
	startsTitle = "Om mee te beginnen",
	className,
}: {
	kind: EmptyKind;
	/** The count the list would show, in words: "0 bestellingen". */
	count: string;
	title: string;
	body: string;
	action?: Action;
	secondary?: Action;
	starts?: ReadonlyArray<IndexItem>;
	startsTitle?: string;
	className?: string;
}) {
	return (
		<section aria-label={title} className={cn("mx-auto flex w-full max-w-[680px] flex-col gap-6 px-1 pt-10 pb-16 sm:pt-16", className)}>
			<HatchBand kind={kind} count={count} />
			<div className="flex flex-col gap-2">
				<h2 className="text-balance font-medium text-ink text-xl">{title}</h2>
				<p className="max-w-[60ch] text-base text-ink-2 leading-[1.6]">{body}</p>
			</div>
			{action || secondary ? (
				<div className="flex flex-wrap items-center gap-2">
					{action ? (
						<button
							type="button"
							onClick={action.onClick}
							className="flex h-9 cursor-pointer items-center gap-1.5 rounded-md bg-abyss px-3.5 font-medium text-mesh-ink text-sm shadow-primary transition hover:bg-abyss-2 active:scale-[0.98]"
						>
							{action.icon}
							{action.label}
						</button>
					) : null}
					{secondary ? (
						<button
							type="button"
							onClick={secondary.onClick}
							className="flex h-9 cursor-pointer items-center gap-1.5 rounded-md bg-ink/6 px-3.5 font-medium text-ink text-sm transition-colors hover:bg-ink/10"
						>
							{secondary.icon}
							{secondary.label}
						</button>
					) : null}
				</div>
			) : null}
			{starts?.length ? (
				<div className="mt-4 flex flex-col gap-1">
					<h3 className="font-medium text-ink-2 text-sm">{startsTitle}</h3>
					<ul className="flex flex-col">
						{starts.map((s) => (
							<li key={s.id} className="shadow-[inset_0_-1px_0_color-mix(in_oklch,var(--ink)_7%,transparent)] last:shadow-none">
								<DestinationLink dest={s} className="group -mx-3 flex items-center gap-4 rounded-lg px-3 py-3 transition-colors hover:bg-ink/4">
									<span className="flex min-w-0 flex-1 flex-col gap-0.5">
										<span className="font-medium text-base text-ink">{s.label}</span>
										<span className="text-ink-3 text-sm">{s.body}</span>
									</span>
									<TravelArrow className="size-4 shrink-0 text-ink-3 group-hover:text-arc-ink" />
								</DestinationLink>
							</li>
						))}
					</ul>
				</div>
			) : null}
		</section>
	);
}

/**
 * The band: the Drift hatch, fading out to the right, with the area's mark on a paper tile at its
 * start and the count at its end. Also used on its own by the first-day home.
 */
export function HatchBand({ kind, count, className, still: stillProp = false }: { kind: EmptyKind; count?: string; className?: string; still?: boolean }) {
	const still = useReducedMotion() || stillProp;
	return (
		<div className={cn("relative flex h-16 items-center gap-4 overflow-hidden rounded-xl bg-mist px-3", className)}>
			<div
				aria-hidden
				className="hatch pointer-events-none absolute inset-0 [mask-image:linear-gradient(90deg,black_0%,black_55%,transparent_100%)]"
			/>
			{still ? null : (
				<motion.span
					aria-hidden
					className="pointer-events-none absolute top-1/2 size-1.5 -translate-y-1/2 rounded-full bg-arc"
					initial={{ left: "12%", opacity: 0 }}
					animate={{ left: ["12%", "78%"], opacity: [0, 1, 1, 0] }}
					transition={{ duration: 3.2, ease: [0.16, 1, 0.3, 1], repeat: Infinity, repeatDelay: 2.4, times: [0, 0.15, 0.8, 1] }}
				/>
			)}
			<span className="relative flex size-11 shrink-0 items-center justify-center rounded-lg bg-paper shadow-[0_1px_2px_color-mix(in_oklch,var(--ink)_8%,transparent)]">
				<EmptyIcon kind={kind} size={48} still={still === true} />
			</span>
			{count ? <span className="relative ml-auto text-ink-3 text-sm tabular-nums">{count}</span> : null}
		</div>
	);
}
