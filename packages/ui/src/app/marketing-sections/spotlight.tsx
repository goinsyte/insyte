import type { ReactNode } from "react";
import { cn } from "../lib/utils";
import { type Destination, DestinationLink, TravelArrow } from "./link-index";

/**
 * Style B, the product spotlight: a website's feature section, set inside the console. A headline,
 * two sentences and one arrow on one side; on the other a live miniature of the place the arrow goes,
 * drawn with the destination's own parts and the workspace's own records (`previews.tsx`).
 *
 * The miniature is a picture, not a control: `inert`, hidden from assistive tech and from the
 * pointer, so the section has exactly one thing to press. On `paper` or `grey` the miniature sits on
 * the automation canvas's `board` ground; on the `plate` it sits on the drafting grid itself, which is
 * kept for the one spotlight that sells something Insyte proposes.
 *
 * The arrow is a text action on purpose. A spotlight closes a page or sits under an empty state, and
 * the empty state's own next step is the screen's primary button; this never competes with it.
 */
export function Spotlight({
	id,
	title,
	body,
	cta,
	preview,
	side = "right",
	tone = "paper",
	size = "md",
	className,
}: {
	id: string;
	title: string;
	body: string;
	cta: { label: string } & Destination;
	preview: ReactNode;
	/** Which side the miniature sits on from `lg` up; below that it always follows the words. */
	side?: "left" | "right";
	/** `paper` on the glacier canvas (Start, a partner's start); `grey` on a paper page (a list); `plate` for the one that sells a proposal. */
	tone?: "paper" | "grey" | "plate";
	/** `lg` for a screen that has nothing else to show yet. */
	size?: "md" | "lg";
	className?: string;
}) {
	const plate = tone === "plate";
	const external = "href" in cta;
	return (
		<section
			aria-labelledby={id}
			className={cn("grid overflow-hidden rounded-xl lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]", plate ? "plate" : tone === "grey" ? "bg-glacier" : "bg-paper", side === "left" && "lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]", className)}
		>
			<div className={cn("flex flex-col justify-center gap-3", size === "lg" ? "px-6 py-8 sm:px-10 sm:py-12" : "px-6 py-7 sm:px-8 sm:py-9", side === "left" && "lg:order-last")}>
				<h2 id={id} className={cn("max-w-[22ch] text-balance font-medium", size === "lg" ? "text-2xl sm:text-3xl" : "text-xl sm:text-2xl", plate ? "text-mesh-ink" : "text-ink")}>
					{title}
				</h2>
				<p className={cn("max-w-[48ch] text-pretty", size === "lg" ? "text-md" : "text-base", plate ? "text-mesh-ink-2" : "text-ink-2")}>{body}</p>
				<DestinationLink
					dest={cta}
					className={cn(
						"-ml-3 mt-2 inline-flex h-9 w-fit items-center gap-2 rounded-md px-3 font-medium text-base transition-colors",
						plate ? "text-mesh-ink hover:bg-mesh-ink/10 focus-visible:bg-mesh-ink/10" : "text-arc-ink hover:bg-arc-tint focus-visible:bg-arc-tint",
					)}
				>
					{cta.label}
					{external ? <span className="sr-only"> (opent in een nieuw tabblad)</span> : null}
					<TravelArrow external={external} className="size-4" />
				</DestinationLink>
			</div>
			<div
				aria-hidden
				inert
				className={cn(
					"pointer-events-none relative flex min-h-[260px] select-none items-center justify-center overflow-hidden px-6 py-8",
					plate ? "" : "board m-2 rounded-lg lg:m-2.5",
					size === "lg" && "lg:min-h-[340px]",
				)}
			>
				{preview}
			</div>
		</section>
	);
}
