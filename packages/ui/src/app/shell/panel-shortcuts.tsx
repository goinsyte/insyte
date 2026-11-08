import {
	ArrowRight,
	Box,
	CornerDownLeft,
	Factory,
	type IconComponent,
	Inbox,
	ListFilter,
	PinOff,
	ShoppingBag,
	Store,
	Ticket,
	User,
	Workflow,
	X,
} from "../../icons";
import { Link, useRouterState } from "@tanstack/react-router";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { undoable } from "../lib/undo";
import { cn } from "../lib/utils";
import type { Shortcut, ShortcutKind } from "../stores/pins-store";
import { usePanel, usePins, useShellData, useViews, useWorkspace } from "./state";
import { useHydrated } from "../hooks/use-hydrated";

/**
 * The area panel's lower half: this week's report and the operator's shortcuts — what they pinned,
 * the views they saved, what they opened. Three styles, chosen in the panel's Customize dialog:
 *
 *   - **Today ruler** (the default) is the day as a ruled line: a tick for each thing with a time —
 *     Monday's report, what is due before the day ends, what was opened — with the time beside it
 *     and an Arc "now" mark between past and future, the way the plate's dimension line measures.
 *     Pinned things sit above it as a row of small square chips.
 *   - **Shortcut drawer** is one list with a switch on its heading — Pinned, Views, Recent — and the
 *     report as a single line.
 *   - **Classic** is the report as a quiet white card, Pinned, and a Favourites / Recent switch.
 */

const KIND: Record<ShortcutKind, IconComponent> = {
	order: ShoppingBag,
	customer: User,
	chargeback: CornerDownLeft,
	product: Box,
	automation: Workflow,
	supplier: Factory,
	store: Store,
};

const VIEW_KIND: Record<string, IconComponent> = {
	orders: ShoppingBag,
	chargebacks: CornerDownLeft,
	products: Box,
	customers: User,
	tickets: Ticket,
	queue: Inbox,
};

/** Monday of this week at 07:30, and its ISO week number. */
function reportWeek(now = new Date()): { key: string; week: number; monday: Date } {
	const monday = new Date(now);
	monday.setHours(7, 30, 0, 0);
	monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
	const thursday = new Date(monday);
	thursday.setDate(monday.getDate() + 3);
	const jan4 = new Date(thursday.getFullYear(), 0, 4);
	const week = 1 + Math.round(((thursday.getTime() - jan4.getTime()) / 86_400_000 - 3 + ((jan4.getDay() + 6) % 7)) / 7);
	return { key: `${thursday.getFullYear()}-W${week}`, week, monday };
}

function useReport() {
	const dismissed = usePins((s) => s.reportDismissed);
	const dismiss = usePins((s) => s.dismissReport);
	const r = reportWeek();
	return {
		...r,
		open: dismissed !== r.key,
		put: () => {
			dismiss(r.key);
			undoable("Weekrapport weggelegd tot volgende maandag", () => dismiss(null));
		},
	};
}

/** Everything the operator keeps in the panel, as one list the three styles each draw their way. */
type Item = { key: string; to: string; label: string; icon: IconComponent; onOpen?: () => void; remove?: () => void };

function usePinnedItems(): Item[] {
	const pinned = usePins((s) => s.pinned);
	const unpin = usePins((s) => s.unpin);
	const repin = usePins((s) => s.repin);
	return pinned.map((p) => ({
		key: `p-${p.to}-${p.label}`,
		to: p.to,
		label: p.label,
		icon: KIND[p.kind],
		remove: () => {
			unpin(p.to, p.label);
			undoable(`${p.label} losgemaakt`, () => repin(p));
		},
	}));
}

function useViewItems(onlyPinned: boolean): Item[] {
	const views = useViews((s) => s.views);
	const setActive = useViews((s) => s.setActive);
	const setDraft = useViews((s) => s.setDraft);
	const togglePin = useViews((s) => s.togglePin);
	return Object.entries(views).flatMap(([key, list]) =>
		list
			.filter((v) => !onlyPinned || v.pinned)
			.map((v) => ({
				key: `v-${key}-${v.id}`,
				to: key === "queue" ? "/dashboard" : `/${key}`,
				label: v.name,
				icon: VIEW_KIND[key] ?? ListFilter,
				onOpen: () => {
					setActive(key, v.id);
					setDraft(key, v.filter);
				},
				remove: v.pinned ? () => togglePin(key, v.id) : undefined,
			})),
	);
}

function useRecentItems(): Array<Item & { at?: number }> {
	const recent = usePins((s) => s.recent);
	return recent.map((r) => ({ key: `r-${r.to}`, to: r.to, label: r.label, icon: KIND[r.kind], at: r.at }));
}

/* ─── The report, in each style ─────────────────────────────────────────── */

export function ReportSection() {
	const style = usePanel((s) => s.style);
	const report = useReport();
	const still = useReducedMotion();
	// On the ruler the report is a tick on the line, not a block of its own.
	if (style === "ruler" || !report.open) return null;

	if (style === "drawer") {
		return (
			<div className="flex h-8 items-center gap-2 px-2 text-sm">
				<span className="size-1.5 shrink-0 rounded-[2px] bg-arc" aria-hidden />
				<span className="min-w-0 flex-1 truncate text-ink-2">Rapport week {report.week}</span>
				<Link to={"/analytics" as never} onClick={report.put} className="font-medium text-arc-ink hover:underline">
					Lezen
				</Link>
			</div>
		);
	}

	const when = new Intl.DateTimeFormat("nl-NL", { weekday: "long", hour: "2-digit", minute: "2-digit" }).format(report.monday);
	return (
		<motion.div
			initial={still ? false : { opacity: 0, y: 4 }}
			animate={{ opacity: 1, y: 0 }}
			className="relative mx-0.5 mt-3 flex flex-col gap-1 rounded-lg bg-paper p-3 shadow-[0_1px_2px_rgb(0_0_0/0.05)]"
		>
			<button
				type="button"
				onClick={report.put}
				aria-label="Weekrapport wegleggen"
				className="absolute top-2 right-2 flex size-6 cursor-pointer items-center justify-center rounded-md text-ink-3 transition-colors hover:bg-ink/6 hover:text-ink"
			>
				<X className="size-3.5" strokeWidth={2} />
			</button>
			<p className="flex items-center gap-1.5 text-xs text-ink-3 capitalize">
				<span className="size-1.5 rounded-[2px] bg-arc" aria-hidden />
				{when}
			</p>
			<p className="pr-5 font-medium text-base text-ink leading-snug">Het rapport van week {report.week} staat klaar</p>
			<Link to={"/analytics" as never} className="mt-1 flex items-center gap-1 self-start font-medium text-sm text-arc-ink hover:underline">
				Rapport lezen
				<ArrowRight className="size-3.5" strokeWidth={2} />
			</Link>
		</motion.div>
	);
}

/* ─── Shortcuts, in each style ──────────────────────────────────────────── */

export function ShortcutsSection({ reportShown }: { reportShown: boolean }) {
	const style = usePanel((s) => s.style);
	// The ruler is drawn against the clock in the reader's time zone, so only once the page is the browser's.
	const hydrated = useHydrated();
	if (style === "ruler") return hydrated ? <Ruler reportShown={reportShown} /> : null;
	if (style === "drawer") return <Drawer />;
	return <Classic />;
}

function Ruler({ reportShown }: { reportShown: boolean }) {
	const pinned = [...useViewItems(true), ...usePinnedItems()];
	const recent = useRecentItems();
	const queue = useWorkspace((s) => s.queue);
	const report = useReport();
	const still = useReducedMotion();
	const now = new Date();
	const today = now.toDateString();

	/* The day's ticks: what is due before midnight from the queue, what was opened today, and the
	   report when it is still unread. Each one sits at its time; "now" splits past from future. */
	type Tick = { key: string; at: number; label: string; to: string; tone: "red" | "amber" | "arc" | "ink"; onOpen?: () => void };
	const ticks: Tick[] = [];
	for (const q of queue) {
		if (q.state !== "open") continue;
		const at = dueAt(q.due, now);
		if (at === null || new Date(at).toDateString() !== today) continue;
		ticks.push({ key: q.id, at, label: q.title.split(" · ")[0] ?? q.title, to: "/dashboard", tone: q.signal === "red" ? "red" : "amber" });
	}
	for (const r of recent) {
		if (r.at === undefined || new Date(r.at).toDateString() !== today) continue;
		ticks.push({ key: r.key, at: r.at, label: r.label, to: r.to, tone: "ink" });
	}
	if (reportShown && report.open) {
		ticks.push({ key: "report", at: report.monday.getTime(), label: `Rapport week ${report.week}`, to: "/analytics", tone: "arc", onOpen: report.put });
	}
	ticks.sort((a, b) => a.at - b.at);
	const nowIndex = ticks.findIndex((t) => t.at > now.getTime());
	const split = nowIndex === -1 ? ticks.length : nowIndex;
	const time = (t: number) =>
		new Date(t).toDateString() === today
			? new Intl.DateTimeFormat("nl-NL", { hour: "2-digit", minute: "2-digit" }).format(t)
			: new Intl.DateTimeFormat("nl-NL", { weekday: "short" }).format(t);

	return (
		<div className="flex flex-col gap-3 pt-4">
			{pinned.length > 0 ? (
				<section aria-label="Vastgezet" className="flex flex-col gap-1.5">
					<h3 className="px-2 font-medium text-ink-3 text-xs">Vastgezet</h3>
					<div className="flex flex-wrap gap-1 px-1">
						{pinned.map((p) => (
							<span key={p.key} className="group/chip relative flex max-w-full">
								<Link
									to={p.to}
									onClick={p.onOpen}
									title={p.label}
									className="flex h-7 max-w-[196px] items-center gap-1.5 rounded-md bg-paper px-2 text-sm text-ink-2 shadow-[0_1px_1px_rgb(0_0_0/0.04)] transition-colors hover:text-ink group-hover/chip:pr-6"
								>
									<p.icon className="size-3 shrink-0 text-ink-3" strokeWidth={1.75} />
									<span className="truncate">{p.label}</span>
								</Link>
								{p.remove ? (
									<button
										type="button"
										onClick={p.remove}
										aria-label={`${p.label} losmaken`}
										className="absolute top-1 right-1 hidden size-5 cursor-pointer items-center justify-center rounded-sm text-ink-3 hover:bg-ink/8 hover:text-ink group-hover/chip:flex focus-visible:flex"
									>
										<X className="size-3" strokeWidth={2} />
									</button>
								) : null}
							</span>
						))}
					</div>
				</section>
			) : null}

			<section aria-label="Vandaag" className="flex flex-col">
				<h3 className="flex items-baseline justify-between px-2 pb-1 font-medium text-ink-3 text-xs">
					Vandaag
					<span className="font-normal tabular-nums">{ticks.length === 0 ? "" : `nog ${ticks.length - split}`}</span>
				</h3>
				<ol className="relative">
					{/* The ruler itself: one hairline the ticks hang from. */}
					<span aria-hidden className="absolute top-1 bottom-1 left-[47px] w-px bg-ink/12" />
					{ticks.map((t, i) => (
						<li key={t.key}>
							{i === split ? <NowMark at={time(now.getTime())} still={still} /> : null}
							<Link
								to={t.to}
								onClick={t.onOpen}
								className={cn(
									"density-row group/tick relative flex h-7 items-center rounded-md pr-2 text-sm transition-colors hover:bg-ink/6",
									i < split ? "text-ink-3" : "text-ink",
								)}
							>
								<span className="w-10 shrink-0 text-right text-2xs text-ink-3 tabular-nums">{time(t.at)}</span>
								<span
									aria-hidden
									className={cn(
										"relative mx-[3px] h-px w-[9px] shrink-0",
										t.tone === "red" ? "h-[3px] bg-signal-red" : t.tone === "amber" ? "h-[3px] bg-signal-amber" : t.tone === "arc" ? "h-[3px] bg-arc" : "bg-ink-4",
									)}
								/>
								<span className="min-w-0 flex-1 truncate pl-1.5">{t.label}</span>
							</Link>
						</li>
					))}
					{split === ticks.length ? <NowMark at={time(now.getTime())} still={still} /> : null}
				</ol>
				{ticks.length === 0 ? <p className="px-2 pt-1 text-xs text-ink-3">Vandaag staat er niets op de lijn.</p> : null}
			</section>
		</div>
	);
}

function NowMark({ at, still }: { at: string; still: boolean | null }) {
	return (
		<div className="relative flex h-5 items-center" aria-label={`Nu, ${at}`}>
			<span className="w-10 shrink-0 text-right font-medium text-2xs text-arc-ink tabular-nums">{at}</span>
			<motion.span
				aria-hidden
				className="ml-[3px] h-[2px] flex-1 origin-left rounded-full bg-arc"
				initial={still ? false : { scaleX: 0 }}
				animate={{ scaleX: 1 }}
				transition={{ duration: 0.42, ease: [0.16, 1, 0.3, 1] }}
			/>
		</div>
	);
}

/** "4h 10m" and "6h" from now, "today" at 18:00; anything measured in days is not today. */
function dueAt(due: string, now: Date): number | null {
	if (due === "today" || due === "vandaag") {
		const d = new Date(now);
		d.setHours(18, 0, 0, 0);
		return d.getTime();
	}
	const h = /(\d+)[hu]/.exec(due);
	const m = /(\d+)m/.exec(due);
	if (!h && !m) return null;
	return now.getTime() + (Number(h?.[1] ?? 0) * 60 + Number(m?.[1] ?? 0)) * 60_000;
}

function Drawer() {
	const [tab, setTab] = useState<"pinned" | "views" | "recent">("pinned");
	const pinned = usePinnedItems();
	const views = useViewItems(false);
	const recent = useRecentItems();
	const list = tab === "pinned" ? pinned : tab === "views" ? views : recent;
	const tabs = [
		["pinned", "Vastgezet", pinned.length],
		["views", "Weergaven", views.length],
		["recent", "Recent", recent.length],
	] as const;

	return (
		<section aria-label="Snelkoppelingen" className="flex flex-col pt-4">
			{/* The switch is the heading: three words, the chosen one in ink with a rule under it. */}
			<div className="flex items-center px-2 pb-1">
				<div role="tablist" aria-label="Snelkoppelingen" className="flex items-center gap-3">
					{tabs.map(([id, label, n]) => (
						<button
							key={id}
							type="button"
							role="tab"
							aria-selected={tab === id}
							onClick={() => setTab(id)}
							className={cn(
								"relative cursor-pointer pb-0.5 text-xs transition-colors",
								tab === id ? "font-medium text-ink" : "text-ink-3 hover:text-ink",
							)}
						>
							{label}
							<span className="ml-0.5 tabular-nums opacity-60">{n}</span>
							{tab === id ? (
								<motion.span layoutId="drawer-tab" className="absolute inset-x-0 -bottom-px h-px bg-ink" aria-hidden />
							) : null}
						</button>
					))}
				</div>
			</div>
			{list.length === 0 ? (
				<p className="px-2 py-1 text-xs text-ink-3">
					{tab === "views" ? "Sla een filter op als weergave, dan verschijnt die hier." : tab === "recent" ? "Wat je opent, verschijnt hier." : "Nog niets vastgezet."}
				</p>
			) : (
				list.map((it) => <Row key={it.key} item={it} />)
			)}
		</section>
	);
}

function Classic() {
	const pinned = [...useViewItems(true), ...usePinnedItems()];
	const setDraft = useViews((s) => s.setDraft);
	/* A favourite supplier opens Orders cut to that supplier, through the same filter the list's own
	   builder writes. */
	const favourites = usePins((s) => s.favourites).map((f) => ({
		key: `f-${f.to}-${f.label}`,
		to: f.to,
		label: f.label,
		icon: KIND[f.kind],
		onOpen:
			f.kind === "supplier"
				? () =>
						setDraft("orders", {
							kind: "group",
							id: "root",
							join: "and",
							children: [{ kind: "rule", id: `fav-${f.label}`, field: "supplier", op: "any", value: [f.label] }],
						})
				: undefined,
	}));
	const recent = useRecentItems();
	const [tab, setTab] = useState<"favourites" | "recent">("favourites");
	const list = tab === "favourites" ? favourites : recent;

	return (
		<div className="flex flex-col gap-2 pt-3">
			{pinned.length > 0 ? (
				<section aria-label="Vastgezet" className="flex flex-col">
					<h3 className="px-2 pt-1 pb-1 font-medium text-ink-3 text-xs">Vastgezet</h3>
					{pinned.map((p) => (
						<Row key={p.key} item={p} />
					))}
				</section>
			) : null}
			<section aria-label="Favorieten en recent" className="flex flex-col">
				<div role="tablist" className="flex items-center gap-3 px-2 pb-1">
					{(
						[
							["favourites", "Favorieten"],
							["recent", "Recent"],
						] as const
					).map(([id, label]) => (
						<button
							key={id}
							type="button"
							role="tab"
							aria-selected={tab === id}
							onClick={() => setTab(id)}
							className={cn("cursor-pointer text-xs transition-colors", tab === id ? "font-medium text-ink" : "text-ink-3 hover:text-ink")}
						>
							{label}
						</button>
					))}
				</div>
				{list.length === 0 ? <p className="px-2 py-1 text-xs text-ink-3">Wat je opent, verschijnt hier.</p> : list.map((it) => <Row key={it.key} item={it} />)}
			</section>
		</div>
	);
}

function Row({ item }: { item: Item }) {
	const Icon = item.icon;
	return (
		<div className="group/short relative flex items-center">
			<Link
				to={item.to}
				onClick={item.onOpen}
				className="density-row flex h-7 min-w-0 flex-1 items-center gap-2.5 rounded-md px-2 text-base text-ink-2 transition-colors hover:bg-ink/6 hover:text-ink"
			>
				<Icon className="size-[13px] shrink-0 text-ink-3" strokeWidth={1.75} />
				<span className="min-w-0 flex-1 truncate pr-5">{item.label}</span>
			</Link>
			{item.remove ? (
				<button
					type="button"
					onClick={item.remove}
					aria-label={`${item.label} losmaken`}
					title="Losmaken"
					className="absolute right-1 flex size-5 cursor-pointer items-center justify-center rounded-sm text-ink-3 opacity-0 transition-opacity hover:bg-ink/8 hover:text-ink focus-visible:opacity-100 group-hover/short:opacity-100"
				>
					<PinOff className="size-3" strokeWidth={1.75} />
				</button>
			) : null}
		</div>
	);
}

/**
 * Adds every record the operator opens to the head of Recent. Lives in the shell, so a record opened
 * while the panel is collapsed is still remembered.
 */
export function useRecentRecords() {
	const pathname = useRouterState({ select: (s) => s.location.pathname });
	const visit = usePins((s) => s.visit);
	const orders = useWorkspace((s) => s.orders);
	const chargebacks = useWorkspace((s) => s.chargebacks);
	const { customers, products, automations } = useShellData();

	useEffect(() => {
		const [, area, id] = pathname.split("/");
		if (!id) return;
		const found: Shortcut | undefined =
			area === "orders"
				? at(orders.find((o) => o.id === id)?.number, (n) => ({ label: `Bestelling ${n}`, kind: "order" }))
				: area === "chargebacks"
					? at(chargebacks.find((c) => c.id === id)?.case_number, (n) => ({ label: n, kind: "chargeback" }))
					: area === "customers"
						? at(customers.find((c) => c.id === id)?.name, (n) => ({ label: n, kind: "customer" }))
						: area === "products"
							? at(products.find((p) => p.id === id)?.title, (n) => ({ label: n, kind: "product" }))
							: area === "automations"
								? at(automations.find((a) => a.id === id)?.name, (n) => ({ label: n, kind: "automation" }))
								: undefined;
		if (found) visit({ ...found, to: pathname });
	}, [pathname, orders, chargebacks, visit]);
}

function at(
	value: string | undefined,
	make: (v: string) => Omit<Shortcut, "to">,
): Shortcut | undefined {
	return value === undefined ? undefined : { ...make(value), to: "" };
}
