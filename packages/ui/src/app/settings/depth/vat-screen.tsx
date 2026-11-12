import { Receipt } from "../../../icons";
import { Switch } from "../../../components/switch";
import type { StoreVat } from "../../lib/settings-depth";
import { cn } from "../../lib/utils";
import { FieldRow, UnsavedBar } from "../form";
import { SettingCard } from "../setting-card";
import { useSection, WELL } from "./kit";
import { useSettingsDepthSource } from "./source";

const yes = (b: boolean) => (b ? "aan" : "uit");

/**
 * Btw (`/settings/vat`, PLAN 43): per store the currency it sells in and how VAT is counted on
 * shipping and refunds, and the OSS registration for selling across the EU. Analyse and the
 * refund amounts read these.
 */
export function VatPage() {
	const stores = useSettingsDepthSource().stores ?? [];
	const s = useSection("vat", "Btw", (a, b) => {
		const out: Array<[string, string, string]> = [];
		for (const st of b.stores) {
			const o = a.stores.find((x) => x.storeId === st.storeId);
			const name = stores.find((x) => x.id === st.storeId)?.name ?? st.storeId;
			if (!o) continue;
			if (o.currency !== st.currency) out.push([`${name}: valuta`, o.currency, st.currency]);
			if (o.vatOnShipping !== st.vatOnShipping) out.push([`${name}: btw over verzending`, yes(o.vatOnShipping), yes(st.vatOnShipping)]);
			if (o.refundInclVat !== st.refundInclVat) out.push([`${name}: terugbetalen met btw`, yes(o.refundInclVat), yes(st.refundInclVat)]);
		}
		if (a.oss !== b.oss) out.push(["OSS", yes(a.oss), yes(b.oss)]);
		if (a.ossNumber !== b.ossNumber) out.push(["OSS-nummer", a.ossNumber, b.ossNumber]);
		return out;
	});
	const set = (id: string, p: Partial<StoreVat>) => s.setDraft({ ...s.draft, stores: s.draft.stores.map((x) => (x.storeId === id ? { ...x, ...p } : x)) });
	const ossBad = s.draft.oss && !/^[A-Z]{2}[0-9A-Z]{8,12}$/.test(s.draft.ossNumber.replace(/\s/g, ""));
	return (
		<>
			<SettingCard title="Per winkel" icon={Receipt} subtitle="Hoe btw telt bij verzendkosten en bij een terugbetaling.">
				<div className="table-scroll overflow-hidden rounded-xl bg-paper shadow-[0_1px_2px_rgb(0_0_0/0.04)]">
					<div className="grid min-w-[600px] grid-cols-[minmax(0,1fr)_120px_170px_170px] gap-3 bg-mist px-3.5 py-2 font-medium text-ink-3 text-xs">
						<span>Winkel</span>
						<span>Valuta</span>
						<span>Btw over verzending</span>
						<span>Terugbetalen met btw</span>
					</div>
					{s.draft.stores.map((v, i) => (
						<div key={v.storeId} className={cn("grid min-w-[600px] grid-cols-[minmax(0,1fr)_120px_170px_170px] items-center gap-3 px-3.5 py-2 text-sm", i % 2 ? "bg-mist/40" : "bg-paper")}>
							<span className="truncate font-medium text-ink">{stores.find((x) => x.id === v.storeId)?.name ?? v.storeId}</span>
							<select value={v.currency} disabled={!s.canEdit} onChange={(e) => set(v.storeId, { currency: e.target.value as StoreVat["currency"] })} aria-label="Valuta" className="field h-8 rounded-md px-2 text-ink text-sm outline-none focus:bg-paper">
								<option value="EUR">EUR · euro</option>
								<option value="USD">USD · dollar</option>
								<option value="GBP">GBP · pond</option>
							</select>
							<label className="flex items-center gap-2 text-ink-2">
								<Switch checked={v.vatOnShipping} disabled={!s.canEdit} onCheckedChange={(c) => set(v.storeId, { vatOnShipping: c })} />
								{v.vatOnShipping ? "Ja" : "Nee"}
							</label>
							<label className="flex items-center gap-2 text-ink-2">
								<Switch checked={v.refundInclVat} disabled={!s.canEdit} onCheckedChange={(c) => set(v.storeId, { refundInclVat: c })} />
								{v.refundInclVat ? "Ja" : "Nee"}
							</label>
						</div>
					))}
				</div>
			</SettingCard>
			<SettingCard title="Verkopen in de EU" subtitle="Met de OSS-regeling geef je de btw van alle EU-landen op één plek aan.">
				<div className="flex flex-col">
					<FieldRow label="OSS-registratie">
						<label className="flex items-center gap-2.5 sm:pt-1.5">
							<Switch checked={s.draft.oss} disabled={!s.canEdit} onCheckedChange={(oss) => s.setDraft({ ...s.draft, oss })} />
							<span className="text-ink text-sm">{s.draft.oss ? "Geregistreerd" : "Niet geregistreerd"}</span>
						</label>
					</FieldRow>
					{s.draft.oss ? (
						<FieldRow label="OSS-nummer" hint="Je btw-nummer met landcode.">
							<span className="flex flex-col gap-1">
								<input value={s.draft.ossNumber} disabled={!s.canEdit} onChange={(e) => s.setDraft({ ...s.draft, ossNumber: e.target.value.toUpperCase() })} aria-invalid={ossBad} aria-label="OSS-nummer" className={cn(WELL, "tabular-nums aria-[invalid=true]:bg-signal-red-bg")} />
								{ossBad ? <span className="text-signal-red text-xs">Een nummer als NL123456789B01: landcode en dan cijfers.</span> : null}
							</span>
						</FieldRow>
					) : null}
				</div>
			</SettingCard>
			<UnsavedBar visible={s.dirty && s.canEdit && !ossBad} onDiscard={s.discard} onSave={() => s.save("Btw opgeslagen", "Analyse en nieuwe terugbetalingen rekenen er vanaf nu mee.")} />
		</>
	);
}
