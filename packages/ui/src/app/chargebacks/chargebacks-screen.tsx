import { useNavigate } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { Copy, Download, FileText, Plus, Send, Sparkles, XCircle } from "../../icons";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchCut } from "../filters/use-search-cut";
import { useOnCreate } from "../stores/create-intent";
import { toast } from "sonner";
import { useAskInsyte } from "../shell/ask-insyte-context";
import { OPEN_AS_MODAL } from "../common/detail-shell";
import { EmptyState } from "../common/empty-state";
import { AreaEmpty } from "../common/area-empty";
import {
	Field,
	FormDialog,
	SelectField,
	TextAreaField,
	TextField,
} from "../common/form-dialog";
import { PageHeader } from "../common/page-header";
import {
	DataTable,
	type Facet,
	facetFilter,
	type RowAction,
} from "../table/data-table";
import { copyLines, counted, exportCsv } from "../lib/bulk-io";
import { formatCurrency } from "../lib/format";
import { BrandLogo } from "../marketplace/brand-logos";
import type { Chargeback, ChargebackStatus, Currency } from "../lib/types/domain";
import { cn } from "../lib/utils";
import { canRole, permissionName } from "../lib/permissions";
import { useGateRole } from "../access/gate-role";
import { ConfirmDialog } from "../common/confirm-dialog";
import { type ChargebackCommands, type NewChargebackInput, REASONS, useChargebacksListSource } from "./source";

const FACETS: ReadonlyArray<Facet> = [
	{
		id: "status",
		label: "Status",
		options: [
			{ value: "open", label: "Open" },
			{ value: "awaiting_evidence", label: "Wacht op bewijs" },
			{ value: "submitted", label: "Ingediend" },
			{ value: "won", label: "Gewonnen" },
			{ value: "lost", label: "Verloren" },
		],
	},
	{
		id: "channel",
		label: "Kanaal",
		options: [
			{ value: "paypal", label: "PayPal" },
			{ value: "klarna", label: "Klarna" },
			{ value: "stripe", label: "Stripe" },
		],
	},
];

const isOpenCase = (c: Chargeback) => c.status === "open" || c.status === "awaiting_evidence";

/* The selection bar's actions on cases. Drawing a pack is the same pack the case screen draws;
   submitting goes as one, and accepting is confirmed first: neither can be taken back. What the
   host cannot do yet is not offered. */
const caseActions = (
	commands: ChargebackCommands,
	accept: (rows: Array<Chargeback>) => void,
): ReadonlyArray<RowAction<Chargeback>> => [
	...(commands.draw
		? [
				{
					id: "draw",
					needs: { perm: "chargebacks", arg: 2 },
					label: "Bewijspakketten samenstellen",
					icon: Sparkles,
					group: "Bewijs",
					shortcut: "e",
					bar: true,
					applies: (c: Chargeback) => isOpenCase(c),
					run: (rows: Array<Chargeback>) => {
						for (const c of rows) void commands.draw?.(c.id);
						toast(`${counted(rows.length, "bewijspakket", "bewijspakketten")} in de maak`, {
							description: "Elk pakket verschijnt bij zijn zaak zodra de documenten verzameld zijn.",
						});
					},
				} satisfies RowAction<Chargeback>,
			]
		: []),
	...(commands.submit
		? [
				{
					id: "submit",
					needs: { perm: "disputes.write" },
					label: "Indienen bij aanbieder",
					icon: Send,
					group: "Bewijs",
					shortcut: "s",
					bar: true,
					applies: (c: Chargeback) => isOpenCase(c) && c.evidence_files.length > 0,
					run: (rows: Array<Chargeback>) => commands.submit?.(rows),
				} satisfies RowAction<Chargeback>,
			]
		: []),
	{
		id: "copy",
		label: "Zaaknummers kopiëren",
		icon: Copy,
		group: "Export",
		shortcut: "c",
		run: (rows) => copyLines(rows.map((c) => c.case_number), counted(rows.length, "zaaknummer", "zaaknummers")),
	},
	{
		id: "csv",
		needs: { perm: "data.export" },
		label: "Exporteren als CSV",
		icon: Download,
		group: "Export",
		run: (rows) =>
			exportCsv(
				"chargebacks",
				["Zaak", "Aanbieder", "Klant", "Bedrag", "Status", "Deadline"],
				rows.map((c) => [c.case_number, c.provider, c.customer_name, c.amount, STATUS_STYLE[c.status].label, c.deadline_at]),
			),
	},
	{
		id: "summary",
		label: "Samenvatting voor het team kopiëren",
		icon: FileText,
		group: "Export",
		run: (rows) =>
			copyLines(
				rows.map((c) => `${c.case_number} · ${c.customer_name} · ${formatCurrency(c.amount, c.currency)} · ${STATUS_STYLE[c.status].label.toLowerCase()}`),
				"een samenvatting",
			),
	},
	{
		id: "accept",
		needs: { perm: "chargebacks", arg: 3 },
		label: "Accepteren als verloren",
		icon: XCircle,
		group: "Danger",
		destructive: true,
		applies: (c) => isOpenCase(c),
		run: accept,
	},
];

export function ChargebacksPage() {
	const navigate = useNavigate();
	const ask = useAskInsyte();

	// The cases are the host's, so a submission on the detail screen is a submission here.
	const source = useChargebacksListSource();
	const { cases: data, commands } = source;
	const [newOpen, setNewOpen] = useState(false);
	const [accepting, setAccepting] = useState<Array<Chargeback> | null>(null);
	const actions = useMemo(() => caseActions(commands, setAccepting), [commands]);
	const role = useGateRole();
	const createBlocked =
		role !== null && !canRole(role, "chargebacks", 2) ? `Je rol ${role.label} mist ${permissionName("chargebacks", 2)}` : undefined;
	useOnCreate("evidence", useCallback(() => setNewOpen(true), []));
	useSearchCut("chargebacks", "tab", {
		action_required: { field: "status", values: ["open", "awaiting_evidence"] },
		submitted: { field: "status", values: ["submitted"] },
		won: { field: "status", values: ["won"] },
		lost: { field: "status", values: ["lost"] },
	});

	const openCases = useMemo(
		() =>
			data.filter(
				(c) => c.status === "open" || c.status === "awaiting_evidence",
			),
		[data],
	);

	const standing = useMemo(() => {
		const { open, wonPct, recovered, currency } = source.standing;
		return `${open} ${open === 1 ? "heeft" : "hebben"} bewijs nodig · ${wonPct}% van de beslechte zaken gewonnen · ${formatCurrency(
			recovered,
			currency,
		)} teruggehaald`;
	}, [source.standing]);

	function reviewAndSubmit() {
		const target = openCases[0];
		if (target === undefined) {
			toast("Geen zaken die op bewijs wachten om in te dienen");
			return;
		}
		commands.submit?.([target]);
	}

	function editPack() {
		const target = openCases[0];
		if (target === undefined) {
			toast("Geen open bewijspakket om te bewerken");
			return;
		}
		navigate({
			to: "/chargebacks/$chargebackId",
			params: { chargebackId: target.id },
		});
	}

	const columns = useMemo<Array<ColumnDef<Chargeback, unknown>>>(
		() => [
			{
				id: "case",
				accessorKey: "case_number",
				header: "Zaak",
				size: 104,
				enableHiding: false,
				cell: (c) => (
					<span className="font-medium text-ink">
						{c.row.original.case_number}
					</span>
				),
			},
			{
				id: "customer",
				accessorKey: "customer_name",
				header: "Klant",
				size: 168,
				cell: (c) => (
					<span className="text-ink">{c.row.original.customer_name}</span>
				),
			},
			{
				id: "reason",
				accessorKey: "reason",
				header: "Reden",
				cell: (c) => (
					<span className="block max-w-[240px] truncate">
						{c.row.original.reason}
					</span>
				),
			},
			{
				id: "amount",
				accessorKey: "amount",
				header: "Bedrag",
				size: 104,
				cell: (c) => (
					<span className="font-medium text-ink tabular-nums">
						{formatCurrency(c.row.original.amount, c.row.original.currency)}
					</span>
				),
			},
			{
				id: "channel",
				accessorKey: "provider",
				header: "Kanaal",
				size: 124,
				filterFn: facetFilter,
				cell: (c) => (
					<span className="flex items-center gap-2 capitalize">
						<ChannelIcon provider={c.row.original.provider} />
						{PROVIDER_LABEL[c.row.original.provider]}
					</span>
				),
			},
			{
				id: "status",
				accessorKey: "status",
				header: "Status",
				size: 140,
				filterFn: facetFilter,
				cell: (c) => <StatusPill status={c.row.original.status} />,
			},
			{
				id: "deadline",
				accessorKey: "deadline_at",
				header: "Deadline",
				size: 148,
				cell: (c) => {
					const left = timeLeft(c.row.original.deadline_at);
					return (
						<span className="flex items-baseline gap-2">
							<span className="tabular-nums">
								{shortDate(c.row.original.deadline_at)}
							</span>
							<span
								className={cn(
									"font-medium text-2xs tabular-nums",
									left === OVERDUE ? "text-signal-red" : "text-ink-3",
								)}
							>
								{left}
							</span>
						</span>
					);
				},
			},
			{
				id: "evidence",
				accessorFn: (c) => c.evidence_files.length,
				header: "Bewijs",
				size: 88,
				cell: (c) => (
					<span className="tabular-nums">
						{c.row.original.evidence_files.length}{" "}
						{c.row.original.evidence_files.length === 1 ? "bestand" : "bestanden"}
					</span>
				),
			},
		],
		[],
	);

	return (
		<div className="flex min-w-0 flex-col">
			<PageHeader
				title="Chargebacks"
				meta={standing}
				actions={
					<>
						<button
							type="button"
							onClick={() => setNewOpen(true)}
							disabled={createBlocked !== undefined}
							title={createBlocked}
							className="flex h-8 items-center gap-1.5 rounded-md bg-abyss px-3 font-medium text-xs text-mesh-ink shadow-primary transition-colors hover:bg-abyss-2 disabled:pointer-events-none disabled:opacity-45"
						>
							<Plus className="size-3.5" strokeWidth={2} />
							Nieuw bewijspakket
						</button>
					</>
				}
			/>

			<div className="flex min-w-0 flex-col gap-3 px-5 pb-6">
				{/* What Insyte drew is offered only where it can draw and submit one. */}
				{openCases.length > 0 && commands.draw && commands.submit ? (
					<AiPrompt
						caseNumber={openCases[0]?.case_number ?? "—"}
						onEdit={editPack}
						onSubmit={reviewAndSubmit}
					/>
				) : null}

				{data.length === 0 ? (
					<AreaEmpty area="chargebacks" starts={source.starts} />
				) : (
					<DataTable
						columns={columns}
						data={data}
						facets={FACETS}
						actions={actions}
						noun={["case", "cases"]}
						getRowId={(c) => c.id}
						searchPlaceholder="Zoek zaken"
						initialSorting={[{ id: "deadline", desc: false }]}
						onRowClick={(c) =>
							navigate({
								to: "/chargebacks/$chargebackId",
								params: { chargebackId: c.id },
								state: OPEN_AS_MODAL,
							})
						}
						toolbarEnd={
							<button
								type="button"
								onClick={() => ask.open()}
								className="flex h-8 items-center gap-1.5 rounded-md px-2.5 font-medium text-xs text-arc-ink transition-colors hover:bg-arc-tint"
							>
								<Sparkles className="size-3.5" strokeWidth={1.75} />
								Vraag Insyte
							</button>
						}
						empty={
							<EmptyState
								kind="chargebacks"
								title={data.length === 0 ? "Nog geen chargebacks." : "Geen zaken passen bij deze filters."}
								body={data.length === 0 ? "Een chargeback komt hier binnen zodra een aanbieder er een opent." : "Pas de filters aan of wis ze."}
								action={{
									label: "Nieuw bewijspakket",
									onClick: () => setNewOpen(true),
								}}
							/>
						}
					/>
				)}
			</div>
			{source.Closing ? <source.Closing empty={data.length === 0} /> : null}

			<NewChargebackDialog
				open={newOpen}
				onOpenChange={setNewOpen}
				onCreate={commands.create}
				nextCaseNumber={source.nextCaseNumber}
				currency={source.currency}
			/>
			<ConfirmDialog
				open={accepting !== null}
				onOpenChange={(v) => !v && setAccepting(null)}
				title={`${counted(accepting?.length ?? 0, "zaak", "zaken")} accepteren als verloren?`}
				description={
					<>
						Dit kan niet ongedaan worden gemaakt: elke zaak sluit als verloren en het bedrag blijft bij de klant.
						<span className="mt-2 flex flex-col gap-0.5">
							{(accepting ?? []).map((c) => (
								<span key={c.id} className="tabular-nums">
									{c.case_number} · {c.customer_name} · {formatCurrency(c.amount, c.currency)}
								</span>
							))}
						</span>
					</>
				}
				confirmLabel="Accepteren als verloren"
				tone="destructive"
				onConfirm={() => {
					if (accepting) commands.accept(accepting);
					setAccepting(null);
				}}
			/>
		</div>
	);
}

/**
 * The one thing on this screen that is not the table: what the AI has already done about the case
 * closest to its deadline. It used to be a `p-6` white card with a drop shadow and two badges above
 * two paragraphs. It is a single line on the brand's own tint, because it is an offer, not a record.
 */
function AiPrompt({
	caseNumber,
	onEdit,
	onSubmit,
}: {
	caseNumber: string;
	onEdit: () => void;
	onSubmit: () => void;
}) {
	return (
		<section className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg bg-arc-tint px-3 py-2">
			<Sparkles className="size-3.5 shrink-0 text-arc-ink" strokeWidth={1.75} />
			<p className="min-w-0 flex-1 text-sm text-ink">
				<span className="font-medium">Bewijspakket klaar voor {caseNumber}</span>{" "}
				— e-mailgesprek, bezorgbevestiging, IP- en adrescontrole, logboek van het
				terugbetalingsaanbod.
			</p>
			<span className="flex shrink-0 items-center gap-1.5">
				<button
					type="button"
					onClick={onEdit}
					className="flex h-7 items-center rounded-md px-2.5 font-medium text-xs text-arc-ink transition-colors hover:bg-arc/15"
				>
					Pakket bewerken
				</button>
				<button
					type="button"
					onClick={onSubmit}
					className="flex h-7 items-center rounded-md bg-arc px-2.5 font-medium text-xs text-mesh-ink transition-colors hover:bg-abyss"
				>
					Controleren en indienen
				</button>
			</span>
		</section>
	);
}

const STATUS_STYLE: Record<
	ChargebackStatus,
	{ bg: string; text: string; label: string }
> = {
	open: {
		bg: "var(--signal-amber-bg)",
		text: "var(--signal-amber)",
		label: "Open",
	},
	awaiting_evidence: {
		bg: "var(--signal-amber-bg)",
		text: "var(--signal-amber)",
		label: "Wacht op bewijs",
	},
	submitted: { bg: "var(--arc-tint)", text: "var(--arc-ink)", label: "Ingediend" },
	won: {
		bg: "var(--signal-green-bg)",
		text: "var(--signal-green)",
		label: "Gewonnen",
	},
	lost: {
		bg: "var(--signal-red-bg)",
		text: "var(--signal-red)",
		label: "Verloren",
	},
};

function StatusPill({ status }: { status: ChargebackStatus }) {
	const s = STATUS_STYLE[status];
	return (
		<span
			className="inline-flex h-[18px] items-center justify-center rounded-full px-2 font-medium text-sm leading-none"
			style={{ backgroundColor: s.bg, color: s.text }}
		>
			{s.label}
		</span>
	);
}

const PROVIDERS: Array<Chargeback["provider"]> = ["paypal", "klarna", "stripe"];

const PROVIDER_LABEL: Record<Chargeback["provider"], string> = {
	paypal: "PayPal",
	klarna: "Klarna",
	stripe: "Stripe",
};

function ChannelIcon({ provider }: { provider: Chargeback["provider"] }) {
	return <BrandLogo brand={provider} name={PROVIDER_LABEL[provider]} size={20} />;
}

function shortDate(iso: string) {
	return new Intl.DateTimeFormat("nl-NL", {
		month: "short",
		day: "numeric",
	}).format(new Date(iso));
}

const OVERDUE = "Verlopen";

function timeLeft(iso: string) {
	const diff = new Date(iso).getTime() - Date.now();
	if (diff <= 0) return OVERDUE;
	const hours = Math.round(diff / (1000 * 60 * 60));
	if (hours < 48) return `nog ${hours} u`;
	const days = Math.round(hours / 24);
	if (days < 14) return `nog ${days} ${days === 1 ? "dag" : "dagen"}`;
	const weeks = Math.round(days / 7);
	return `nog ${weeks} ${weeks === 1 ? "week" : "weken"}`;
}

function NewChargebackDialog({
	open,
	onOpenChange,
	onCreate,
	nextCaseNumber: initialCaseNumber,
	currency,
}: {
	open: boolean;
	onOpenChange: (v: boolean) => void;
	/** True once made; false keeps what was typed, the host having said why. */
	onCreate: (input: NewChargebackInput) => Promise<boolean>;
	nextCaseNumber: string;
	currency: Currency;
}) {
	const [caseNumber, setCaseNumber] = useState(initialCaseNumber);
	const [customer, setCustomer] = useState("");
	const [provider, setProvider] = useState<Chargeback["provider"]>("paypal");
	const [amount, setAmount] = useState("0");
	const [reason, setReason] = useState<(typeof REASONS)[number]>(
		"Niet-geautoriseerde transactie",
	);
	const [notes, setNotes] = useState("");
	const [saving, setSaving] = useState(false);
	// The number the host has next, once it is known (it can arrive after the dialog mounts).
	useEffect(() => {
		if (!open) setCaseNumber(initialCaseNumber);
	}, [initialCaseNumber, open]);

	function reset() {
		setCaseNumber(initialCaseNumber);
		setCustomer("");
		setProvider("paypal");
		setAmount("0");
		setReason("Niet-geautoriseerde transactie");
		setNotes("");
	}

	async function submit() {
		if (saving) return;
		if (!customer.trim()) {
			toast.error("Naam van de klant is verplicht");
			return;
		}
		const amt = Number.parseFloat(amount);
		if (!amt || amt <= 0) {
			toast.error("Vul een geldig betwist bedrag in");
			return;
		}
		setSaving(true);
		const made = await onCreate({
			case_number: caseNumber.trim() || initialCaseNumber,
			customer_name: customer.trim(),
			provider,
			amount: amt,
			reason,
			notes: notes.trim(),
		});
		setSaving(false);
		if (!made) return;
		reset();
		onOpenChange(false);
	}

	return (
		<FormDialog
			open={open}
			onOpenChange={(v) => {
				if (!v) reset();
				onOpenChange(v);
			}}
			title="Nieuw bewijspakket"
			description="Open handmatig een chargebackzaak. Insyte begint met bewijs verzamelen zodra de zaak is aangemaakt."
			primaryLabel={saving ? "Aanmaken…" : "Zaak aanmaken"}
			onSubmit={() => void submit()}
			disabled={saving}
			width={560}
		>
			<div className="grid grid-cols-2 gap-4">
				<Field label="Zaaknummer">
					<TextField value={caseNumber} onChange={setCaseNumber} />
				</Field>
				<Field label="Kanaal">
					<SelectField
						value={provider}
						onChange={setProvider}
						options={PROVIDERS}
						renderLabel={(p) => p.charAt(0).toUpperCase() + p.slice(1)}
					/>
				</Field>
			</div>
			<Field label="Naam van de klant">
				<TextField
					value={customer}
					onChange={setCustomer}
					placeholder="Mason Garcia"
				/>
			</Field>
			<div className="grid grid-cols-2 gap-4">
				<Field label={`Betwist bedrag (${currency})`}>
					<TextField value={amount} onChange={setAmount} type="number" />
				</Field>
				<Field label="Reden">
					<SelectField value={reason} onChange={setReason} options={REASONS} />
				</Field>
			</div>
			<Field label="Notities (optioneel)" hint="Alleen zichtbaar voor je team.">
				<TextAreaField
					value={notes}
					onChange={setNotes}
					placeholder="bijv. klant vroeg per e-mail om terugbetaling voordat het geschil werd geopend…"
					rows={2}
				/>
			</Field>
		</FormDialog>
	);
}
