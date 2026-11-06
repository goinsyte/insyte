import type { ReactNode } from "react";
import { getGreeting } from "../lib/greetings";
import { cn } from "../lib/utils";

/* ─────────────────────────────────────────────────────────────────────
   DashboardGreeting — the "Good morning, Elena. 3 orders need a closer
   look" hero. Replaces the per-dashboard inline page header on the
   operator, supplier, and affiliate landing pages.

   Visual recipe (matches the marketing DashboardPreview's greeting):
     · Today's date in 10.5px font-medium ink-3
     · Greeting line in medium clamp(22px, 2.4vw, 32px)
       tracking-[-0.5px] ink. The focus phrase ("3 orders need...") wraps
       on the same line where possible, with the count in tabular-nums.
     · Optional supporting line (e.g. "Insyte chargebacks evidence is
       ready to submit") in text-base ink-2 below.
     · Optional trailing slot (right-aligned) for live status, refresh
       button, mode-switcher, etc.

   No background, no border, no shadow — the surface is the page.
   ──────────────────────────────────────────────────────────────────────── */

function formatDate(date: Date = new Date()): string {
	return date.toLocaleDateString("nl-NL", {
		weekday: "short",
		day: "numeric",
		month: "long",
	});
}

export type DashboardGreetingProps = {
	/** First name (or full salutation). Sentence-case. */
	name: string;
	/** Override the time-of-day greeting. */
	greeting?: string;
	/** The leading focus phrase, e.g. "3 orders need a closer look this morning". */
	focus?: ReactNode;
	/** Secondary line beneath the greeting. */
	subtitle?: ReactNode;
	/** Right-aligned slot for live status, refresh, mode switch, etc. */
	trailing?: ReactNode;
	/** Override the date string. */
	dateLabel?: string;
	className?: string;
};

export function DashboardGreeting({
	name,
	greeting,
	focus,
	subtitle,
	trailing,
	dateLabel,
	className,
}: DashboardGreetingProps) {
	// If the caller passes `greeting`, treat it as an explicit override of
	// just the leading salutation word ("Welcome back"); otherwise pull the
	// tonal day-aware variant from the shared util.
	const auto = getGreeting(name);
	const salutationLine = greeting ? `${greeting}, ${name}.` : auto.salutation;
	return (
		<header
			className={cn(
				"flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-6",
				className,
			)}
		>
			<div className="flex min-w-0 flex-col gap-1.5">
				<span className="font-medium text-2xs text-ink-3">
					{dateLabel ?? formatDate()}
				</span>
				<h1 className="font-medium text-[clamp(22px,2.4vw,32px)] text-ink leading-[1.1] tracking-[-0.5px]">
					{salutationLine}
				</h1>
				{(focus || subtitle) && (
					<p className="max-w-[58ch] text-base text-ink-2 leading-[1.55]">
						{focus}
						{focus && subtitle ? " " : null}
						{subtitle}
					</p>
				)}
			</div>
			{trailing && (
				<div className="flex shrink-0 items-baseline gap-3">{trailing}</div>
			)}
		</header>
	);
}
