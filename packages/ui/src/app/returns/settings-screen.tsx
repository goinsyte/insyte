import { Switch } from "../../components/switch";
import { Clock, ExternalLink, LayoutList as Layers, ListFilter, MapPin, MessageSquare, Edit3 as Pencil, Plus, RotateCcw, Shield, Trash2 } from "../../icons";
import { useEffect, useMemo, useRef, useState } from "react";
import { FormDialog, TextAreaField, TextField } from "../common/form-dialog";
import { PageGuide } from "../common/page-guide";
import { type FieldControl, FieldRow, INPUT_CLASS, INVALID_CLASS, UnsavedBar, useFieldErrors } from "../settings/form";
import { BandedList, BandedRow, SettingCard, StatusPill } from "../settings/setting-card";
import { type Carrier, type ProductRule, type Resolution, RESOLUTION_LABEL, RULE_LABEL, type ReturnAddress, type ReturnSettings, type ReturnSettingsDraft, returnSettingsErrors, type RuleKind, type SpecialWindow, windowErrors } from "../lib/returns";
import { currencySymbol } from "../lib/format";
import { countryName } from "../lib/format-flag";
import { undoable } from "../lib/undo";
import { cn } from "../lib/utils";
import { CarrierMark } from "./parts";
import { useReturnSettingsSource } from "./source";

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
	const source = useReturnSettingsSource();
	const saved = source.saved;
	const savedKey = JSON.stringify(saved);
	const [draft, setDraft] = useState<ReturnSettingsDraft>(saved);
	const last = useRef(savedKey);
	useEffect(() => {
		if (last.current !== savedKey) {
			last.current = savedKey;
			setDraft(JSON.parse(savedKey) as ReturnSettings);
		}
	}, [savedKey]);
	const draftKey = JSON.stringify(draft);
	const dirty = draftKey !== savedKey;
	const fe = useFieldErrors(returnSettingsErrors(draft), { draftKey });
	const gate = source.gate;
	const [addingRule, setAddingRule] = useState(false);
	const [editingAddress, setEditingAddress] = useState<number | "new" | null>(null);
	const [editingWindow, setEditingWindow] = useState<string | null>(null);
	const set = <K extends keyof ReturnSettingsDraft>(k: K, v: ReturnSettingsDraft[K]) => setDraft((d) => ({ ...d, [k]: v }));

	return (
		<>
			<SettingCard id="termijnen" title="Termijnen" icon={Clock}>
				<div className="flex flex-col">
					<FieldRow label="Retourtermijn">
						<span className="flex flex-col gap-1.5">
							<DaysField value={draft.returnDays} onChange={(v) => set("returnDays", v)} label="Retourtermijn in dagen" control={fe.control("returnDays")} />
							{fe.message("returnDays")}
						</span>
					</FieldRow>
					<FieldRow label="Claimtermijn">
						<span className="flex flex-col gap-1.5">
							<DaysField value={draft.claimDays} onChange={(v) => set("claimDays", v)} label="Claimtermijn in dagen" control={fe.control("claimDays")} />
							{fe.message("claimDays")}
						</span>
					</FieldRow>
					<FieldRow label="Speciale termijnen" group>
						<div className="flex flex-col gap-1.5">
							{draft.specialWindows.map((w) => (
								<div key={w.id} className="flex flex-col gap-1">
									<div {...fe.control(`specialWindows.${w.id}`)} tabIndex={-1} className={cn("flex items-center gap-2 rounded-md bg-paper px-3 py-2 text-sm outline-none", INVALID_CLASS)}>
										<span className="font-medium text-ink">{w.label}</span>
										<span className="text-ink-3">
											besteld {md(w.from)} – {md(w.to)}, {w.days} dagen
										</span>
										<span className="ml-auto flex items-center">
											<button type="button" aria-label={`${w.label} bewerken`} onClick={() => setEditingWindow(w.id)} className="rounded-sm p-1 text-ink-3 hover:bg-ink/6 hover:text-ink">
												<Pencil className="size-3.5" strokeWidth={1.75} />
											</button>
											<button type="button" aria-label={`${w.label} verwijderen`} onClick={() => set("specialWindows", draft.specialWindows.filter((x) => x.id !== w.id))} className="rounded-sm p-1 text-ink-3 hover:bg-ink/6 hover:text-ink">
												<Trash2 className="size-3.5" strokeWidth={1.75} />
											</button>
										</span>
									</div>
									{fe.message(`specialWindows.${w.id}`)}
								</div>
							))}
							<button
								type="button"
								onClick={() => setEditingWindow("new")}
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
							<span className="flex flex-col gap-1">
								<DaysField value={r.windowDays ?? null} onChange={(v) => set("reasons", draft.reasons.map((x, j) => (j === i ? { ...x, windowDays: v ?? undefined } : x)))} label={`Eigen termijn voor ${r.label}`} placeholder="Standaard" small control={fe.control(`reasons.${r.id}.windowDays`)} />
								{fe.message(`reasons.${r.id}.windowDays`)}
							</span>
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
						<span className="flex flex-col gap-1.5">
							<NumberWell value={draft.giftCardBonus} onChange={(v) => set("giftCardBonus", v)} unit="%" label="Bonus in procent" control={fe.control("giftCardBonus")} />
							{fe.message("giftCardBonus")}
						</span>
					</FieldRow>
					<FieldRow label="Ruilkosten" hint={exchangeFeeHint(source.currency)}>
						<span className="flex flex-col gap-1.5">
							<NumberWell
								value={draft.exchangeFee}
								onChange={(v) => set("exchangeFee", v)}
								unit={source.currency === null ? "" : currencySymbol(source.currency ?? "EUR")}
								label="Ruilkosten in de valuta van de winkel"
								control={fe.control("exchangeFee")}
							/>
							{fe.message("exchangeFee")}
						</span>
					</FieldRow>
				</div>
			</SettingCard>

			<SettingCard
				id="adressen"
				title="Adressen en vervoerders"
				icon={MapPin}
				action={
					gate.ok ? (
						<button type="button" onClick={() => setEditingAddress("new")} className="flex h-8 items-center gap-1.5 rounded-md bg-abyss px-2.5 font-medium text-mesh-ink text-xs shadow-primary hover:bg-abyss-2">
							<Plus className="size-3.5" strokeWidth={2} />
							Adres toevoegen
						</button>
					) : null
				}
			>
				<BandedList>
					{draft.addresses.map((a, i) => (
						<BandedRow
							key={a.country}
							leading={<CarrierMark carrier={a.carrier} size={32} />}
							title={a.label}
							detail={a.address}
							trailing={
								<>
									<span className="text-ink-3 text-sm">{a.carrier}</span>
									{gate.ok ? (
										<>
											<button type="button" aria-label={`${a.label} bewerken`} onClick={() => setEditingAddress(i)} className="rounded-sm p-1 text-ink-3 hover:bg-ink/6 hover:text-ink">
												<Pencil className="size-3.5" strokeWidth={1.75} />
											</button>
											<button
												type="button"
												aria-label={`${a.label} verwijderen`}
												onClick={() => {
													const before = draft.addresses;
													set("addresses", draft.addresses.filter((_, j) => j !== i));
													undoable("Adres verwijderd", () => set("addresses", before), "Nog niet opgeslagen.");
												}}
												className="rounded-sm p-1 text-ink-3 hover:bg-ink/6 hover:text-ink"
											>
												<Trash2 className="size-3.5" strokeWidth={1.75} />
											</button>
										</>
									) : null}
								</>
							}
						/>
					))}
					{draft.addresses.length === 0 ? <li className="px-3.5 py-3 text-ink-3 text-sm">Nog geen retouradres. Voeg er een toe, dan kan een retour een label krijgen.</li> : null}
				</BandedList>
			</SettingCard>

			<SettingCard id="claims" title="Claimstappen" icon={MessageSquare}>
				<ol className="flex max-w-[480px] flex-col gap-1.5">
					{draft.claimSteps.map((step, i) => (
						<li key={i} className="flex flex-col gap-1">
							<span className="flex items-center gap-2">
								<span className="w-5 text-right text-ink-3 text-sm tabular-nums">{i + 1}</span>
								<input
									{...fe.control(`claimSteps.${i}`)}
									value={step}
									aria-label={`Stap ${i + 1}`}
									onChange={(e) => set("claimSteps", draft.claimSteps.map((x, j) => (j === i ? e.target.value : x)))}
									className={cn(INPUT_CLASS, "h-8 text-sm", INVALID_CLASS)}
								/>
							</span>
							<span className="pl-7">{fe.message(`claimSteps.${i}`)}</span>
						</li>
					))}
				</ol>
			</SettingCard>

			<SettingCard
				id="portaal"
				title="Retourportaal"
				icon={RotateCcw}
				action={
					source.portalHref ? (
						<a href={source.portalHref(draft.portal.handle)} target="_blank" rel="noreferrer" className="flex h-8 items-center gap-1.5 rounded-md px-2.5 font-medium text-arc-ink text-xs hover:bg-arc-tint">
							<ExternalLink className="size-3.5" strokeWidth={1.75} />
							Portaal bekijken
						</a>
					) : undefined
				}
			>
				<div className="flex flex-col">
					<FieldRow label="Portaal aan">
						<span className="flex h-9 items-center">
							<Switch checked={draft.portal.on} onCheckedChange={(on) => set("portal", { ...draft.portal, on })} aria-label="Retourportaal aan" />
						</span>
					</FieldRow>
					<FieldRow label="Adres">
						<span className="flex h-9 items-center text-ink-2 text-sm">{source.portalAddress?.(draft.portal.handle) ?? `goinsyte.com/retour/${draft.portal.handle}`}</span>
					</FieldRow>
					<FieldRow label="Welkomsttekst">
						<span className="flex flex-col gap-1.5">
							<TextAreaField {...fe.control("portal.intro")} aria-label="Welkomsttekst" value={draft.portal.intro} onChange={(intro) => set("portal", { ...draft.portal, intro })} rows={2} />
							{fe.message("portal.intro")}
						</span>
					</FieldRow>
					<FieldRow label="Na de aanvraag">
						<span className="flex flex-col gap-1.5">
							<TextAreaField {...fe.control("portal.done")} aria-label="Na de aanvraag" value={draft.portal.done} onChange={(done) => set("portal", { ...draft.portal, done })} rows={3} />
							{fe.message("portal.done")}
						</span>
					</FieldRow>
				</div>
			</SettingCard>

			<AddressDialog
				key={String(editingAddress)}
				editing={editingAddress === null ? null : editingAddress === "new" ? undefined : draft.addresses[editingAddress]}
				taken={draft.addresses.filter((_, i) => i !== editingAddress).map((a) => a.country)}
				onClose={() => setEditingAddress(null)}
				onSave={(address) => {
					set("addresses", editingAddress === "new" || editingAddress === null ? [...draft.addresses, address] : draft.addresses.map((a, i) => (i === editingAddress ? address : a)));
					setEditingAddress(null);
				}}
			/>
			<WindowDialog
				key={`w-${editingWindow}`}
				editing={editingWindow === null ? null : editingWindow === "new" ? undefined : draft.specialWindows.find((w) => w.id === editingWindow)}
				others={draft.specialWindows.filter((w) => w.id !== editingWindow)}
				onClose={() => setEditingWindow(null)}
				onSave={(w) => {
					set("specialWindows", draft.specialWindows.some((x) => x.id === w.id) ? draft.specialWindows.map((x) => (x.id === w.id ? w : x)) : [...draft.specialWindows, w]);
					setEditingWindow(null);
				}}
			/>
			<RuleDialog
				products={source.products}
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
				// The guard lets the draft through only with every number filled in, so it is the settings again.
				onSave={fe.guard(() => source.save(draft as ReturnSettings, { label: "Retourinstellingen opgeslagen", detail: "Het portaal gebruikt ze meteen." }))}
			/>
			<PageGuide id="settings.returns" title="Retouren" steps={GUIDE} />
		</>
	);
}

const COUNTRIES = ["NL", "BE", "DE", "AT", "FR", "LU", "ES", "IT", "GB", "US"];
const CARRIERS: ReadonlyArray<Carrier> = ["PostNL", "DHL", "DPD", "UPS"];

/** "Adres toevoegen" and its edit: where parcels from a country go, with what the carrier's label needs. Keyed by what it edits. */
function AddressDialog({ editing, taken, onClose, onSave }: { editing: ReturnAddress | null | undefined; taken: ReadonlyArray<string>; onClose: () => void; onSave: (a: ReturnAddress) => void }) {
	const open = editing !== null;
	const [country, setCountry] = useState(editing?.country ?? COUNTRIES.find((c) => !taken.includes(c)) ?? "NL");
	const [label, setLabel] = useState(editing?.label ?? "");
	const [name, setName] = useState(editing?.name ?? "");
	const [line1, setLine1] = useState(editing?.line1 ?? "");
	const [postcode, setPostcode] = useState(editing?.postcode ?? "");
	const [city, setCity] = useState(editing?.city ?? "");
	const [carrier, setCarrier] = useState<Carrier>(editing?.carrier ?? "PostNL");
	const clash = taken.includes(country);
	const ok = !clash && [label, name, line1, postcode, city].every((v) => v.trim() !== "");
	return (
		<FormDialog
			open={open}
			onOpenChange={(o) => !o && onClose()}
			title={editing ? "Adres bewerken" : "Adres toevoegen"}
			description="Pakketten uit dit land gaan naar dit adres, met het label van de vervoerder."
			primaryLabel={editing ? "Opslaan" : "Adres toevoegen"}
			disabled={!ok}
			onSubmit={() =>
				onSave({
					country,
					label: label.trim(),
					name: name.trim(),
					line1: line1.trim(),
					postcode: postcode.trim().toUpperCase(),
					city: city.trim(),
					address: `${name.trim()}, ${line1.trim()}, ${postcode.trim().toUpperCase()} ${city.trim()}`,
					carrier,
				})
			}
		>
			<label className="flex flex-col gap-1.5">
				<span className="font-medium text-ink-3 text-sm">Voor pakketten uit</span>
				<select aria-label="Land" value={country} onChange={(e) => setCountry(e.target.value)} className={cn(INPUT_CLASS, "h-11")}>
					{COUNTRIES.map((c) => (
						<option key={c} value={c}>
							{countryName(c)}
						</option>
					))}
				</select>
				{clash ? <span className="text-signal-amber text-sm">Voor {countryName(country)} is er al een adres.</span> : null}
			</label>
			<label className="flex flex-col gap-1.5">
				<span className="font-medium text-ink-3 text-sm">Naam in de lijst</span>
				<TextField value={label} onChange={setLabel} placeholder="Bijvoorbeeld: Nederland en België" />
			</label>
			<label className="flex flex-col gap-1.5">
				<span className="font-medium text-ink-3 text-sm">Naam op het label</span>
				<TextField value={name} onChange={setName} placeholder="Bijvoorbeeld: Northwind Retouren" />
			</label>
			<label className="flex flex-col gap-1.5">
				<span className="font-medium text-ink-3 text-sm">Straat en huisnummer</span>
				<TextField value={line1} onChange={setLine1} />
			</label>
			<div className="grid grid-cols-[140px_minmax(0,1fr)] gap-2">
				<label className="flex flex-col gap-1.5">
					<span className="font-medium text-ink-3 text-sm">Postcode</span>
					<TextField value={postcode} onChange={setPostcode} />
				</label>
				<label className="flex flex-col gap-1.5">
					<span className="font-medium text-ink-3 text-sm">Plaats</span>
					<TextField value={city} onChange={setCity} />
				</label>
			</div>
			<div className="flex flex-col gap-1.5">
				<span className="font-medium text-ink-3 text-sm">Vervoerder</span>
				<div className="flex flex-wrap gap-1.5">
					{CARRIERS.map((c) => (
						<button key={c} type="button" aria-pressed={carrier === c} onClick={() => setCarrier(c)} className={cn("flex h-8 items-center gap-1.5 rounded-md px-2.5 font-medium text-sm", carrier === c ? "bg-abyss text-mesh-ink" : "bg-mist text-ink-2 hover:text-ink")}>
							<CarrierMark carrier={c} size={16} />
							{c}
						</button>
					))}
				</div>
			</div>
		</FormDialog>
	);
}

function RuleDialog({ products, open, onClose, onAdd }: { products: ReadonlyArray<{ id: string; title: string }>; open: boolean; onClose: () => void; onAdd: (r: ProductRule) => void }) {
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

/**
 * A number of days. Only digits go in: a letter is ignored rather than turning the field into 0. Emptied, it is `null`:
 * "Standaard" where the field has one (`placeholder`), otherwise a field still to fill in, said under it.
 */
function DaysField({ value, onChange, label, placeholder, small = false, control }: { value: number | null; onChange: (v: number | null) => void; label: string; placeholder?: string; small?: boolean; control?: FieldControl }) {
	return (
		<label className={cn("field flex items-center gap-2 rounded-md px-3 focus-within:bg-paper has-[[aria-invalid=true]]:bg-signal-red-bg", small ? "h-8 w-[120px] text-sm" : "h-9 w-40 text-base")}>
			<input
				{...control}
				inputMode="numeric"
				aria-label={label}
				value={value === null ? "" : String(value)}
				placeholder={placeholder}
				onChange={(e) => {
					const d = e.target.value.replace(/[^0-9]/g, "");
					onChange(d === "" ? null : Number(d));
				}}
				className="min-w-0 flex-1 bg-transparent text-ink tabular-nums outline-none placeholder:text-ink-3"
			/>
			<span className="text-ink-3">dagen</span>
		</label>
	);
}

/** The shopper pays the fee in the store's own currency; with stores in several, the same amount in each one's. */
const exchangeFeeHint = (currency: string | null | undefined) =>
	currency === null ? "0 is gratis ruilen. Het bedrag geldt in de valuta van elke winkel." : "0 is gratis ruilen";

/** "12,5" as 12.5; empty is `null`. */
const parseAmount = (text: string) => {
	const t = text.trim().replace(",", ".");
	return t === "" || !/^\d+(\.\d{0,2})?$/.test(t) ? null : Number(t);
};
const showAmount = (n: number | null) => (n === null ? "" : String(n).replace(".", ","));

/**
 * An amount or a percentage, with a decimal comma. What is typed stays as typed ("12," on the way to "12,5"); only
 * digits and one comma with at most two decimals go in (cents, as the amount is kept), and an empty field is `null`,
 * said under it.
 */
function NumberWell({ value, onChange, unit, label, control }: { value: number | null; onChange: (v: number | null) => void; unit: string; label: string; control?: FieldControl }) {
	const [text, setText] = useState(showAmount(value));
	// A value changed from outside (Negeren, a save that came back) replaces what was typed.
	if (parseAmount(text) !== value) setText(showAmount(value));
	return (
		<label className="field flex h-9 w-32 items-center gap-2 rounded-md px-3 text-base focus-within:bg-paper has-[[aria-invalid=true]]:bg-signal-red-bg">
			{unit !== "%" && unit !== "" ? <span className="text-ink-3">{unit}</span> : null}
			<input
				{...control}
				inputMode="decimal"
				aria-label={label}
				value={text}
				onChange={(e) => {
					const next = e.target.value.replace(/\./g, ",").replace(/[^0-9,]/g, "").replace(/^([^,]*,[^,]*),.*$/, "$1").replace(/(,\d{2})\d+$/, "$1");
					setText(next);
					onChange(parseAmount(next));
				}}
				className="min-w-0 flex-1 bg-transparent text-ink tabular-nums outline-none"
			/>
			{unit === "%" ? <span className="text-ink-3">%</span> : null}
		</label>
	);
}

const MONTH_NAMES = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];

/** A day of the year, by day and month: a special window comes back every year. */
function MonthDayField({ value, onChange, label, control }: { value: string; onChange: (v: string) => void; label: string; control: FieldControl }) {
	const [m = 1, d = 1] = value.split("-").map(Number);
	const put = (month: number, day: number) => onChange(`${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
	return (
		<span className="grid grid-cols-[80px_minmax(0,1fr)] gap-2">
			<select {...control} aria-label={`${label}: dag`} value={d} onChange={(e) => put(m, Number(e.target.value))} className={cn(INPUT_CLASS, "h-11", INVALID_CLASS)}>
				{Array.from({ length: 31 }, (_, i) => i + 1).map((n) => (
					<option key={n} value={n}>
						{n}
					</option>
				))}
			</select>
			<select aria-label={`${label}: maand`} value={m} onChange={(e) => put(Number(e.target.value), d)} className={cn(INPUT_CLASS, "h-11")}>
				{MONTH_NAMES.map((name, i) => (
					<option key={name} value={i + 1}>
						{name}
					</option>
				))}
			</select>
		</span>
	);
}

/**
 * "Periode toevoegen" and its edit: a name, the order dates it covers and how many days a return may take for an order
 * placed in it, and not the same period twice, by name or by dates. A wrong field is said once it is left, or all of
 * them when the button is pressed, with the focus on the first.
 */
function WindowDialog({ editing, others, onClose, onSave }: { editing: SpecialWindow | null | undefined; others: ReadonlyArray<SpecialWindow>; onClose: () => void; onSave: (w: SpecialWindow) => void }) {
	const open = editing !== null;
	const [label, setLabel] = useState(editing?.label ?? "");
	const [from, setFrom] = useState(editing?.from ?? "07-01");
	const [to, setTo] = useState(editing?.to ?? "08-31");
	const [days, setDays] = useState<number | null>(editing?.days ?? null);
	const [seen, setSeen] = useState<ReadonlySet<string> | "all">(() => new Set());
	const all = windowErrors({ id: editing?.id ?? "", label, from, to, days }, others);
	const shown = seen === "all" ? all : Object.fromEntries(Object.entries(all).filter(([k]) => seen.has(k)));
	const fe = useFieldErrors(shown, { draftKey: "" });
	const left = (k: string) => setSeen((s) => (s === "all" ? s : new Set([...s, k])));
	return (
		<FormDialog
			open={open}
			onOpenChange={(o) => !o && onClose()}
			title={editing ? "Periode bewerken" : "Periode toevoegen"}
			description="Voor bestellingen in deze periode geldt een eigen retourtermijn, elk jaar opnieuw."
			primaryLabel={editing ? "Opslaan" : "Periode toevoegen"}
			onSubmit={() => {
				if (days === null || Object.keys(all).length > 0) {
					setSeen("all");
					requestAnimationFrame(() => fe.focusFirst(all));
					return;
				}
				onSave({ id: editing?.id ?? `w_${Date.now().toString(36)}`, label: label.trim(), from, to, days });
			}}
		>
			<label className="flex flex-col gap-1.5">
				<span className="font-medium text-ink-3 text-sm">Naam</span>
				<input {...fe.control("label")} aria-label="Naam van de periode" value={label} onChange={(e) => setLabel(e.target.value)} onBlur={() => left("label")} placeholder="Bijvoorbeeld: Feestdagen" className={cn(INPUT_CLASS, "h-11", INVALID_CLASS)} />
				{fe.message("label")}
			</label>
			<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
				<div className="flex flex-col gap-1.5">
					<span className="font-medium text-ink-3 text-sm">Besteld vanaf</span>
					<MonthDayField
						value={from}
						onChange={(v) => {
							setFrom(v);
							left("from");
						}}
						label="Besteld vanaf"
						control={fe.control("from")}
					/>
					{fe.message("from")}
				</div>
				<div className="flex flex-col gap-1.5">
					<span className="font-medium text-ink-3 text-sm">Tot en met</span>
					<MonthDayField
						value={to}
						onChange={(v) => {
							setTo(v);
							left("to");
						}}
						label="Tot en met"
						control={fe.control("to")}
					/>
					{fe.message("to")}
				</div>
			</div>
			<div className="flex flex-col gap-1.5" onBlur={() => left("days")}>
				<span className="font-medium text-ink-3 text-sm">Retourtermijn voor deze bestellingen</span>
				<DaysField value={days} onChange={setDays} label="Retourtermijn voor deze periode in dagen" control={fe.control("days")} />
				{fe.message("days")}
			</div>
		</FormDialog>
	);
}

const MONTHS = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
const md = (s: string) => {
	const [m, d] = s.split("-").map(Number);
	return `${d} ${MONTHS[(m ?? 1) - 1]}`;
};
