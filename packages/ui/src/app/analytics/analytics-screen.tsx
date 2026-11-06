import { Link } from "@tanstack/react-router";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "../../components/dropdown-menu";
import { useNavigate } from "@tanstack/react-router";
import { ArrowDown, ArrowUp, ChevronDown, Sparkle } from "../../icons";
import { useEffect, useMemo, useState } from "react";
import { AnswerList, AskField, useAnswers } from "./ask-bar";
import { ExplainDrawer } from "./explain-drawer";
import { EmptyState } from "../common/empty-state";
import { PageGuide } from "../common/page-guide";
import { chartOf, FindingBlock, openFinding } from "./findings";
import { type Finding, findings, metrics, MONTHS, money, type Month, num, pct, round1, type Span, spans } from "../lib/analytics/engine";
import { HISTORY, STORE_NAME } from "../lib/analytics/history";
import { cn } from "../lib/utils";
import { useAnalytics } from "../stores/analytics-store";

/* ─────────────────────────────────────────────────────────────────────
   Analytics — the numbers first, then what Insyte read in them.

   The six numbers lead, large, on the brand's ground: the page's one
   plate, because they are the thing the operator came for. Under it the
   page splits. A sticky sidebar keeps the index of what Insyte found,
   marking the one being read, and the field to ask about anything else;
   the column beside it carries the answers and the findings, each a
   sentence with the chart that shows it and, where there is something to
   do, one line proposing it. Every figure opens the drawer, where it is
   taken apart down to the orders.

   Everything is computed from the store's history (`lib/analytics`),
   two periods compared over the same days.
   ───────────────────────────────────────────────────────────────────── */

const GUIDE = [
	{ title: "Wat Insyte leest", body: "Analyse leest je bestellingen, leveringen, terugbetalingen en tickets, en schrijft wat er veranderde en waarom.", art: "chart" },
	{ title: "Vraag ernaar", body: "Antwoorden komen uit dezelfde regels en verschijnen in de kolom.", art: "chat" },
] as const;

export function AnalyticsPage() {
	const a = useAnalytics((s) => s.a);
	const b = useAnalytics((s) => s.b);
	const setPeriods = useAnalytics((s) => s.setPeriods);
	const navigate = useNavigate();
	const [more, setMore] = useState(false);
	const { A, B } = useMemo(() => spans(a, b), [a, b]);
	const { answers, ask, dismiss } = useAnswers(A, B);

	/* The three findings that lead, each with a chart of its own; the others fold away. */
	const { lead, rest } = useMemo(() => {
		const all = findings(A, B);
		const used = new Set<string>();
		const lead: Finding[] = [];
		for (const f of all) {
			if (lead.length < 3 && !used.has(chartOf(f))) {
				lead.push(f);
				used.add(chartOf(f));
			}
		}
		return { lead, rest: all.filter((f) => !lead.includes(f)) };
	}, [A, B]);
	const ordered = useMemo(() => [...lead, ...rest], [lead, rest]);
	const byId = useMemo(() => Object.fromEntries(ordered.map((f) => [f.id, f])), [ordered]);
	const reading = useReading(ordered.map((f) => f.id), more);

	function askAndShow(q: string) {
		ask(q);
		requestAnimationFrame(() => scrollToId("answers"));
	}

	function goTo(f: Finding) {
		if (rest.includes(f) && !more) setMore(true);
		requestAnimationFrame(() => scrollToId(`finding-${f.id}`));
	}

	// Before the first order there is nothing to compare, and a page of zeros would read as news.
	if (HISTORY.orders.length === 0)
		return (
			<div className="flex min-h-[70vh] items-center justify-center px-6">
				<EmptyState
					kind="orders"
					title="Nog niets om te lezen."
					body="Zodra Shopify de eerste bestellingen synchroniseert, schrijft Insyte hier wat er veranderde."
					action={{ label: "Synchronisatie bekijken", onClick: () => navigate({ to: "/data", search: { view: "sync" } as never }) }}
				/>
			</div>
		);

	return (
		<div className="px-6 py-8">
			<div className="mx-auto flex max-w-[1180px] flex-col gap-10">
				<Numbers A={A} B={B} byId={byId} onPeriods={setPeriods} a={a} b={b} />

				<div className="grid gap-10 lg:grid-cols-[232px_minmax(0,1fr)] lg:gap-14">
					<aside aria-label="Op deze pagina" className="hidden self-start lg:sticky lg:top-6 lg:flex lg:flex-col lg:gap-8">
						<nav aria-labelledby="found-title" className="flex flex-col gap-2">
							<h2 id="found-title" className="flex items-center gap-2 font-medium text-base text-ink">
								<Sparkle className="size-3.5 text-arc-ink" strokeWidth={1.75} />
								Wat Insyte vond
							</h2>
							<ol className="flex flex-col gap-0.5">
								{ordered.map((f, i) => {
									const on = reading === f.id;
									return (
										<li key={f.id}>
											<button
												type="button"
												aria-current={on ? "true" : undefined}
												onClick={() => goTo(f)}
												className={cn(
													"flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
													on ? "bg-arc-tint text-arc-ink" : "text-ink-2 hover:bg-ink/4 hover:text-ink",
												)}
											>
												<span className={cn("w-3 tabular-nums", on ? "text-arc-ink" : "text-ink-3")}>{i + 1}</span>
												<span className="min-w-0 flex-1 truncate">{f.metric}</span>
												<span
													aria-hidden
													className={cn("size-1.5 shrink-0 rounded-full", f.tone === "good" ? "bg-signal-green" : f.tone === "bad" ? "bg-signal-red" : "bg-ink-4")}
												/>
											</button>
										</li>
									);
								})}
							</ol>
						</nav>
						<section aria-label="Vragen" className="flex flex-col gap-2">
							<h2 className="font-medium text-base text-ink">Vraag ernaar</h2>
							<AskField onAsk={askAndShow} />
						</section>
						<p className="text-ink-3 text-xs leading-relaxed">
							Berekend uit {HISTORY.orders.length.toLocaleString("nl-NL")} bestellingen sinds 1 januari, met hun leveringen, terugbetalingen
							en geschillen, en {HISTORY.tickets.length.toLocaleString("nl-NL")} tickets.
						</p>
					</aside>

					<div className="flex min-w-0 flex-col gap-12">
						<div className="lg:hidden">
							<AskField onAsk={askAndShow} />
						</div>
						{answers.length > 0 ? (
							<section id="answers" aria-label="Je vragen" className="flex scroll-mt-8 flex-col gap-4">
								<AnswerList answers={answers} onAsk={askAndShow} onDismiss={dismiss} />
							</section>
						) : null}

						<section aria-label="Wat Insyte vond" className="flex flex-col gap-14">
							{lead.map((f, i) => (
								<FindingBlock key={`${A.from}:${B.from}:${f.id}`} f={f} n={i + 1} A={A} B={B} />
							))}
						</section>

						{rest.length > 0 ? (
							<section aria-label="Meer bevindingen" className="-mt-4 flex flex-col gap-2">
								<button
									type="button"
									aria-expanded={more}
									onClick={() => setMore((v) => !v)}
									className="-mx-3 flex w-fit cursor-pointer items-center gap-1.5 rounded-md px-3 py-1.5 font-medium text-ink-2 text-sm hover:bg-ink/4 hover:text-ink"
								>
									{more ? "Minder bevindingen" : `Nog ${rest.length} ${rest.length === 1 ? "bevinding" : "bevindingen"}`}
									<ChevronDown className={cn("size-3.5 transition-transform", more && "rotate-180")} strokeWidth={2} />
								</button>
								{more ? (
									<div className="flex flex-col gap-4">
										{rest.map((f, i) => (
											<FindingBlock key={f.id} f={f} n={lead.length + i + 1} A={A} B={B} chart={false} />
										))}
									</div>
								) : null}
							</section>
						) : null}
					</div>
				</div>
			</div>
			<ExplainDrawer />
			<PageGuide id="analytics" title="Analyse" steps={GUIDE} />
		</div>
	);
}

/**
 * Scroll the page's own scroll area to an element. `scrollIntoView` would also scroll every
 * ancestor, including the app shell, which is meant to stay put.
 */
function scrollToId(id: string) {
	const el = document.getElementById(id);
	const box = el?.closest("main");
	if (!el || !box) return;
	const top = el.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop - 24;
	box.scrollTo({ top, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
}

/** Which finding is being read: the one whose block holds the upper third of the view. */
function useReading(ids: string[], more: boolean) {
	const [reading, setReading] = useState<string | undefined>(ids[0]);
	const key = ids.join(",");
	// biome-ignore lint/correctness/useExhaustiveDependencies: the list is keyed by its ids and whether the fold is open
	useEffect(() => {
		const els = [...document.querySelectorAll<HTMLElement>("[data-finding]")];
		if (els.length === 0) return;
		const io = new IntersectionObserver(
			(entries) => {
				const hit = entries.filter((e) => e.isIntersecting).sort((x, y) => x.boundingClientRect.top - y.boundingClientRect.top)[0];
				if (hit) setReading(hit.target.getAttribute("data-finding") ?? undefined);
			},
			{ rootMargin: "-25% 0px -65% 0px" },
		);
		for (const el of els) io.observe(el);
		return () => io.disconnect();
	}, [key, more]);
	return reading;
}

/**
 * The six numbers, on the page's one plate. Each opens its finding in the drawer — or, where there
 * is none, its own breakdown — and says what it was before, so the change is never only a sign.
 */
function Numbers({
	A,
	B,
	a: am,
	b: bm,
	byId,
	onPeriods,
}: {
	A: Span;
	B: Span;
	a: Month;
	b: Month;
	byId: Record<string, Finding>;
	onPeriods: (a: Month, b: Month) => void;
}) {
	const explain = useAnalytics((s) => s.explain);
	const a = metrics(A);
	const b = metrics(B);
	const items: Array<{ label: string; value: string; before: string; delta: number; unit: string; goodWhenUp: boolean; digits?: number; open: () => void }> = [
		{
			label: "Omzet",
			value: money(a.revenue),
			before: money(b.revenue),
			delta: pct(a.revenue, b.revenue),
			unit: "%",
			goodWhenUp: true,
			open: () => byId.revenue && openFinding(byId.revenue, A, B),
		},
		{
			label: "Betaalde bestellingen",
			value: a.counted.length.toLocaleString("nl-NL"),
			before: b.counted.length.toLocaleString("nl-NL"),
			delta: pct(a.counted.length, b.counted.length),
			unit: "%",
			goodWhenUp: true,
			open: () => {
				const by = (m: typeof a) => {
					const g = new Map<string, number>();
					for (const o of m.counted) g.set(o.store, (g.get(o.store) ?? 0) + 1);
					return g;
				};
				const ga = by(a);
				const gb = by(b);
				explain({
					title: "Betaalde bestellingen",
					value: a.counted.length.toLocaleString("nl-NL"),
					compare: `tegenover ${b.counted.length.toLocaleString("nl-NL")} in ${B.short}`,
					text: `In ${A.label} werden ${a.counted.length.toLocaleString("nl-NL")} bestellingen betaald en gehouden, gemiddeld ${money(a.aov)}, tegenover ${b.counted.length.toLocaleString("nl-NL")} van gemiddeld ${money(b.aov)} in ${B.label}.`,
					drivers: [...new Set([...ga.keys(), ...gb.keys()])].map((k) => ({
						label: STORE_NAME[k] ?? k,
						value: (ga.get(k) ?? 0) - (gb.get(k) ?? 0),
						detail: `${gb.get(k) ?? 0} → ${ga.get(k) ?? 0}`,
					})),
					unit: "orders",
					records: a.counted,
					open: { label: "Bestellingen openen", to: "/orders" },
				});
			},
		},
		{
			label: "Op tijd",
			value: `${num(a.onTime)}%`,
			before: `${num(b.onTime)}%`,
			delta: round1(a.onTime - b.onTime),
			unit: " pp",
			goodWhenUp: true,
			open: () => byId.delivery && openFinding(byId.delivery, A, B),
		},
		{
			label: "Terugbetaald",
			value: `${num(round1(a.refundRate))}%`,
			before: `${num(round1(b.refundRate))}%`,
			delta: round1(a.refundRate - b.refundRate),
			unit: " pp",
			goodWhenUp: false,
			open: () => byId.refunds && openFinding(byId.refunds, A, B),
		},
		{
			label: "Geschillen",
			value: String(a.disputes.length),
			before: String(b.disputes.length),
			delta: a.disputes.length - b.disputes.length,
			unit: "",
			digits: 0,
			goodWhenUp: false,
			open: () => byId.disputes && openFinding(byId.disputes, A, B),
		},
		{
			label: "Uren tot opgelost",
			value: `${num(a.resolveH)} u`,
			before: `${num(b.resolveH)} u`,
			delta: pct(a.resolveH, b.resolveH),
			unit: "%",
			goodWhenUp: false,
			open: () => byId.support && openFinding(byId.support, A, B),
		},
	];

	return (
		<section aria-labelledby="page-title" className="plate overflow-hidden rounded-2xl">
			<span aria-hidden className="plate-scan" />
			<header className="flex flex-col gap-1.5 px-7 pt-6">
				<div className="flex items-center justify-between gap-3">
					<h1 id="page-title" className="font-medium text-mesh-ink text-xl">
						Analyse
					</h1>
					<Link to="/costs" className="flex h-8 items-center rounded-md px-2.5 font-medium text-mesh-ink-2 text-sm transition-colors hover:bg-mesh-ink/10 hover:text-mesh-ink">
						Kosten en nettowinst
					</Link>
				</div>
				<p className="flex flex-wrap items-center gap-x-1.5 text-base text-mesh-ink-2">
					Wat Insyte leest in
					<MonthPicker label="Deze periode" value={am} onChange={(m) => onPeriods(m, m === bm ? previous(m) : bm)} />
					tegenover
					<MonthPicker label="Vergeleken met" value={bm} onChange={(m) => onPeriods(am, m === am ? previous(m) : m)} />
				</p>
			</header>
			<dl className="grid grid-cols-2 px-3 pt-6 pb-4 sm:grid-cols-3 xl:grid-cols-6">
				{items.map((it, i) => {
					const good = it.delta === 0 || it.delta > 0 === it.goodWhenUp;
					const Arrow = it.delta >= 0 ? ArrowUp : ArrowDown;
					return (
						<div
							key={it.label}
							className={cn(i > 0 && "xl:shadow-[inset_1px_0_0_color-mix(in_oklch,var(--mesh-ink)_12%,transparent)]")}
						>
							<button
								type="button"
								onClick={it.open}
								className="group flex w-full cursor-pointer flex-col gap-2 rounded-xl px-4 py-4 text-left transition-colors hover:bg-mesh-ink/8 focus-visible:bg-mesh-ink/8"
							>
								<dt className="text-mesh-ink-2 text-sm">{it.label}</dt>
								<dd className="flex flex-col gap-2.5">
									{/* Six to a row: a busy store's revenue steps down a size rather than running into its neighbour. */}
									<span className={cn("figure whitespace-nowrap text-mesh-ink", it.value.length > 10 ? "text-2xl" : it.value.length > 8 ? "text-3xl" : "text-4xl")}>{it.value}</span>
									<span className="flex flex-wrap items-center gap-2 text-xs">
										<span
											className={cn(
												"flex h-5 items-center gap-0.5 rounded-full px-1.5 font-medium tabular-nums",
												good ? "bg-signal-green-bg text-signal-green" : "bg-signal-red-bg text-signal-red",
											)}
										>
											<Arrow className="size-3" strokeWidth={2.25} />
											{Math.abs(it.delta).toLocaleString("nl-NL", { minimumFractionDigits: it.digits ?? 1, maximumFractionDigits: it.digits ?? 1 })}
											{it.unit}
										</span>
										<span className="text-mesh-ink-3 tabular-nums">was {it.before}</span>
									</span>
								</dd>
							</button>
						</div>
					);
				})}
			</dl>
		</section>
	);
}

/** The month before, or the one after for January, so the two periods are never the same. */
const previous = (m: Month): Month => {
	const i = MONTHS.findIndex((x) => x.id === m);
	return (i > 0 ? MONTHS[i - 1]! : MONTHS[1]!).id;
};

/** A month, inline in the sentence it belongs to, in chalk on the plate. */
function MonthPicker({ label, value, onChange }: { label: string; value: Month; onChange: (m: Month) => void }) {
	const shown = MONTHS.find((m) => m.id === value)!;
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					aria-label={`${label}: ${shown.label}`}
					className="flex cursor-pointer items-center gap-0.5 rounded-md px-1 font-medium text-mesh-ink underline decoration-dotted decoration-mesh-ink-3 underline-offset-4 hover:bg-mesh-ink/10"
				>
					{shown.label.toLowerCase()}
					{value === "2026-05" ? " tot nu toe" : ""}
					<ChevronDown className="size-3.5 text-mesh-ink-2" strokeWidth={2} />
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="w-44">
				<DropdownMenuLabel>{label}</DropdownMenuLabel>
				{MONTHS.map((m) => (
					<DropdownMenuItem key={m.id} onClick={() => onChange(m.id)}>
						{m.label}
						{m.id === "2026-05" ? <span className="ml-auto text-ink-3 text-xs">tot 26 mei</span> : null}
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
