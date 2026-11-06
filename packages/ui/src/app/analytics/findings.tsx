import { ArrowRight, ChevronRight, Sparkle } from "../../icons";
import { useNavigate } from "@tanstack/react-router";
import { motion, useReducedMotion } from "motion/react";
import { toast } from "sonner";
import { fileProposal } from "./file-proposal";
import type { Finding, Span } from "../lib/analytics/engine";
import { cn } from "../lib/utils";
import { useAnalytics } from "../stores/analytics-store";
import { DisputesChart, LeadTimeChart, RefundsChart, RevenueChart, SupportChart } from "./charts";

/**
 * Insyte's reading of the period, as a short column: each finding is one sentence, the chart that
 * shows it, and — where there is something to do — one line proposing it. The sentence opens the
 * whole of it in the drawer: the explanation, what moved it, and every order it counts.
 */

/** The chart a finding is drawn with. Two findings never share one, so the column never repeats. */
export const chartOf = (f: Finding) =>
	f.focus.chart === "heatmap" ? "revenue" : f.focus.chart === "delivery" ? "leadtime" : f.focus.chart;

function Chart({ f, A, B }: { f: Finding; A: Span; B: Span }) {
	const c = chartOf(f);
	if (c === "revenue") return <RevenueChart A={A} B={B} />;
	if (c === "leadtime") return <LeadTimeChart A={A} lit={f.focus.chart === "leadtime" ? f.focus.supplier : undefined} />;
	if (c === "refunds") return <RefundsChart A={A} B={B} lit={f.focus.chart === "refunds" ? f.focus.reason : undefined} />;
	if (c === "disputes") return <DisputesChart A={A} B={B} lit={f.focus.chart === "disputes" ? f.focus.reason : undefined} />;
	return <SupportChart A={A} B={B} />;
}

export function openFinding(f: Finding, A: Span, B: Span) {
	useAnalytics.getState().explain({
		title: f.metric,
		value: f.figure,
		compare: `${A.short} tegenover ${B.short}`,
		text: f.explain,
		drivers: f.drivers,
		unit: f.driverUnit,
		records: f.records,
	});
}

export function FindingBlock({ f, n, A, B, chart = true }: { f: Finding; n: number; A: Span; B: Span; chart?: boolean }) {
	const still = useReducedMotion();
	return (
		<motion.article
			id={`finding-${f.id}`}
			data-finding={f.id}
			initial={still ? false : { opacity: 0, y: 6 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.32, delay: n * 0.05, ease: [0.16, 1, 0.3, 1] }}
			className="flex scroll-mt-8 flex-col gap-4"
		>
			<button
				type="button"
				onClick={() => openFinding(f, A, B)}
				className="group -mx-3 flex cursor-pointer items-start gap-4 rounded-lg px-3 py-2 text-left transition-colors hover:bg-ink/4"
			>
				<span className="w-3 pt-px text-ink-3 text-sm tabular-nums">{n}</span>
				<span className="flex min-w-0 flex-1 flex-col gap-1">
					<span className="flex items-center gap-2 text-ink-3 text-sm">
						{f.metric}
						<span aria-hidden className={cn("size-1.5 rounded-full", f.tone === "good" ? "bg-signal-green" : f.tone === "bad" ? "bg-signal-red" : "bg-ink-4")} />
						<span className="sr-only">{f.tone === "good" ? "goed" : f.tone === "bad" ? "verdient aandacht" : "stabiel"}</span>
					</span>
					<span className="max-w-[62ch] text-balance text-ink text-lg">{f.headline}</span>
				</span>
				<ChevronRight className="mt-6 size-4 shrink-0 text-ink-4 transition-transform group-hover:translate-x-0.5 group-hover:text-ink-2" strokeWidth={1.75} />
			</button>
			{chart ? (
				<div className="pl-7">
					<Chart f={f} A={A} B={B} />
				</div>
			) : null}
			{f.proposal ? <ProposalLine f={f} A={A} B={B} /> : null}
		</motion.article>
	);
}

/** What Insyte would do about it, in one line; filing does it, with Undo. */
function ProposalLine({ f, A, B }: { f: Finding; A: Span; B: Span }) {
	const navigate = useNavigate();
	const key = `${A.from}:${B.from}:${f.id}`;
	const decision = useAnalytics((s) => s.decided[key]);
	const decide = useAnalytics((s) => s.decide);
	const p = f.proposal!;
	return (
		<div className="ml-7 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg bg-arc-tint/50 py-2 pr-2 pl-3">
			<Sparkle className="size-3.5 shrink-0 text-arc-ink" strokeWidth={1.75} />
			<span className={cn("min-w-0 flex-1 text-sm", decision ? "text-ink-3" : "text-ink")} title={p.why}>
				{p.title}
			</span>
			{decision ? (
				<span className="flex items-center gap-2 text-ink-3 text-sm">
					{decision === "filed" ? "Uitgevoerd" : "Genegeerd"}
					{/* Filing is undone from its toast, since it changed a record; discarding changed nothing. */}
					{decision === "discarded" ? (
						<button type="button" onClick={() => decide(key, null)} className="cursor-pointer font-medium text-arc-ink hover:underline">
							Ongedaan maken
						</button>
					) : null}
				</span>
			) : (
				<span className="flex items-center gap-1">
					<button
						type="button"
						onClick={() => decide(key, "discarded")}
						className="h-7 cursor-pointer rounded-md px-2.5 font-medium text-ink-2 text-sm hover:bg-ink/6 hover:text-ink"
					>
						Negeren
					</button>
					<button
						type="button"
						onClick={() => {
							const done = fileProposal(p.action);
							decide(key, "filed");
							toast(done.message, done.to ? { action: { label: "Openen", onClick: () => navigate({ to: done.to! }) } } : undefined);
						}}
						className="flex h-7 cursor-pointer items-center gap-1.5 rounded-md bg-abyss px-2.5 font-medium text-mesh-ink text-sm shadow-primary hover:bg-abyss-2"
					>
						{p.fileLabel}
						<ArrowRight className="size-3.5" strokeWidth={2} />
					</button>
				</span>
			)}
		</div>
	);
}
