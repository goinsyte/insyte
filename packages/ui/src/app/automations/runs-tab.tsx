import { Sheet, SheetContent, SheetDescription, SheetTitle } from "../../components/sheet";
import { AlertTriangle, Check, Clock, Minus, RefreshCcw, X } from "../../icons";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "../common/empty-state";
import { DataTable } from "../table/data-table";
import { formatDateTime } from "../lib/format";
import { cn } from "../lib/utils";
import { type RunStatus, type RunStep, VARIANTS_BY_ID, type WorkflowRun, type WorkflowState } from "./node-types";
import { runLabel } from "./runs";
import { StepTile } from "./step-tile";
import { useAutomationsSource } from "./source";

export const seconds = (ms: number) =>
	ms < 1000 ? `${ms} ms` : `${(ms / 1000).toLocaleString("nl-NL", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} s`;

export const RUN_DOT: Record<RunStatus, string> = {
	succeeded: "bg-signal-green",
	failed: "bg-signal-red",
	waiting: "bg-signal-amber",
	duplicate: "bg-ink-4",
};

export function RunStatusCell({ run }: { run: WorkflowRun }) {
	return (
		<span className="flex min-w-0 items-center gap-1.5">
			<span className={cn("size-1.5 shrink-0 rounded-full", RUN_DOT[run.status])} aria-hidden />
			<span className="truncate">{runLabel(run)}</span>
		</span>
	);
}

const RECORD_PATH = { order: "/orders/$orderId", customer: "/customers/$customerId", product: "/products/$productId", chargeback: "/chargebacks/$chargebackId" } as const;

/** A run's record as a link to it. */
export function RecordLink({ record, className }: { record: NonNullable<WorkflowRun["record"]>; className?: string }) {
	const cls = cn("font-medium text-ink underline-offset-2 hover:text-arc-ink hover:underline", className);
	if (record.kind === "order") return <Link to={RECORD_PATH.order} params={{ orderId: record.id }} className={cls}>{record.number}</Link>;
	if (record.kind === "product") return <Link to={RECORD_PATH.product} params={{ productId: record.id }} className={cls}>{record.number}</Link>;
	if (record.kind === "chargeback") return <Link to={RECORD_PATH.chargeback as never} params={{ chargebackId: record.id } as never} className={cls}>{record.number}</Link>;
	if (record.kind === "customer") return <Link to={RECORD_PATH.customer} params={{ customerId: record.id }} className={cls}>{record.number}</Link>;
	return <span className={cls}>{record.number}</span>;
}

type Cut = "all" | "failed" | "waiting" | "duplicate";
const CUTS: ReadonlyArray<{ id: Cut; label: string }> = [
	{ id: "all", label: "Alle" },
	{ id: "failed", label: "Mislukt" },
	{ id: "waiting", label: "Wacht" },
	{ id: "duplicate", label: "Dubbel" },
];

/**
 * Every run of this flow: which record started it, when, how long it took, how it went and on which
 * version. A run opens in a drawer with the steps it walked, the error in plain words with the fix,
 * and what went in. "Opnieuw" runs it again with the same key, so nothing happens twice.
 */
export function RunsTab({ workflow }: { workflow: WorkflowState }) {
	const navigate = useNavigate();
	const { run: openId } = useSearch({ strict: false }) as { run?: string };
	const [cut, setCut] = useState<Cut>("all");
	const drawerRef = useRef<HTMLDivElement>(null);
	const id = workflow.automationId;
	const { rerun } = useAutomationsSource();
	const rows = useMemo(() => (cut === "all" ? workflow.history : workflow.history.filter((r) => r.status === cut)), [workflow.history, cut]);
	const open = workflow.history.find((r) => r.id === openId) ?? null;
	const select = (runId: string | undefined) =>
		navigate({ to: "/automations/$automationId", params: { automationId: id }, search: runId ? { tab: "runs", run: runId } : { tab: "runs" }, replace: true });

	const columns = useMemo<Array<ColumnDef<WorkflowRun, unknown>>>(
		() => [
			{
				id: "event",
				accessorFn: (r) => `${r.record?.number ?? ""} ${r.record?.name ?? ""}`,
				header: "Event",
				size: 300,
				enableHiding: false,
				cell: (c) => {
					const r = c.row.original;
					return (
						<span className="flex min-w-0 items-baseline gap-2">
							<span className="shrink-0 font-medium text-ink tabular-nums">{r.record?.number ?? "Handmatig"}</span>
							<span className="truncate text-ink-3">{r.record?.name}</span>
							{r.manual ? <span className="shrink-0 rounded-sm bg-ink/6 px-1 text-ink-3 text-xs">opnieuw</span> : null}
						</span>
					);
				},
			},
			{ id: "at", accessorKey: "at", header: "Gestart", size: 150, cell: (c) => <span className="tabular-nums">{formatDateTime(c.row.original.at)}</span> },
			{ id: "duration", accessorKey: "durationMs", header: "Duur", size: 80, cell: (c) => <span className="tabular-nums">{seconds(c.row.original.durationMs)}</span> },
			{ id: "status", accessorKey: "status", header: "Status", size: 200, cell: (c) => <RunStatusCell run={c.row.original} /> },
			{ id: "version", accessorFn: (r) => r.version ?? 0, header: "Versie", size: 64, cell: (c) => <span className="tabular-nums">v{c.row.original.version ?? 1}</span> },
		],
		[],
	);

	const count = (c: Cut) => (c === "all" ? workflow.history.length : workflow.history.filter((r) => r.status === c).length);

	return (
		<div className="mx-auto flex w-full max-w-[1120px] flex-col gap-3 px-5 py-4">
			<DataTable
				columns={columns}
				data={rows}
				noun={["run", "runs"]}
				getRowId={(r) => r.id}
				searchPlaceholder="Zoek op bestelnummer of naam"
				initialSorting={[{ id: "at", desc: true }]}
				onRowClick={(r) => select(r.id)}
				toolbarEnd={
					<div role="radiogroup" aria-label="Runs tonen" className="flex items-center gap-1">
						{CUTS.map((c) => {
							const n = count(c.id);
							const on = cut === c.id;
							return (
								<button
									key={c.id}
									type="button"
									role="radio"
									aria-checked={on}
									disabled={n === 0 && c.id !== "all"}
									onClick={() => setCut(c.id)}
									className={cn(
										"flex h-7 items-center gap-1.5 rounded-full px-2.5 font-medium text-xs transition-colors disabled:opacity-40",
										on ? "bg-arc-tint text-arc-ink" : "bg-ink/5 text-ink-2 hover:bg-ink/8",
									)}
								>
									{c.label}
									<span className={cn("tabular-nums", on ? "text-arc-ink" : "text-ink-3")}>{n}</span>
								</button>
							);
						})}
					</div>
				}
				empty={
					<EmptyState
						kind="automations"
						title={workflow.history.length === 0 ? "Nog geen runs." : "Geen runs in deze selectie."}
						body={
							workflow.history.length === 0
								? workflow.version === 0
									? "Deze flow is nog niet gepubliceerd."
									: "De trigger is nog niet afgegaan."
								: "Kies Alle om elke run te zien."
						}
						{...(workflow.history.length > 0 && cut !== "all" ? { action: { label: "Alle runs tonen", onClick: () => setCut("all") } } : {})}
					/>
				}
			/>

			<Sheet open={open !== null} onOpenChange={(o) => !o && select(undefined)}>
				<SheetContent side="right" className="w-[440px] max-w-[100vw] gap-0 bg-paper p-0" showCloseButton={false} initialFocus={drawerRef}>
					{open ? (
						<RunDrawer
							ref={drawerRef}
							flow={workflow.name}
							run={open}
							onClose={() => select(undefined)}
							onRerun={() => {
								const next = rerun?.(id, open);
								if (!next) return;
								toast("Opnieuw gestart en geslaagd", { description: `${next.record?.number ?? ""} · zelfde sleutel ${next.key}, dus niets is dubbel gedaan.` });
								select(next.id);
							}}
						/>
					) : null}
				</SheetContent>
			</Sheet>
		</div>
	);
}

const STEP_ICON: Record<RunStep["status"], { icon: typeof Check; tone: string; word?: string }> = {
	ok: { icon: Check, tone: "bg-signal-green-bg text-signal-green" },
	error: { icon: X, tone: "bg-signal-red-bg text-signal-red", word: "mislukt" },
	waiting: { icon: Clock, tone: "bg-signal-amber-bg text-signal-amber", word: "wacht" },
	pending: { icon: Minus, tone: "bg-ink/6 text-ink-3", word: "nog niet" },
	skipped: { icon: Minus, tone: "bg-ink/6 text-ink-3", word: "overgeslagen" },
};

function RunDrawer({
	ref,
	flow,
	run,
	onClose,
	onRerun,
}: {
	ref: React.Ref<HTMLDivElement>;
	flow: string;
	run: WorkflowRun;
	onClose: () => void;
	onRerun: () => void;
}) {
	const steps = run.timeline ?? [];
	return (
		<div ref={ref} tabIndex={-1} className="flex h-full flex-col outline-none">
			<div className="flex items-start gap-3 px-4 pt-4 pb-3">
				<div className="flex min-w-0 flex-1 flex-col gap-0.5">
					<SheetTitle className="flex items-baseline gap-2 font-medium text-ink text-lg">
						{run.record ? <RecordLink record={run.record} /> : "Run"}
						<span className="truncate font-normal text-ink-2 text-md">{run.record?.name}</span>
					</SheetTitle>
					<SheetDescription className="truncate text-ink-3 text-xs">Run van {flow}</SheetDescription>
				</div>
				<button
					type="button"
					onClick={onRerun}
					className="flex h-8 shrink-0 items-center gap-1.5 rounded-md bg-abyss px-3 font-medium text-mesh-ink text-sm shadow-primary hover:bg-abyss-2"
				>
					<RefreshCcw className="size-3.5" />
					Opnieuw
				</button>
				<button type="button" onClick={onClose} aria-label="Sluiten" className="flex size-8 items-center justify-center rounded-md text-ink-3 hover:bg-ink/6 hover:text-ink">
					<X className="size-4" />
				</button>
			</div>

			<div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
				<dl className="grid grid-cols-[minmax(0,1.5fr)_minmax(0,1.2fr)_auto_auto] gap-3 rounded-lg bg-mist px-3 py-2.5 text-xs">
					<Fact label="Status">
						<RunStatusCell run={run} />
					</Fact>
					<Fact label="Gestart">{new Date(run.at).toLocaleString("nl-NL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</Fact>
					<Fact label="Duur">{seconds(run.durationMs)}</Fact>
					<Fact label="Versie">v{run.version ?? 1}</Fact>
				</dl>

				<p className="mt-3 text-ink-3 text-xs leading-[1.5]">
					Sleutel <span className="rounded-sm bg-ink/7 px-1 font-medium text-ink-2 tabular-nums">{run.key}</span> en de stap: opnieuw proberen doet niets dubbel.
				</p>

				{run.status === "failed" && run.error ? (
					<div className="mt-3 flex flex-col gap-1.5 rounded-lg bg-signal-red-bg px-3 py-2.5">
						<span className="flex items-center gap-1.5 font-medium text-signal-red text-sm">
							<AlertTriangle className="size-3.5" />
							Wat er misging
						</span>
						<p className="text-ink text-sm leading-[1.5]">{run.error}</p>
						{run.fix ? (
							<p className="text-ink-2 text-sm leading-[1.5]">
								<span className="font-medium text-ink">Zo los je het op: </span>
								{run.fix}
							</p>
						) : null}
					</div>
				) : null}
				{run.status === "duplicate" ? (
					<p className="mt-3 rounded-lg bg-mist px-3 py-2.5 text-ink-2 text-sm leading-[1.5]">
						Dit event kwam een tweede keer binnen met dezelfde sleutel. De eerste run deed het werk, dus deze heeft niets gedaan.
					</p>
				) : null}
				{run.status === "waiting" ? (
					<p className="mt-3 rounded-lg bg-signal-amber-bg px-3 py-2.5 text-ink-2 text-sm leading-[1.5]">
						{runLabel(run) === "Wacht op antwoord"
							? "De run wacht tot de klant antwoordt, of tot de wachttijd voorbij is. Daarna gaat hij vanzelf verder."
							: "Insyte heeft een voorstel klaargezet. De run gaat verder zodra iemand het uitvoert of negeert."}
					</p>
				) : null}

				<h3 className="mt-5 mb-1.5 font-medium text-ink text-sm">Stappen</h3>
				<ol className="flex flex-col">
					{steps.map((s, i) => {
						const v = VARIANTS_BY_ID[s.variantId];
						const st = STEP_ICON[s.status];
						const Icon = st.icon;
						return (
							<li key={`${s.nodeId}-${i}`} className="relative flex items-center gap-2.5 py-1.5">
								{i < steps.length - 1 ? <span className="absolute top-6 bottom-[-6px] left-[9px] w-px bg-ink/12" aria-hidden /> : null}
								<span className={cn("relative flex size-[19px] shrink-0 items-center justify-center rounded-full", st.tone)}>
									<Icon className="size-3" strokeWidth={2.25} />
								</span>
								{v ? <StepTile variant={v} size={16} /> : null}
								<span className={cn("min-w-0 flex-1 truncate text-sm", s.status === "skipped" || s.status === "pending" ? "text-ink-3" : "text-ink")}>{s.label}</span>
								{s.lane ? (
									<span className={cn("shrink-0 rounded-full px-1.5 text-xs", s.lane === "yes" ? "bg-signal-green-bg text-signal-green" : "bg-ink/6 text-ink-2")}>
										{s.lane === "yes" ? "Ja" : "Nee"}
									</span>
								) : null}
								<span className="w-20 shrink-0 text-right text-ink-3 text-xs tabular-nums">{st.word ?? seconds(s.ms)}</span>
							</li>
						);
					})}
				</ol>

				{run.input ? (
					<>
						<h3 className="mt-5 mb-1.5 font-medium text-ink text-sm">Invoer</h3>
						<dl className="flex flex-col rounded-lg bg-mist px-3 py-1.5">
							{Object.entries(run.input).map(([k, val]) => (
								<div key={k} className="flex items-baseline justify-between gap-3 py-1 text-sm [&+div]:shadow-[inset_0_1px_0_color-mix(in_oklch,var(--ink)_7%,transparent)]">
									<dt className="text-ink-3">{k}</dt>
									<dd className="truncate text-ink tabular-nums">{val}</dd>
								</div>
							))}
						</dl>
					</>
				) : null}
			</div>
		</div>
	);
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<div className="flex min-w-0 flex-col gap-0.5">
			<dt className="text-ink-3">{label}</dt>
			<dd className="truncate font-medium text-ink tabular-nums">{children}</dd>
		</div>
	);
}
