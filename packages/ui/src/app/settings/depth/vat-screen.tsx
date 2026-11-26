import { Switch } from "../../../components/switch"
import { Receipt } from "../../../icons"
import { ossValid, type StoreVat, vatErrors } from "../../lib/settings-depth"
import { cn } from "../../lib/utils"
import { FieldRow, INVALID_CLASS, UnsavedBar, useFieldErrors } from "../form"
import { SettingCard } from "../setting-card"
import { useSection, WELL } from "./kit"
import { useSettingsDepthSource } from "./source"

const yes = (b: boolean) => (b ? "aan" : "uit")

const CURRENCY_NAME: Record<string, string> = { EUR: "euro", USD: "dollar", GBP: "pond" }

/** "USD · dollar", or the code alone for a currency without a Dutch name here; "—" before the store says. */
const currencyLabel = (code: string | null) =>
  code === null ? "—" : CURRENCY_NAME[code] === undefined ? code : `${code} · ${CURRENCY_NAME[code]}`

/**
 * Btw (`/settings/vat`, PLAN 43): per store how VAT is counted on shipping and refunds, beside the
 * currency it sells in (Shopify's, shown and not set here), and the OSS registration for selling
 * across the EU. Analyse and the refund amounts read these.
 */
export function VatPage() {
  const stores = useSettingsDepthSource().stores ?? []
  const nameOf = (id: string) => stores.find((x) => x.id === id)?.name ?? id
  const s = useSection("vat", "Btw", (a, b) => {
    const out: Array<[string, string, string]> = []
    for (const st of b.stores) {
      const o = a.stores.find((x) => x.storeId === st.storeId)
      const name = stores.find((x) => x.id === st.storeId)?.name ?? st.storeId
      if (!o) continue
      if (o.vatOnShipping !== st.vatOnShipping) {
        out.push([`${name}: btw over verzending`, yes(o.vatOnShipping), yes(st.vatOnShipping)])
      }
      if (o.refundInclVat !== st.refundInclVat) {
        out.push([`${name}: terugbetalen met btw`, yes(o.refundInclVat), yes(st.refundInclVat)])
      }
    }
    if (a.oss !== b.oss) out.push(["OSS", yes(a.oss), yes(b.oss)])
    if (a.ossNumber !== b.ossNumber) out.push(["OSS-nummer", a.ossNumber, b.ossNumber])
    return out
  })
  const set = (id: string, p: Partial<StoreVat>) =>
    s.setDraft({ ...s.draft, stores: s.draft.stores.map((x) => (x.storeId === id ? { ...x, ...p } : x)) })
  const fe = useFieldErrors(vatErrors(s.draft), { draftKey: JSON.stringify(s.draft) })
  /*
   * OSS off takes a number that is not right with it (back to the saved one where that is right), so a number nobody
   * sees any more is never saved, and does not come back wrong when OSS goes on again.
   */
  const setOss = (oss: boolean) =>
    s.setDraft({
      ...s.draft,
      oss,
      ossNumber: oss || ossValid(s.draft.ossNumber)
        ? s.draft.ossNumber
        : ossValid(s.saved.ossNumber)
        ? s.saved.ossNumber
        : ""
    })
  return (
    <>
      <SettingCard
        title="Per winkel"
        icon={Receipt}
        subtitle="Hoe btw telt bij verzendkosten en bij een terugbetaling."
      >
        <div className="table-scroll overflow-hidden rounded-xl bg-paper shadow-[0_1px_2px_rgb(0_0_0/0.04)]">
          <div className="grid min-w-[600px] grid-cols-[minmax(0,1fr)_120px_170px_170px] gap-3 bg-mist px-3.5 py-2 font-medium text-ink-3 text-xs">
            <span>Winkel</span>
            <span>Valuta</span>
            <span>Btw over verzending</span>
            <span>Terugbetalen met btw</span>
          </div>
          {s.draft.stores.map((v, i) => (
            <div
              key={v.storeId}
              className={cn(
                "grid min-w-[600px] grid-cols-[minmax(0,1fr)_120px_170px_170px] items-center gap-3 px-3.5 py-2 text-sm",
                i % 2 ? "bg-mist/40" : "bg-paper"
              )}
            >
              <span className="truncate font-medium text-ink">
                {stores.find((x) => x.id === v.storeId)?.name ?? v.storeId}
              </span>
              <span className="text-ink-2 tabular-nums" title="Uit Shopify">{currencyLabel(v.currency)}</span>
              <label className="flex items-center gap-2 text-ink-2">
                <Switch
                  aria-label={`Btw over verzending voor ${nameOf(v.storeId)}`}
                  checked={v.vatOnShipping}
                  disabled={!s.canEdit}
                  onCheckedChange={(c) => set(v.storeId, { vatOnShipping: c })}
                />
                {v.vatOnShipping ? "Ja" : "Nee"}
              </label>
              <label className="flex items-center gap-2 text-ink-2">
                <Switch
                  aria-label={`Terugbetalen met btw voor ${nameOf(v.storeId)}`}
                  checked={v.refundInclVat}
                  disabled={!s.canEdit}
                  onCheckedChange={(c) => set(v.storeId, { refundInclVat: c })}
                />
                {v.refundInclVat ? "Ja" : "Nee"}
              </label>
            </div>
          ))}
        </div>
        <p className="mt-2 text-ink-3 text-xs">
          De valuta van een winkel komt uit Shopify. Start, Analyse en Kosten rekenen om naar de valuta die je onder
          Regio kiest.
        </p>
      </SettingCard>
      <SettingCard
        title="Verkopen in de EU"
        subtitle="Met de OSS-regeling geef je de btw van alle EU-landen op één plek aan."
      >
        <div className="flex flex-col">
          <FieldRow label="OSS-registratie">
            <label className="flex items-center gap-2.5 sm:pt-1.5">
              <Switch
                aria-label="OSS-registratie"
                checked={s.draft.oss}
                disabled={!s.canEdit}
                onCheckedChange={setOss}
              />
              <span className="text-ink text-sm">{s.draft.oss ? "Geregistreerd" : "Niet geregistreerd"}</span>
            </label>
          </FieldRow>
          {s.draft.oss || fe.errors["ossNumber"] !== undefined ?
            (
              <FieldRow label="OSS-nummer" hint="Je btw-nummer met landcode.">
                <span className="flex flex-col gap-1">
                  <input
                    {...fe.control("ossNumber")}
                    value={s.draft.ossNumber}
                    disabled={!s.canEdit}
                    onChange={(e) => s.setDraft({ ...s.draft, ossNumber: e.target.value.toUpperCase() })}
                    aria-label="OSS-nummer"
                    className={cn(WELL, "tabular-nums", INVALID_CLASS)}
                  />
                  {fe.message("ossNumber")}
                </span>
              </FieldRow>
            ) :
            null}
        </div>
      </SettingCard>
      <UnsavedBar
        visible={s.dirty && s.canEdit}
        onDiscard={s.discard}
        onSave={fe.guard(() => s.save("Btw opgeslagen", "Analyse en nieuwe terugbetalingen rekenen er vanaf nu mee."))}
      />
    </>
  )
}
