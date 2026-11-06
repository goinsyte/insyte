import { Link } from "@tanstack/react-router";
import { ChevronRight } from "../../icons";
import type { ReactNode } from "react";
import { cn } from "../lib/utils";

/* ─────────────────────────────────────────────────────────────────────
   PageHeader — one line: where you are, and what you can do here.

   Three things have left this file, each because it was furniture:

   · The EYEBROW. Five screens passed a label restating the heading in
     smaller type — "Fulfillment" over "Orders". The heading carries its
     own weight.

   · The DESCRIPTION. "Track fulfillment, refunds, and supplier hand-offs
     from a single, calm view" sat under "Orders" on every visit, for an
     operator who opens this screen forty times a day and has never once
     needed it explained. A list screen was spending four stacked rows —
     title, description, figure, context sentence — before the first row
     of data. The screens that still have something true to say say it
     where it is read: in the table's empty state, on first run.

   · The BORDER along the bottom. A section edge is a surface change in
     this system, not a line, and the page below is a different field
     already. A hairline is for a data boundary — a table row, an input.

   What arrived instead is the TRAIL. A detail screen opened from a list
   needs to say what it came out of, and "Orders / SO-12200" says it in
   the space the description was using. The last crumb is the heading, so
   the trail costs no extra row.
   ──────────────────────────────────────────────────────────────────── */

export type Crumb = {
	label: string;
	/** Omitted on the last crumb, which is where you already are. */
	to?: string;
};

export function PageHeader({
	title,
	crumbs = [],
	meta,
	actions,
	className,
}: {
	title: ReactNode;
	/** Ancestors only, nearest last. The title is the final crumb and is not repeated here. */
	crumbs?: ReadonlyArray<Crumb>;
	/** One short clause beside the title — a status, a count. Never a sentence of explanation. */
	meta?: ReactNode;
	actions?: ReactNode;
	className?: string;
}) {
	return (
		<header
			className={cn(
				"flex min-h-[52px] flex-wrap items-center gap-x-3 gap-y-2 px-5 py-2.5",
				className,
			)}
		>
			<nav
				aria-label="Kruimelpad"
				className="flex min-w-0 items-center gap-1.5"
			>
				{crumbs.map((c) => (
					<span key={c.label} className="flex items-center gap-1.5">
						{c.to ? (
							<Link
								to={c.to}
								className="rounded-sm font-medium text-sm text-ink-3 transition-colors hover:text-ink"
							>
								{c.label}
							</Link>
						) : (
							<span className="font-medium text-sm text-ink-3">{c.label}</span>
						)}
						<ChevronRight
							className="size-3.5 shrink-0 text-ink-4"
							strokeWidth={2}
							aria-hidden
						/>
					</span>
				))}
				<h1 className="truncate font-medium text-lg text-ink">{title}</h1>
			</nav>

			{meta ? (
				<p className="font-medium text-xs text-ink-3 tabular-nums">{meta}</p>
			) : null}

			{actions ? (
				<div className="ml-auto flex shrink-0 flex-wrap items-center gap-1.5">
					{actions}
				</div>
			) : null}
		</header>
	);
}
