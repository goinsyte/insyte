import { Check, Copy, ExternalLink, Pause, RotateCcw, UserPlus, X } from "../../icons";
import { useNavigate, getRouteApi } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AffiliateDialog, AffiliateInviteDialog, DecideDialog } from "./dialogs";
import { EmptyState } from "../common/empty-state";
import { PageGuide } from "../common/page-guide";
import { PageHeader } from "../common/page-header";
import { StatusPill } from "../settings/setting-card";
import { DataTable, type RowAction } from "../table/data-table";
import { AddressDisc, PersonDisc, WELL_BTN } from "../team/bits";
import { counted } from "../lib/bulk";
import { formatCurrency, formatDate, formatRelative } from "../lib/format";
import { type Application, PAYOUT_MONTH, type PayoutLine, type ProgramAffiliate, tierOf } from "../../data-source";
import { inviteUrl } from "../lib/team";
import { undoable } from "../lib/undo";
import { cn } from "../lib/utils";
import { useProgram } from "../stores/affiliate-program-store";
import { type View } from "./affiliates-search";

const Route = getRouteApi("/_admin/affiliates");

const TITLE: Record<View, string> = {
	actief: "Affiliates",
	aanmeldingen: "Aanmeldingen",
	uitbetalingen: "Uitbetalingen",
	uitnodigingen: "Uitnodigingen",
};

const GUIDE = [
	{ title: "Affiliates", body: "Mensen die al over je producten praten. Ze verdienen een percentage van elke bestelling via hun code.", art: "people" },
	{ title: "Aanmeldingen", body: "Wie zich aanmeldt voor het partnerprogramma staat hier met kanaal, bereik en waarom, tot je goedkeurt of afwijst.", art: "roles" },
	{ title: "Uitbetalingen", body: "Commissie staat hier per maand, klaar om goed te keuren na de retourtermijn van 14 dagen.", art: "budget" },
	{ title: "Uitnodigingen", body: "Wie je uitnodigt, slaat de aanmelding over en begint op het niveau dat je kiest.", art: "link" },
] as const;

const day = (t: number) => formatDate(new Date(t), { day: "numeric", month: "long", year: undefined });
const dated = (t: number) => formatDate(new Date(t), { day: "numeric", month: "short", year: "numeric" });

/**
 * The partner programme, from the brand's side: who is in and on what tier, who has applied, this
 * month's commission to approve, and who has been asked. The affiliate's own pages read the same
 * figures; approving here is what moves a month from "in the window" to "approved" over there.
 */
export function AffiliatesPage() {
	const { view = "actief" } = Route.useSearch();
	const affiliates = useProgram((s) => s.affiliates);
	const applications = useProgram((s) => s.applications);
	const payouts = useProgram((s) => s.payouts);
	const approved = useProgram((s) => s.approved);
	const [inviting, setInviting] = useState(false);
	const pending = applications.filter((a) => a.status === "pending");
	const toApprove = payouts.filter((p) => !approved[p.affiliateId] && p.approvable > 0).reduce((n, p) => n + p.approvable, 0);

	const meta =
		view === "actief"
			? `${counted(affiliates.filter((a) => !a.paused).length, "actief", "actief")} · ${counted(pending.length, "aanmelding", "aanmeldingen")} · ${toApprove > 0 ? `${formatCurrency(toApprove)} te keuren` : "niets te keuren"}`
			: view === "aanmeldingen"
				? `${pending.length} te beoordelen`
				: view === "uitbetalingen"
					? `${PAYOUT_MONTH.label} · uitbetaling op ${day(PAYOUT_MONTH.payDay)}`
					: undefined;

	return (
		<div className="flex min-w-0 flex-col">
			<PageHeader
				title={TITLE[view]}
				crumbs={view === "actief" ? [] : [{ label: "Affiliates", to: "/affiliates" }]}
				meta={meta}
				actions={
					<button type="button" onClick={() => setInviting(true)} className="flex h-8 items-center gap-1.5 rounded-md bg-abyss px-3 font-medium text-mesh-ink text-sm shadow-primary transition-colors hover:bg-abyss-2">
						<UserPlus className="size-3.5" strokeWidth={1.75} />
						Affiliate uitnodigen
					</button>
				}
			/>
			<div className="min-w-0 px-5 pb-8">
				{view === "actief" ? <Active onInvite={() => setInviting(true)} /> : null}
				{view === "aanmeldingen" ? <Applications /> : null}
				{view === "uitbetalingen" ? <Payouts /> : null}
				{view === "uitnodigingen" ? <Invites onInvite={() => setInviting(true)} /> : null}
			</div>
			<AffiliateInviteDialog open={inviting} onOpenChange={setInviting} />
			<PageGuide id="affiliates" title="Affiliates" steps={GUIDE} />
		</div>
	);
}

/* ── active ────────────────────────────────────────────────────────────────────────────────────── */

const ACTIVE_ACTIONS: ReadonlyArray<RowAction<ProgramAffiliate>> = [
	{
		id: "pause",
		label: "Commissie pauzeren of hervatten",
		icon: Pause,
		group: "Programma",
		shortcut: "p",
		bar: true,
		run: (rows) => {
			const before = useProgram.getState().snapshot();
			for (const r of rows) useProgram.getState().togglePause(r.id);
			undoable(rows.length === 1 ? `${rows[0]?.name} ${rows[0]?.paused ? "hervat" : "gepauzeerd"}` : `${counted(rows.length, "affiliate", "affiliates")} omgezet`, () => useProgram.getState().restore(before));
		},
	},
];

function Active({ onInvite }: { onInvite: () => void }) {
	const affiliates = useProgram((s) => s.affiliates);
	const [open, setOpen] = useState<string | null>(null);
	const columns = useMemo<Array<ColumnDef<ProgramAffiliate, unknown>>>(
		() => [
			{
				id: "name",
				accessorFn: (a) => `${a.name} ${a.email}`,
				header: "Affiliate",
				size: 280,
				enableHiding: false,
				cell: (c) => {
					const a = c.row.original;
					return (
						<span className="flex min-w-0 items-center gap-2.5">
							<PersonDisc seed={a.id} name={a.name} />
							<span className="flex min-w-0 flex-col">
								<span className="truncate font-medium text-ink">{a.name}</span>
								<span className="truncate text-ink-3 text-xs">{a.email}</span>
							</span>
						</span>
					);
				},
			},
			{ id: "code", accessorKey: "code", header: "Code", size: 110, cell: (c) => <span className="font-medium text-ink">{c.row.original.code}</span> },
			{ id: "tier", accessorFn: (a) => tierOf(a.tier).label, header: "Niveau", size: 100 },
			{ id: "rate", accessorKey: "rate", header: "Commissie", size: 100, cell: (c) => <span className="tabular-nums">{c.row.original.rate}%</span> },
			{ id: "conversions", accessorKey: "conversions", header: "Conversies", size: 110, cell: (c) => <span className="tabular-nums">{c.row.original.conversions.toLocaleString("nl-NL")}</span> },
			{ id: "earned", accessorKey: "earned", header: "Verdiend", size: 120, cell: (c) => <span className="font-medium text-ink tabular-nums">{formatCurrency(c.row.original.earned)}</span> },
			{ id: "joined", accessorFn: (a) => new Date(a.joinedAt).toISOString(), header: "Sinds", size: 120, cell: (c) => <span className="text-ink-2">{dated(c.row.original.joinedAt)}</span> },
			{
				id: "state",
				accessorFn: (a) => (a.paused ? "Gepauzeerd" : "Actief"),
				header: "Status",
				size: 120,
				cell: (c) => <StatusPill tone={c.row.original.paused ? "warning" : "success"} label={c.row.original.paused ? "Gepauzeerd" : "Actief"} />,
			},
		],
		[],
	);
	return (
		<>
			<DataTable
				columns={columns}
				data={affiliates}
				actions={ACTIVE_ACTIONS}
				label={["affiliate", "affiliates"]}
				getRowId={(a) => a.id}
				searchPlaceholder="Affiliates zoeken"
				initialSorting={[{ id: "earned", desc: true }]}
				onRowClick={(a) => setOpen(a.id)}
				empty={
					<EmptyState
						kind="people"
						title="Nog geen affiliates."
						body="Nodig iemand uit of wacht op aanmeldingen."
						action={{ label: "Affiliate uitnodigen", onClick: onInvite }}
					/>
				}
			/>
			<AffiliateDialog id={open} onClose={() => setOpen(null)} />
		</>
	);
}

/* ── applications ──────────────────────────────────────────────────────────────────────────────── */

function handleOf(a: Application) {
	const h = a.name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z]+/g, "");
	const site = a.email.split("@")[1] ?? "";
	if (a.channel.startsWith("Instagram")) return `instagram.com/${h}`;
	if (a.channel.startsWith("TikTok")) return `tiktok.com/@${h}`;
	if (a.channel.startsWith("YouTube")) return `youtube.com/@${h}`;
	if (a.channel.startsWith("Pinterest")) return `pinterest.com/${h}`;
	return /gmail|hotmail|outlook/.test(site) ? `${h}.nl` : site;
}

/**
 * Applications as a queue with a reading pane, the way notifications work: compact rows on the
 * left with the decision one click away, the selected one's whole pitch, audience, links and
 * history on the right. J and K walk the list.
 */
function Applications() {
	const applications = useProgram((s) => s.applications);
	const [deciding, setDeciding] = useState<{ app: Application; mode: "approve" | "reject" } | null>(null);
	const pending = applications.filter((a) => a.status === "pending").sort((a, b) => b.appliedAt - a.appliedAt);
	const decided = applications.filter((a) => a.status !== "pending").sort((a, b) => (b.decidedAt ?? 0) - (a.decidedAt ?? 0));
	const ordered = [...pending, ...decided];
	const [activeId, setActiveId] = useState<string | null>(null);
	const [paneOpen, setPaneOpen] = useState(false);
	const active = ordered.find((a) => a.id === activeId) ?? ordered[0];

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			const t = e.target as HTMLElement | null;
			if (t?.closest("input, textarea, [role=dialog], [contenteditable=true]") || e.metaKey || e.ctrlKey) return;
			if (e.key !== "j" && e.key !== "k") return;
			const i = ordered.findIndex((a) => a.id === active?.id);
			const next = ordered[Math.min(ordered.length - 1, Math.max(0, i + (e.key === "j" ? 1 : -1)))];
			if (next) setActiveId(next.id);
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [ordered, active?.id]);

	if (ordered.length === 0) {
		return <EmptyState kind="people" title="Geen aanmeldingen te beoordelen." body="Nieuwe aanmeldingen komen hier binnen." />;
	}

	const row = (a: Application, i: number) => (
		<li key={a.id}>
			{/* biome-ignore lint/a11y/useSemanticElements: a row holding its own buttons */}
			<div
				role="button"
				tabIndex={0}
				aria-current={a.id === active?.id}
				onClick={() => {
					setActiveId(a.id);
					setPaneOpen(true);
				}}
				onKeyDown={(e) => {
					if (e.key === "Enter") {
						setActiveId(a.id);
						setPaneOpen(true);
					}
				}}
				className={cn(
					"group flex h-12 cursor-pointer items-center gap-3 rounded-md px-2.5 transition-colors",
					a.id === active?.id ? "bg-arc-tint" : i % 2 === 0 ? "bg-mist hover:bg-ink/6" : "hover:bg-ink/4",
				)}
			>
				<PersonDisc seed={a.id} name={a.name} />
				<span className="flex min-w-0 flex-1 items-baseline gap-2">
					<span className={cn("shrink-0 font-medium text-base", a.id === active?.id ? "text-arc-ink" : "text-ink")}>{a.name}</span>
					<span className="truncate text-ink-2 text-sm">
						{a.channel} · {a.audience}
					</span>
				</span>
				{a.status === "pending" ? (
					<>
						<span className="hidden shrink-0 text-ink-3 text-sm tabular-nums md:inline">{day(a.appliedAt)}</span>
						<span className="flex shrink-0 gap-1">
							<button
								type="button"
								onClick={(e) => {
									e.stopPropagation();
									setDeciding({ app: a, mode: "reject" });
								}}
								className="hidden h-7 items-center rounded-md px-2 font-medium text-ink-2 text-sm hover:bg-ink/6 hover:text-ink sm:flex"
							>
								Afwijzen
							</button>
							<button
								type="button"
								onClick={(e) => {
									e.stopPropagation();
									setDeciding({ app: a, mode: "approve" });
								}}
								className={cn(
									"flex h-7 items-center gap-1 rounded-md px-2.5 font-medium text-sm transition-colors",
									a.id === active?.id ? "bg-abyss text-mesh-ink hover:bg-abyss-2" : "field text-ink hover:field-hover",
								)}
							>
								<Check className="size-3.5" strokeWidth={2} />
								<span className="max-sm:sr-only">Goedkeuren</span>
							</button>
						</span>
					</>
				) : (
					<StatusPill tone={a.status === "approved" ? "success" : "neutral"} label={a.status === "approved" ? "Goedgekeurd" : "Afgewezen"} />
				)}
			</div>
		</li>
	);

	return (
		<div className="flex min-h-[calc(100svh-140px)] gap-4">
			<section className="flex min-w-0 flex-1 flex-col gap-1" aria-label="Aanmeldingen">
				<h2 className="flex h-8 items-center gap-2 px-2.5 font-medium text-ink-3 text-xs">
					Te beoordelen <span className="tabular-nums">{pending.length}</span>
					<span className="ml-auto hidden font-normal sm:inline">
						<kbd className="font-medium">J</kbd> en <kbd className="font-medium">K</kbd> om te lopen
					</span>
				</h2>
				{pending.length === 0 ? <p className="px-2.5 py-3 text-ink-2 text-sm">Alles is beoordeeld.</p> : <ul className="flex flex-col">{pending.map(row)}</ul>}
				{decided.length > 0 ? (
					<>
						<h2 className="mt-4 flex h-8 items-center gap-2 px-2.5 font-medium text-ink-3 text-xs">
							Beoordeeld <span className="tabular-nums">{decided.length}</span>
						</h2>
						<ul className="flex flex-col">{decided.map(row)}</ul>
					</>
				) : null}
			</section>

			<aside
				className={cn(
					"flex-col bg-mist lg:sticky lg:top-0 lg:max-h-[calc(100svh-120px)] lg:self-start lg:rounded-xl",
					paneOpen ? "fixed inset-0 z-40 flex lg:static" : "hidden lg:flex",
					"lg:w-[420px] lg:shrink-0 xl:w-[520px]",
				)}
				aria-label="Aanmelding"
			>
				{active ? <ApplicationPane app={active} onClose={() => setPaneOpen(false)} onDecide={(mode) => setDeciding({ app: active, mode })} /> : null}
			</aside>
			<DecideDialog app={deciding?.app ?? null} mode={deciding?.mode ?? "approve"} onClose={() => setDeciding(null)} />
		</div>
	);
}

function ApplicationPane({ app, onClose, onDecide }: { app: Application; onClose: () => void; onDecide: (m: "approve" | "reject") => void }) {
	const link = handleOf(app);
	const history = [
		{ at: app.appliedAt, label: `Aangemeld via ${app.channel}` },
		...(app.decidedAt ? [{ at: app.decidedAt, label: app.status === "approved" ? "Goedgekeurd" : "Afgewezen", detail: app.reason }] : []),
	];
	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<header className="flex items-start gap-3 px-5 pt-5 pb-4">
				<PersonDisc seed={app.id} name={app.name} size={40} />
				<div className="flex min-w-0 flex-1 flex-col gap-0.5">
					<h2 className="flex flex-wrap items-center gap-2 font-medium text-ink text-xl">
						{app.name}
						{app.status === "pending" ? null : <StatusPill tone={app.status === "approved" ? "success" : "neutral"} label={app.status === "approved" ? "Goedgekeurd" : "Afgewezen"} />}
					</h2>
					<a href={`mailto:${app.email}`} className="truncate text-arc-ink text-sm hover:underline">
						{app.email}
					</a>
				</div>
				<button type="button" onClick={onClose} aria-label="Sluiten" className="-mt-1 -mr-2 flex size-8 items-center justify-center rounded-md text-ink-3 hover:bg-ink/6 hover:text-ink lg:hidden">
					<X className="size-4" strokeWidth={1.75} />
				</button>
			</header>
			<div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 pb-5">
				<dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg bg-paper">
					{[
						["Kanaal", app.channel],
						["Bereik", app.audience],
						["Aangemeld", day(app.appliedAt)],
						["Start op", app.status === "approved" ? "Goedgekeurd" : "Brons · 10%"],
					].map(([k, v]) => (
						<div key={k} className="flex min-w-0 flex-col gap-0.5 px-3 py-2.5">
							<dt className="text-ink-3 text-xs">{k}</dt>
							<dd className="truncate font-medium text-base text-ink">{v}</dd>
						</div>
					))}
				</dl>
				<section className="flex flex-col gap-1.5">
					<h3 className="font-medium text-ink-3 text-xs">Waarom</h3>
					<p className="max-w-[60ch] text-base text-ink leading-relaxed">{app.motivation}</p>
				</section>
				<section className="flex flex-col gap-1.5">
					<h3 className="font-medium text-ink-3 text-xs">Links</h3>
					<a href={`https://${link}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-arc-ink text-base hover:underline">
						<ExternalLink className="size-3.5" strokeWidth={1.75} />
						{link}
					</a>
				</section>
				<section className="flex flex-col gap-1.5">
					<h3 className="font-medium text-ink-3 text-xs">Geschiedenis</h3>
					<ol className="flex flex-col gap-2 border-hairline border-l pl-3">
						{history.map((h) => (
							<li key={h.label} className="flex flex-col">
								<span className="text-base text-ink">{h.label}</span>
								<span className="text-ink-3 text-sm">
									{day(h.at)}
									{h.detail ? ` · ${h.detail}` : ""}
								</span>
							</li>
						))}
					</ol>
				</section>
			</div>
			<footer className="flex items-center justify-end gap-1.5 px-5 py-3 shadow-[inset_0_1px_0_color-mix(in_oklch,var(--ink)_7%,transparent)]">
				{app.status === "pending" ? (
					<>
						<button type="button" onClick={() => onDecide("reject")} className="flex h-9 items-center rounded-lg px-3 font-medium text-base text-ink-2 hover:bg-ink/6 hover:text-ink">
							Afwijzen
						</button>
						<button type="button" onClick={() => onDecide("approve")} className="flex h-9 items-center gap-1.5 rounded-lg bg-abyss px-3.5 font-medium text-base text-mesh-ink shadow-primary hover:bg-abyss-2">
							<Check className="size-4" strokeWidth={2} />
							Goedkeuren
						</button>
					</>
				) : app.status === "rejected" ? (
					<button type="button" onClick={() => onDecide("approve")} className={WELL_BTN}>
						Toch goedkeuren
					</button>
				) : (
					<span className="text-ink-3 text-sm">Doet mee sinds {app.decidedAt ? day(app.decidedAt) : "kort"}.</span>
				)}
			</footer>
		</div>
	);
}

/* ── payouts ───────────────────────────────────────────────────────────────────────────────────── */

type PayoutRow = PayoutLine & { approvedAt?: number };

function approve(rows: ReadonlyArray<PayoutRow>) {
	const ready = rows.filter((r) => !r.approvedAt && r.approvable > 0);
	if (ready.length === 0) return;
	const before = useProgram.getState().snapshot();
	useProgram.getState().approvePayouts(ready.map((r) => r.affiliateId));
	const sum = ready.reduce((n, r) => n + r.approvable, 0);
	undoable(
		ready.length === 1 ? `${formatCurrency(sum)} voor ${ready[0]?.name} goedgekeurd` : `${formatCurrency(sum)} voor ${counted(ready.length, "affiliate", "affiliates")} goedgekeurd`,
		() => useProgram.getState().restore(before),
		`Wordt uitbetaald op ${day(PAYOUT_MONTH.payDay)}. Wat nog in de retourtermijn zit, volgt vanzelf.`,
	);
}

const PAYOUT_ACTIONS: ReadonlyArray<RowAction<PayoutRow>> = [
	{ id: "approve", label: "Goedkeuren", icon: Check, group: "Uitbetaling", shortcut: "g", bar: true, applies: (r) => !r.approvedAt && r.approvable > 0, run: (rows) => approve(rows) },
];

function Payouts() {
	const payouts = useProgram((s) => s.payouts);
	const approved = useProgram((s) => s.approved);
	const rows = useMemo<PayoutRow[]>(() => payouts.map((p) => ({ ...p, approvedAt: approved[p.affiliateId] })), [payouts, approved]);
	const open = rows.filter((r) => !r.approvedAt && r.approvable > 0);
	const openSum = open.reduce((n, r) => n + r.approvable, 0);
	const doneSum = rows.filter((r) => r.approvedAt).reduce((n, r) => n + r.approvable, 0);
	const window = rows.reduce((n, r) => n + r.inWindow, 0);

	const columns = useMemo<Array<ColumnDef<PayoutRow, unknown>>>(
		() => [
			{
				id: "name",
				accessorKey: "name",
				header: "Affiliate",
				size: 240,
				enableHiding: false,
				cell: (c) => (
					<span className="flex min-w-0 items-center gap-2.5">
						<PersonDisc seed={c.row.original.affiliateId} name={c.row.original.name} />
						<span className="truncate font-medium text-ink">{c.row.original.name}</span>
					</span>
				),
			},
			{ id: "orders", accessorKey: "orders", header: "Bestellingen", size: 110, cell: (c) => <span className="tabular-nums">{c.row.original.orders}</span> },
			{ id: "approvable", accessorKey: "approvable", header: "Na retourtermijn", size: 140, cell: (c) => <span className="font-medium text-ink tabular-nums">{formatCurrency(c.row.original.approvable)}</span> },
			{ id: "window", accessorKey: "inWindow", header: "In retourtermijn", size: 140, cell: (c) => <span className="text-ink-2 tabular-nums">{formatCurrency(c.row.original.inWindow)}</span> },
			{
				id: "reversed",
				accessorKey: "reversed",
				header: "Teruggedraaid",
				size: 130,
				cell: (c) => <span className="text-ink-2 tabular-nums">{c.row.original.reversed > 0 ? `−${formatCurrency(c.row.original.reversed)}` : "—"}</span>,
			},
			{ id: "method", accessorKey: "method", header: "Naar", size: 150 },
			{
				id: "state",
				accessorFn: (r) => (r.approvedAt ? "Goedgekeurd" : r.approvable > 0 ? "Te keuren" : "Niets te keuren"),
				header: "Status",
				size: 170,
				cell: (c) => {
					const r = c.row.original;
					if (r.approvedAt) return <StatusPill tone="success" label="Goedgekeurd" />;
					if (r.approvable === 0) return <StatusPill tone="neutral" label="Niets te keuren" />;
					return (
						<button
							type="button"
							onClick={(e) => {
								e.stopPropagation();
								approve([r]);
							}}
							className="flex h-7 items-center gap-1 rounded-md bg-abyss px-2.5 font-medium text-mesh-ink text-xs hover:bg-abyss-2"
						>
							<Check className="size-3" strokeWidth={2.25} />
							Goedkeuren
						</button>
					);
				},
			},
		],
		[],
	);

	if (payouts.length === 0) {
		return <EmptyState kind="people" title="Nog niets uit te betalen." body="Commissie verschijnt hier per maand." />;
	}

	return (
		<div className="flex flex-col gap-4">
			<section className="flex flex-wrap items-end justify-between gap-4 rounded-xl bg-mist px-5 py-4">
				<div className="flex flex-col gap-1">
					<span className="text-ink-2 text-sm">
						{PAYOUT_MONTH.label} · {open.length === 0 ? "alles goedgekeurd" : `${counted(open.length, "affiliate", "affiliates")} te keuren`}
					</span>
					<span className="font-medium text-3xl text-ink tabular-nums">{formatCurrency(open.length === 0 ? doneSum : openSum)}</span>
					<span className="text-ink-3 text-sm tabular-nums">
						{doneSum > 0 && open.length > 0 ? `${formatCurrency(doneSum)} al goedgekeurd · ` : ""}
						{formatCurrency(window)} nog in de retourtermijn · uitbetaling op {day(PAYOUT_MONTH.payDay)}
					</span>
				</div>
				<button
					type="button"
					disabled={open.length === 0}
					onClick={() => approve(open)}
					className="flex h-9 items-center gap-1.5 rounded-lg bg-abyss px-3.5 font-medium text-base text-mesh-ink shadow-primary hover:bg-abyss-2 disabled:cursor-not-allowed disabled:opacity-50"
				>
					<Check className="size-4" strokeWidth={2} />
					{open.length === 0 ? "Alles goedgekeurd" : `Alles goedkeuren · ${formatCurrency(openSum)}`}
				</button>
			</section>
			<DataTable columns={columns} data={rows} actions={PAYOUT_ACTIONS} label={["uitbetaling", "uitbetalingen"]} getRowId={(r) => r.affiliateId} searchPlaceholder="Affiliates zoeken" initialSorting={[{ id: "approvable", desc: true }]} />
		</div>
	);
}

/* ── invitations ───────────────────────────────────────────────────────────────────────────────── */

function Invites({ onInvite }: { onInvite: () => void }) {
	const invites = useProgram((s) => s.invites);
	const navigate = useNavigate();
	if (invites.length === 0) {
		return (
			<EmptyState
				kind="people"
				title="Geen uitnodigingen open."
				body="Open uitnodigingen staan hier."
				action={{ label: "Affiliate uitnodigen", onClick: onInvite }}
			/>
		);
	}
	return (
		<div className="max-w-[880px]">
			<ul className="flex flex-col gap-1 [&>li]:rounded-lg [&>li]:bg-mist">
				{invites.map((i) => {
					const expired = i.expiresAt <= Date.now();
					const t = tierOf(i.tier);
					return (
						<li key={i.id} className="flex min-h-14 flex-wrap items-center gap-3 px-3.5 py-2.5 sm:flex-nowrap">
							<AddressDisc email={i.email} />
							<div className="flex min-w-0 flex-1 basis-[220px] flex-col">
								<span className="flex items-center gap-2">
									<span className="truncate font-medium text-base text-ink">{i.name}</span>
									{expired ? <StatusPill tone="warning" label="Verlopen" /> : null}
								</span>
								<span className="truncate text-ink-2 text-sm">
									{i.email} · {t.label} {t.rate}% · verstuurd {formatRelative(new Date(i.sentAt))} · <span className={cn(expired && "text-signal-amber")}>{expired ? "verlopen" : "verloopt"} {formatRelative(new Date(i.expiresAt))}</span>
								</span>
							</div>
							<div className="ml-auto flex shrink-0 gap-1.5">
								<button
									type="button"
									onClick={() => {
										const before = useProgram.getState().snapshot();
										useProgram.getState().resendInvite(i.id);
										undoable(`Opnieuw verstuurd naar ${i.email}`, () => useProgram.getState().restore(before));
									}}
									className={WELL_BTN}
								>
									<RotateCcw className="size-3.5" strokeWidth={1.75} />
									Opnieuw versturen
								</button>
								<button
									type="button"
									aria-label="Link kopiëren"
									title="Link kopiëren"
									onClick={() =>
										void navigator.clipboard.writeText(inviteUrl(i.id)).then(
											() => toast.success("Link gekopieerd"),
											() => toast.error("Kopiëren lukte niet", { description: inviteUrl(i.id) }),
										)
									}
									className={cn(WELL_BTN, "w-8 px-0")}
								>
									<Copy className="size-3.5" strokeWidth={1.75} />
								</button>
								<button
									type="button"
									aria-label="Bekijken zoals zij het zien"
									title="Bekijken zoals zij het zien"
									onClick={() => void navigate({ to: "/invitations/$invitationId", params: { invitationId: i.id } })}
									className={cn(WELL_BTN, "w-8 px-0")}
								>
									<ExternalLink className="size-3.5" strokeWidth={1.75} />
								</button>
								<button
									type="button"
									onClick={() => {
										const before = useProgram.getState().snapshot();
										useProgram.getState().removeInvite(i.id);
										undoable(`Uitnodiging aan ${i.name} ingetrokken`, () => useProgram.getState().restore(before));
									}}
									className="flex h-8 items-center rounded-md px-2.5 font-medium text-signal-red text-sm hover:bg-signal-red-bg"
								>
									Intrekken
								</button>
							</div>
						</li>
					);
				})}
			</ul>
		</div>
	);
}
