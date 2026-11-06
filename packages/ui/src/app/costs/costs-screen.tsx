import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "../../components/dropdown-menu";
import { MoreHorizontal, Plus, RotateCcw, Sheet as SheetIcon, Trash2, Edit3 } from "../../icons";
import { Gate } from "../access/gate";
import { EmptyPage } from "../common/empty-page";
import { Field, FormDialog, TextField } from "../common/form-dialog";
import { PageGuide } from "../common/page-guide";
import { PageHeader } from "../common/page-header";
import type { Month } from "../lib/analytics/engine";
import { type CostKind, type CostLine, costOf, figuresOf, KIND_LABEL, MONTH_IDS, monthAbbr, monthName, typed } from "../lib/costs";
import { newId } from "../lib/courses";
import { formatCurrency } from "../lib/format";
import { parseTyped } from "../lib/sheets";
import { undoable } from "../lib/undo";
import { cn } from "../lib/utils";
import { BrandLogo } from "../marketplace/brand-logos";
import { useGate } from "../stores/access-store";
import { useCosts } from "../stores/costs-store";
import { useWorkspace } from "../stores/workspace-store";
import { Segmented } from "../team/bits";

const GUIDE = [{ title: "Van omzet naar nettowinst", body: "Vul in wat de winkel per maand kost. Analyse en Rekenbladen rekenen er de nettowinst en de ROAS mee uit.", art: "budget" }] as const;

const money = (n: number, cents = false) => formatCurrency(n, "USD", { currencyDisplay: "narrowSymbol", minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 });
const pct = (n: number) => new Intl.NumberFormat("nl-NL", { style: "percent", maximumFractionDigits: 1 }).format(n);

const ORDER: ReadonlyArray<CostKind> = ["percent", "per_order", "fixed", "ads"];
const GROUP: Record<CostKind, string> = { percent: "Deel van de omzet", per_order: "Per bestelling", fixed: "Vast per maand", ads: "Advertenties" };
const SOURCE_NAME: Record<string, string> = { meta: "Meta Ads", "google-ads": "Google Ads" };

/**
 * Kosten (`/costs`, PLAN 42): what the shop costs per month, against what it took in. Fixed costs
 * and ad spend are typed per month; a connected ad account fills its own row, and a typed amount
 * overrides it with a way back. The foot of the table is the point: revenue, costs, net profit and
 * the margin, the figures Analyse and Rekenbladen read.
 */
export function CostsPage() {
	const lines = useCosts((s) => s.lines);
	const integrations = useWorkspace((s) => s.integrations);
	const connected = useMemo(() => new Set(integrations.filter((i) => i.status === "connected").map((i) => i.key)), [integrations]);
	const figures = useMemo(() => Object.fromEntries(MONTH_IDS.map((m) => [m, figuresOf(lines, m, connected)])) as Record<Month, ReturnType<typeof figuresOf>>, [lines, connected]);
	const gate = useGate("settings", 2);
	const [dialog, setDialog] = useState<CostLine | "new" | null>(null);
	const last = MONTH_IDS[MONTH_IDS.length - 1]!;
	const prev = MONTH_IDS[MONTH_IDS.length - 2]!;
	const f = figures[last];

	if (lines.length === 0) {
		return (
			<div className="flex min-w-0 flex-col">
				<PageHeader title="Kosten" crumbs={[{ label: "Analyse", to: "/analytics" }]} />
				<EmptyPage
					kind="analytics"
					count="0 kostenposten"
					title="Nog geen kosten"
					body="Vul in wat de winkel per maand kost: inkoop, betaalkosten, verpakking, het team, advertenties. Dan rekent Insyte de nettowinst uit, in Analyse en in je rekenbladen."
					action={gate.ok ? { label: "Eerste kostenpost", onClick: () => setDialog("new") } : undefined}
					starts={[{ id: "meta", label: "Meta Ads koppelen", body: "Dan vult de advertentierij zichzelf.", to: "/settings/integrations" }]}
				/>
				<LineDialog value={dialog} onClose={() => setDialog(null)} />
			</div>
		);
	}

	return (
		<div className="flex min-w-0 flex-col">
			<PageHeader
				title="Kosten"
				crumbs={[{ label: "Analyse", to: "/analytics" }]}
				meta={`${lines.length} posten · januari tot mei 2026`}
				actions={
					<>
						<Link to="/sheets/$sheetId" params={{ sheetId: "sh_profit" }} className="field flex h-8 items-center gap-1.5 rounded-md px-2.5 font-medium text-ink text-sm transition-colors hover:field-hover">
							<SheetIcon className="size-3.5" strokeWidth={1.75} />
							Winst per maand
						</Link>
						<Gate perm="settings" arg={2}>
							<button type="button" onClick={() => setDialog("new")} className="flex h-8 items-center gap-1.5 rounded-md bg-abyss px-3 font-medium text-mesh-ink text-sm shadow-primary transition-colors hover:bg-abyss-2">
								<Plus className="size-3.5" strokeWidth={2} />
								Kostenpost
							</button>
						</Gate>
					</>
				}
			/>
			<div className="flex min-w-0 flex-col gap-6 px-5 pb-12">
				<p className="max-w-[68ch] text-ink text-md leading-[1.5]">
					In {monthName(last).toLowerCase()} hield de winkel <span className="font-medium tabular-nums">{money(f.net)}</span> over van <span className="tabular-nums">{money(f.revenue)}</span> omzet, {pct(f.margin)}.{" "}
					<span className="text-ink-2">
						{f.margin >= figures[prev].margin ? "Dat is meer" : "Dat is minder"} dan in {monthName(prev).toLowerCase()} ({pct(figures[prev].margin)}). Advertenties waren {pct(f.revenue ? f.ads / f.revenue : 0)} van de omzet, een ROAS van {f.roas.toLocaleString("nl-NL", { maximumFractionDigits: 1 })}.
					</span>
				</p>

				<div className="table-scroll rounded-xl bg-paper shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--ink)_9%,transparent)]">
					<table className="w-full min-w-[760px] border-separate border-spacing-0 text-sm">
						<thead>
							<tr>
								<th scope="col" className="sticky left-0 z-10 w-[260px] bg-mist px-3 py-2 text-left font-medium text-ink-3 text-xs">
									Post
								</th>
								{MONTH_IDS.map((m) => (
									<th key={m} scope="col" className="bg-mist px-3 py-2 text-right font-medium text-ink-3 text-xs">
										{monthAbbr(m)}
										{m === last ? " · loopt" : ""}
									</th>
								))}
								<th scope="col" className="w-10 bg-mist" />
							</tr>
						</thead>
						<tbody>
							{ORDER.map((kind) => {
								const group = lines.filter((l) => l.kind === kind);
								if (!group.length) return null;
								return [
									<tr key={`h-${kind}`}>
										<th colSpan={MONTH_IDS.length + 2} scope="colgroup" className="px-3 pt-4 pb-1 text-left font-medium text-ink-2 text-xs">
											{GROUP[kind]}
										</th>
									</tr>,
									...group.map((l, i) => <LineRow key={l.id} l={l} band={i % 2 === 1} connected={connected} canEdit={gate.ok} onEdit={() => setDialog(l)} />),
								];
							})}
						</tbody>
						<tfoot>
							{(
								[
									["Omzet", (m: Month) => money(figures[m].revenue), "text-ink-2"],
									["Alle kosten", (m: Month) => money(figures[m].costs), "text-ink-2"],
									["Nettowinst", (m: Month) => money(figures[m].net), "font-medium text-ink"],
									["Marge", (m: Month) => pct(figures[m].margin), "text-ink-2"],
								] as const
							).map(([label, value, tone], i) => (
								<tr key={label}>
									<th scope="row" className={cn("sticky left-0 bg-mist px-3 py-2 text-left font-medium text-sm", i === 0 && "pt-3", tone)}>
										{label}
									</th>
									{MONTH_IDS.map((m) => (
										<td key={m} className={cn("bg-mist px-3 py-2 text-right tabular-nums", i === 0 && "pt-3", tone, label === "Nettowinst" && figures[m].net < 0 && "text-signal-red")}>
											{value(m)}
										</td>
									))}
									<td className="bg-mist" />
								</tr>
							))}
						</tfoot>
					</table>
				</div>
				<p className="text-ink-3 text-sm">Omzet en bestellingen komen uit de winkelgeschiedenis, net als in Analyse. Typ in een cel om een bedrag te veranderen; Enter bewaart, Esc laat het staan.</p>
			</div>
			<LineDialog value={dialog} onClose={() => setDialog(null)} />
			<PageGuide id="costs" title="Kosten" steps={GUIDE} />
		</div>
	);
}

function LineRow({ l, band, connected, canEdit, onEdit }: { l: CostLine; band: boolean; connected: ReadonlySet<string>; canEdit: boolean; onEdit: () => void }) {
	const reads = l.kind === "ads" && l.source !== "manual" && connected.has(l.source);
	const editable = canEdit && (l.kind === "fixed" || l.kind === "ads");
	const rule = l.kind === "percent" ? `${l.rate.toLocaleString("nl-NL")}% van de omzet` : l.kind === "per_order" ? `${money(l.rate, true)} per bestelling` : l.kind === "ads" ? (reads ? `Uit ${SOURCE_NAME[l.source]}` : l.source !== "manual" ? `${SOURCE_NAME[l.source]} is niet gekoppeld; getypt` : "Getypt") : "";
	const ground = band ? "bg-mist/50" : "bg-paper";
	return (
		<tr className="group/row">
			<th scope="row" className={cn("sticky left-0 z-10 px-3 py-1.5 text-left font-normal", ground)}>
				<span className="flex items-center gap-2.5">
					{l.source !== "manual" ? <BrandLogo brand={l.source} name={SOURCE_NAME[l.source] ?? l.name} size={22} /> : null}
					<span className="flex min-w-0 flex-col">
						<span className="truncate text-ink">{l.name}</span>
						<span className={cn("truncate text-ink-3 text-xs", !rule && "hidden")}>
							{rule}
							{l.kind === "ads" && l.source === "google-ads" && !reads ? (
								<>
									{" · "}
									<Link to="/settings/integrations" className="text-arc-ink hover:underline">
										Koppelen
									</Link>
								</>
							) : null}
						</span>
					</span>
				</span>
			</th>
			{MONTH_IDS.map((m) => (
				<td key={m} className={cn("px-1.5 py-1.5 text-right", ground)}>
					{editable ? <AmountCell l={l} m={m} connected={connected} /> : <span className="px-1.5 text-ink-2 tabular-nums">{money(costOf(l, m, connected))}</span>}
				</td>
			))}
			<td className={cn("px-1 py-1.5", ground)}>
				{canEdit ? (
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<button type="button" aria-label={`Opties voor ${l.name}`} className="flex size-7 items-center justify-center rounded-md text-ink-3 opacity-0 transition-opacity hover:bg-ink/6 hover:text-ink focus-visible:opacity-100 group-hover/row:opacity-100">
								<MoreHorizontal className="size-4" strokeWidth={1.75} />
							</button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end" className="w-52">
							<DropdownMenuItem onClick={onEdit}>
								<Edit3 className="size-3.5" strokeWidth={1.75} />
								Bewerken
							</DropdownMenuItem>
							{reads && Object.keys(l.amounts).length ? (
								<DropdownMenuItem onClick={() => undoable(`${l.name} leest weer uit ${SOURCE_NAME[l.source]}`, useCosts.getState().update(l.id, { amounts: {} }))}>
									<RotateCcw className="size-3.5" strokeWidth={1.75} />
									Weer uit {SOURCE_NAME[l.source]} lezen
								</DropdownMenuItem>
							) : null}
							<DropdownMenuSeparator />
							<DropdownMenuItem variant="destructive" onClick={() => undoable(`${l.name} verwijderd`, useCosts.getState().remove(l.id), "De nettowinst rekent nu zonder deze post.")}>
								<Trash2 className="size-3.5" strokeWidth={1.75} />
								Verwijderen
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				) : null}
			</td>
		</tr>
	);
}

/** One month's amount, typed in place. A read amount shows its source until someone types over it. */
function AmountCell({ l, m, connected }: { l: CostLine; m: Month; connected: ReadonlySet<string> }) {
	const value = costOf(l, m, connected);
	const own = typed(l, m);
	const [draft, setDraft] = useState<string | null>(null);
	const commit = () => {
		if (draft === null) return;
		const t = draft.trim();
		setDraft(null);
		if (t === "") {
			if (!own) return;
			const amounts = { ...l.amounts };
			delete amounts[m];
			return undoable(`${l.name}, ${monthAbbr(m)} gewist`, useCosts.getState().update(l.id, { amounts }));
		}
		const n = parseTyped(t).value;
		if (typeof n !== "number" || n < 0) return;
		if (own && l.amounts[m] === n) return;
		undoable(`${l.name}, ${monthAbbr(m)}: ${money(n)}`, useCosts.getState().update(l.id, { amounts: { ...l.amounts, [m]: n } }));
	};
	return (
		<input
			value={draft ?? (value ? money(value) : "")}
			onFocus={(e) => {
				setDraft(value ? String(value).replace(".", ",") : "");
				requestAnimationFrame(() => e.target.select());
			}}
			onChange={(e) => setDraft(e.target.value)}
			onBlur={commit}
			onKeyDown={(e) => {
				if (e.key === "Enter") (e.target as HTMLInputElement).blur();
				if (e.key === "Escape") {
					setDraft(null);
					(e.target as HTMLInputElement).blur();
				}
			}}
			inputMode="decimal"
			aria-label={`${l.name}, ${monthName(m)}`}
			placeholder="0"
			title={l.kind === "ads" && !own && value ? `Uit ${SOURCE_NAME[l.source] ?? "het account"}` : undefined}
			className={cn("h-8 w-full rounded-md bg-transparent px-1.5 text-right tabular-nums outline-none transition-colors hover:bg-ink/5 focus:bg-paper focus:shadow-[inset_0_0_0_1px_var(--arc)]", l.kind === "ads" && !own && value ? "text-ink-2" : "text-ink")}
		/>
	);
}

function LineDialog({ value, onClose }: { value: CostLine | "new" | null; onClose: () => void }) {
	const editing = value && value !== "new" ? value : null;
	const [name, setName] = useState("");
	const [kind, setKind] = useState<CostKind>("fixed");
	const [rate, setRate] = useState("");
	const [amount, setAmount] = useState("");
	const [key, setKey] = useState<string | null>(null);
	const open = value !== null;
	const id = editing?.id ?? "new";
	if (open && key !== id) {
		setKey(id);
		setName(editing?.name ?? "");
		setKind(editing?.kind ?? "fixed");
		setRate(editing && (editing.kind === "percent" || editing.kind === "per_order") ? String(editing.rate).replace(".", ",") : "");
		setAmount("");
	}
	if (!open && key !== null) setKey(null);
	const num = (s: string) => {
		const v = parseTyped(s).value;
		return typeof v === "number" ? v : null;
	};
	const needsRate = kind === "percent" || kind === "per_order";
	const valid = name.trim() && (needsRate ? num(rate) !== null : true);
	return (
		<FormDialog
			open={open}
			onOpenChange={(v) => !v && onClose()}
			title={editing ? `${editing.name} bewerken` : "Kostenpost toevoegen"}
			description={editing ? undefined : "Een post per soort kosten. Het bedrag per maand typ je daarna in de tabel."}
			primaryLabel={editing ? "Opslaan" : "Toevoegen"}
			disabled={!valid}
			width={500}
			onSubmit={() => {
				const r = needsRate ? (num(rate) ?? 0) * (kind === "percent" && rate.includes("%") ? 100 : 1) : 0;
				if (editing) {
					undoable(`${name.trim()} opgeslagen`, useCosts.getState().update(editing.id, { name: name.trim(), kind, rate: r }));
				} else {
					const a = num(amount);
					const amounts = !needsRate && a !== null ? Object.fromEntries(MONTH_IDS.map((m) => [m, a])) : {};
					undoable(`${name.trim()} toegevoegd`, useCosts.getState().add({ id: newId("cost"), name: name.trim(), kind, rate: r, amounts, source: "manual", ...(kind === "ads" ? { channel: "Organic" as const } : {}) }), "De nettowinst rekent er vanaf nu mee.");
				}
				onClose();
			}}
		>
			<Field label="Naam">
				<TextField value={name} onChange={setName} placeholder="Bijvoorbeeld: Klantenservice-software" />
			</Field>
			<Field label="Soort">
				<Segmented label="Soort" value={kind} onChange={setKind} options={ORDER.map((k) => ({ id: k, label: KIND_LABEL[k] }))} />
			</Field>
			{needsRate ? (
				<Field label={kind === "percent" ? "Percentage van de omzet" : "Bedrag per bestelling"}>
					<TextField value={rate} onChange={setRate} placeholder={kind === "percent" ? "2,9" : "1,40"} />
				</Field>
			) : !editing ? (
				<Field label="Bedrag per maand" hint="Voor elke maand hetzelfde; je past ze daarna per maand aan.">
					<TextField value={amount} onChange={setAmount} placeholder="0" />
				</Field>
			) : null}
		</FormDialog>
	);
}
