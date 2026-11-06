import { Switch } from "../../components/switch";
import { Clock, ExternalLink, LayoutList as Layers, ListFilter, MapPin, MessageSquare, Plus, RotateCcw, Shield, Trash2 } from "../../icons";
import { useEffect, useMemo, useRef, useState } from "react";
import { FormDialog, TextAreaField, TextField } from "../common/form-dialog";
import { PageGuide } from "../common/page-guide";
import { FieldRow, INPUT_CLASS, UnsavedBar } from "../settings/form";
import { BandedList, BandedRow, SettingCard, StatusPill } from "../settings/setting-card";
import { useProducts } from "../hooks/use-operator-data";
import { type ProductRule, type Resolution, RESOLUTION_LABEL, RULE_LABEL, type ReturnSettings, type RuleKind } from "../lib/returns";
import { undoable } from "../lib/undo";
import { cn } from "../lib/utils";
import { useGate } from "../stores/access-store";
import { useReturns } from "../stores/returns-store";
import { CarrierMark } from "./parts";
import { portalHref } from "./returns-screen";

const GUIDE = [
	{ title: "Termijnen", body: "De retourtermijn telt in dagen na bezorging. De claimtermijn geldt voor beschadigd, verkeerd of kwaliteit. Speciale termijnen gelden voor bestellingen in een periode.", art: "hours" },
	{ title: "Uitzonderingen per product", body: "Een productregel geldt per product, variant of Shopify-label en kan de oplossingen per artikel beperken. De klant ziet de reden in het portaal.", art: "rules" },
	{ title: "Redenen en oplossingen", body: "Wat een klant kan kiezen. Een reden die meetelt voor kwaliteit komt op de Kwaliteit van het product. De cadeaubonbonus komt bovenop het bedrag.", art: "chart" },
	{ title: "Adressen en claims", body: "Pakketten gaan per land naar een adres, met het label van de vervoerder. Claimstappen zijn wat een klant doorloopt om een probleem te melden.", art: "parcel" },
	{ title: "Het retourportaal", body: "Hier vragen klanten zelf een retour aan of melden een probleem, in de stijl van je winkel. Staat het uit, dan zien ze dat het dicht is. Zet het adres in je verzendmails.", art: "portal" },
] as const;

/**
 * Instellingen → Retouren (`/settings/returns`, PLAN 25): the windows, the exceptions per product,
 * the reasons a shopper can pick, the resolutions offered, where parcels go and the portal. One
 * draft for the page, kept by the unsaved bar with Undo. It shapes what every shopper is told, so
 * changing it takes Retouren · Beheren; with less the page reads under the Alleen lezen line.
 */
export function ReturnSettingsPage() {
	const saved = useReturns((s) => s.settings);
	const savedKey = JSON.stringify(saved);
	const [draft, setDraft] = useState<ReturnSettings>(saved);
	const last = useRef(savedKey);
	useEffect(() => {
		if (last.current !== savedKey) {
			last.current = savedKey;
			setDraft(JSON.parse(savedKey) as ReturnSettings);
		}
	}, [savedKey]);
	const dirty = JSON.stringify(draft) !== savedKey;
	const gate = useGate("returns", 3);
	const [addingRule, setAddingRule] = useState(false);
	const set = <K extends keyof ReturnSettings>(k: K, v: ReturnSettings[K]) => setDraft((d) => ({ ...d, [k]: v }));

	return (
		<>
			<SettingCard id="termijnen" title="Termijnen" icon={Clock}>
				<div className="flex flex-col">
					<FieldRow label="Retourtermijn">
						<DaysField value={draft.returnDays} onChange={(v) => set("returnDays", v ?? 0)} label="Retourtermijn in dagen" />
					</FieldRow>
					<FieldRow label="Claimtermijn">
						<DaysField value={draft.claimDays} onChange={(v) => set("claimDays", v ?? 0)} label="Claimtermijn in dagen" />
					</FieldRow>
					<FieldRow label="Speciale termijnen">
						<div className="flex flex-col gap-1.5">
							{draft.specialWindows.map((w) => (
								<div key={w.id} className="flex items-center gap-2 rounded-md bg-paper px-3 py-2 text-sm">
									<span className="font-medium text-ink">{w.label}</span>
									<span className="text-ink-3">
										besteld {md(w.from)} – {md(w.to)}, {w.days} dagen
									</span>
									<button type="button" aria-label={`${w.label} verwijderen`} onClick={() => set("specialWindows", draft.specialWindows.filter((x) => x.id !== w.id))} className="ml-auto rounded-sm p-1 text-ink-3 hover:bg-ink/6 hover:text-ink">
										<Trash2 className="size-3.5" strokeWidth={1.75} />
									</button>
								</div>
							))}
							<button
								type="button"
								onClick={() => set("specialWindows", [...draft.specialWindows, { id: `w_${Date.now().toString(36)}`, label: "Zomeractie", days: 45, from: "07-01", to: "08-31" }])}
								className="flex h-8 w-fit items-center gap-1.5 rounded-md px-2 font-medium text-arc-ink text-sm hover:bg-arc-tint"
							>
								<Plus className="size-3.5" strokeWidth={2} />
								Periode toevoegen
							</button>
						</div>
					</FieldRow>
				</div>
			</SettingCard>

			<SettingCard
				id="regels"
				title="Productregels"
				icon={Shield}
				action={
					gate.ok ? (
						<button type="button" onClick={() => setAddingRule(true)} className="flex h-8 items-center gap-1.5 rounded-md bg-abyss px-2.5 font-medium text-mesh-ink text-xs shadow-primary hover:bg-abyss-2">
							<Plus className="size-3.5" strokeWidth={2} />
							Regel toevoegen
						</button>
					) : null
				}
			>
				<BandedList>
					{draft.rules.map((r) => (
						<BandedRow
							key={r.id}
							title={r.target.by === "tag" ? `Label “${r.target.tag}”` : r.target.label}
							detail={r.note}
							trailing={
								<>
									<StatusPill tone={r.kind === "not_returnable" ? "warning" : "neutral"} label={RULE_LABEL[r.kind]} />
									<button
										type="button"
										aria-label="Regel verwijderen"
										onClick={() => {
											const before = draft.rules;
											set("rules", draft.rules.filter((x) => x.id !== r.id));
											undoable("Regel verwijderd", () => set("rules", before), "Nog niet opgeslagen.");
										}}
										className="rounded-sm p-1 text-ink-3 hover:bg-ink/6 hover:text-ink"
									>
										<Trash2 className="size-3.5" strokeWidth={1.75} />
									</button>
								</>
							}
						/>
					))}
					{draft.rules.length === 0 ? <li className="px-3.5 py-3 text-ink-3 text-sm">Geen uitzonderingen: alles is retourneerbaar binnen de termijn.</li> : null}
				</BandedList>
			</SettingCard>

			<SettingCard id="redenen" title="Redenen" icon={ListFilter}>
				<BandedList>
					{draft.reasons.map((r, i) => (
						<li key={r.id} className="grid grid-cols-1 items-center gap-2 px-3.5 py-2.5 sm:grid-cols-[minmax(0,1fr)_auto_auto_120px] sm:gap-4">
							<span className="flex min-w-0 flex-col">
								<span className="font-medium text-base text-ink">{r.label}</span>
								<span className="text-ink-3 text-sm">{r.claim ? "Claim" : "Retour"}</span>
							</span>
							<label className="flex items-center gap-2 text-ink-2 text-sm">
								<Switch checked={r.photoRequired} onCheckedChange={(v) => set("reasons", draft.reasons.map((x, j) => (j === i ? { ...x, photoRequired: v } : x)))} aria-label={`Foto verplicht bij ${r.label}`} />
								Foto verplicht
							</label>
							<label className="flex items-center gap-2 text-ink-2 text-sm">
								<Switch checked={r.quality} onCheckedChange={(v) => set("reasons", draft.reasons.map((x, j) => (j === i ? { ...x, quality: v } : x)))} aria-label={`${r.label} telt mee voor kwaliteit`} />
								Telt mee voor kwaliteit
							</label>
							<DaysField value={r.windowDays ?? null} onChange={(v) => set("reasons", draft.reasons.map((x, j) => (j === i ? { ...x, windowDays: v ?? undefined } : x)))} label={`Eigen termijn voor ${r.label}`} placeholder="Standaard" small />
						</li>
					))}
				</BandedList>
			</SettingCard>

			<SettingCard id="oplossingen" title="Oplossingen" icon={Layers}>
				<div className="flex flex-col">
					<FieldRow label="Aangeboden">
						<div className="flex flex-wrap gap-1.5">
							{(Object.keys(RESOLUTION_LABEL) as Resolution[]).map((k) => {
								const on = draft.offered.includes(k);
								return (
									<button
										key={k}
										type="button"
										aria-pressed={on}
										onClick={() => set("offered", on ? draft.offered.filter((x) => x !== k) : [...draft.offered, k])}
										className={cn("h-8 rounded-md px-2.5 font-medium text-sm transition-colors", on ? "bg-abyss text-mesh-ink" : "bg-paper text-ink-3 hover:text-ink")}
									>
										{RESOLUTION_LABEL[k]}
									</button>
								);
							})}
						</div>
					</FieldRow>
					<FieldRow label="Bonus op een cadeaubon">
						<NumberWell value={draft.giftCardBonus} onChange={(v) => set("giftCardBonus", v)} unit="%" label="Bonus in procent" />
					</FieldRow>
					<FieldRow label="Ruilkosten" hint="0 is gratis ruilen">
						<NumberWell value={draft.exchangeFee} onChange={(v) => set("exchangeFee", v)} unit="€" label="Ruilkosten in euro" />
					</FieldRow>
				</div>
			</SettingCard>

			<SettingCard id="adressen" title="Adressen en vervoerders" icon={MapPin}>
				<BandedList>
					{draft.addresses.map((a) => (
						<BandedRow key={a.country} leading={<CarrierMark carrier={a.carrier} size={32} />} title={a.label} detail={a.address} trailing={<span className="text-ink-3 text-sm">{a.carrier}</span>} />
					))}
				</BandedList>
			</SettingCard>

			<SettingCard id="claims" title="Claimstappen" icon={MessageSquare}>
				<ol className="flex max-w-[480px] flex-col gap-1.5">
					{draft.claimSteps.map((step, i) => (
						<li key={i} className="flex items-center gap-2">
							<span className="w-5 text-right text-ink-3 text-sm tabular-nums">{i + 1}</span>
							<input
								value={step}
								aria-label={`Stap ${i + 1}`}
								onChange={(e) => set("claimSteps", draft.claimSteps.map((x, j) => (j === i ? e.target.value : x)))}
								className={cn(INPUT_CLASS, "h-8 text-sm")}
							/>
						</li>
					))}
				</ol>
			</SettingCard>

			<SettingCard
				id="portaal"
				title="Retourportaal"
				icon={RotateCcw}
				action={
					<a href={portalHref(draft.portal.handle)} target="_blank" rel="noreferrer" className="flex h-8 items-center gap-1.5 rounded-md px-2.5 font-medium text-arc-ink text-xs hover:bg-arc-tint">
						<ExternalLink className="size-3.5" strokeWidth={1.75} />
						Portaal bekijken
					</a>
				}
			>
				<div className="flex flex-col">
					<FieldRow label="Portaal aan">
						<span className="flex h-9 items-center">
							<Switch checked={draft.portal.on} onCheckedChange={(on) => set("portal", { ...draft.portal, on })} aria-label="Retourportaal aan" />
						</span>
					</FieldRow>
					<FieldRow label="Adres">
						<span className="flex h-9 items-center text-ink-2 text-sm">goinsyte.com/retour/{draft.portal.handle}</span>
					</FieldRow>
					<FieldRow label="Welkomsttekst">
						<TextAreaField value={draft.portal.intro} onChange={(intro) => set("portal", { ...draft.portal, intro })} rows={2} />
					</FieldRow>
					<FieldRow label="Na de aanvraag">
						<TextAreaField value={draft.portal.done} onChange={(done) => set("portal", { ...draft.portal, done })} rows={3} />
					</FieldRow>
				</div>
			</SettingCard>

			<RuleDialog
				open={addingRule}
				onClose={() => setAddingRule(false)}
				onAdd={(rule) => {
					set("rules", [...draft.rules, rule]);
					setAddingRule(false);
				}}
			/>
			<UnsavedBar
				visible={dirty && gate.ok}
				onDiscard={() => setDraft(saved)}
				onSave={() => {
					const undo = useReturns.getState().saveSettings(draft);
					undoable("Retourinstellingen opgeslagen", undo, "Het portaal gebruikt ze meteen.");
				}}
			/>
			<PageGuide id="settings.returns" title="Retouren" steps={GUIDE} />
		</>
	);
}

function RuleDialog({ open, onClose, onAdd }: { open: boolean; onClose: () => void; onAdd: (r: ProductRule) => void }) {
	const { data: products } = useProducts();
	const [kind, setKind] = useState<RuleKind>("not_returnable");
	const [by, setBy] = useState<"product" | "tag">("product");
	const [productId, setProductId] = useState<string>("");
	const [tag, setTag] = useState("");
	const [note, setNote] = useState("");
	const product = products.find((p) => p.id === productId);
	const ok = (by === "product" ? product !== undefined : tag.trim() !== "") && note.trim() !== "";
	const options = useMemo(() => products.slice(0, 40), [products]);
	return (
		<FormDialog
			open={open}
			onOpenChange={(o) => !o && onClose()}
			title="Regel toevoegen"
			description="Een uitzondering op de termijnen en oplossingen, met een reden die de klant leest."
			primaryLabel="Regel toevoegen"
			disabled={!ok}
			onSubmit={() =>
				onAdd({
					id: `rule_${Date.now().toString(36)}`,
					kind,
					target: by === "product" ? { by: "product", productId, label: product?.title ?? productId } : { by: "tag", tag: tag.trim().toLowerCase() },
					note: note.trim(),
				})
			}
		>
			<div className="flex flex-wrap gap-1.5">
				{(Object.keys(RULE_LABEL) as RuleKind[]).map((k) => (
					<button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)} className={cn("h-8 rounded-md px-2.5 font-medium text-sm", kind === k ? "bg-abyss text-mesh-ink" : "bg-mist text-ink-2 hover:text-ink")}>
						{RULE_LABEL[k]}
					</button>
				))}
			</div>
			<div className="flex gap-1.5">
				{(["product", "tag"] as const).map((b) => (
					<button key={b} type="button" aria-pressed={by === b} onClick={() => setBy(b)} className={cn("h-7 rounded-md px-2 text-sm", by === b ? "bg-arc-tint font-medium text-arc-ink" : "text-ink-2 hover:bg-ink/6")}>
						{b === "product" ? "Een product" : "Een Shopify-label"}
					</button>
				))}
			</div>
			{by === "product" ? (
				<select aria-label="Product" value={productId} onChange={(e) => setProductId(e.target.value)} className={cn(INPUT_CLASS, "h-11")}>
					<option value="">Kies een product</option>
					{options.map((p) => (
						<option key={p.id} value={p.id}>
							{p.title}
						</option>
					))}
				</select>
			) : (
				<TextField value={tag} onChange={setTag} placeholder="Bijvoorbeeld: sale, outlet, op-maat" />
			)}
			<label className="flex flex-col gap-1.5">
				<span className="font-medium text-ink-3 text-sm">Wat de klant leest</span>
				<TextAreaField value={note} onChange={setNote} rows={2} placeholder="Bijvoorbeeld: Maatwerk nemen we niet terug." />
			</label>
		</FormDialog>
	);
}

function DaysField({ value, onChange, label, placeholder, small = false }: { value: number | null; onChange: (v: number | null) => void; label: string; placeholder?: string; small?: boolean }) {
	return (
		<label className={cn("field flex items-center gap-2 rounded-md px-3 focus-within:bg-paper", small ? "h-8 w-[120px] text-sm" : "h-9 w-40 text-base")}>
			<input
				inputMode="numeric"
				aria-label={label}
				value={value === null ? "" : String(value)}
				placeholder={placeholder}
				onChange={(e) => {
					const d = e.target.value.replace(/[^0-9]/g, "");
					onChange(d === "" ? (placeholder ? null : 0) : Number(d));
				}}
				className="min-w-0 flex-1 bg-transparent text-ink tabular-nums outline-none placeholder:text-ink-3"
			/>
			<span className="text-ink-3">dagen</span>
		</label>
	);
}

function NumberWell({ value, onChange, unit, label }: { value: number; onChange: (v: number) => void; unit: string; label: string }) {
	return (
		<label className="field flex h-9 w-32 items-center gap-2 rounded-md px-3 text-base focus-within:bg-paper">
			{unit === "€" ? <span className="text-ink-3">€</span> : null}
			<input
				inputMode="decimal"
				aria-label={label}
				value={String(value).replace(".", ",")}
				onChange={(e) => {
					const n = Number(e.target.value.replace(",", ".").replace(/[^0-9.]/g, ""));
					if (!Number.isNaN(n)) onChange(n);
				}}
				className="min-w-0 flex-1 bg-transparent text-ink tabular-nums outline-none"
			/>
			{unit === "%" ? <span className="text-ink-3">%</span> : null}
		</label>
	);
}

const MONTHS = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
const md = (s: string) => {
	const [m, d] = s.split("-").map(Number);
	return `${d} ${MONTHS[(m ?? 1) - 1]}`;
};
