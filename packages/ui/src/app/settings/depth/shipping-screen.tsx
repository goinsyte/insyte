import { Link } from "@tanstack/react-router"
import { useState } from "react"
import { ArrowRight, Check, Truck } from "../../../icons"
import { filled, type ShipStatus } from "../../lib/settings-depth"
import { cn } from "../../lib/utils"
import { BrandLogo } from "../../marketplace/brand-logos"
import { UnsavedBar } from "../form"
import { BandedList, BandedRow, SettingCard } from "../setting-card"
import { useSection } from "./kit"
import { useSettingsDepthSource } from "./source"

const SHOW: Record<ShipStatus["show"], string> = {
  all: "Overal",
  line: "Alleen in de statusregel",
  hidden: "Niet tonen"
}

/**
 * Verzending (`/settings/shipping`, PLAN 43): what the customer reads for each status the carrier
 * reports — on the order status page, in shipping mails, and when the customer agent answers
 * "waar is mijn pakket". The preview beside it is the status page with the picked row in it.
 */
export function ShippingPage() {
  const source = useSettingsDepthSource()
  const s = useSection("shipping", "Verzending", (a, b) =>
    b.flatMap((x) => {
      const o = a.find((y) => y.id === x.id)
      const out: Array<[string, string, string]> = []
      if (o && o.label !== x.label) out.push([`Wording: ${x.carrier}`, o.label, x.label])
      if (o && o.show !== x.show) out.push([`Tonen: ${x.carrier}`, SHOW[o.show], SHOW[x.show]])
      return out
    }))
  const [pick, setPick] = useState(s.draft.find((x) => x.id === "local")?.id ?? s.draft[0]?.id)
  const set = (id: string, patch: Partial<ShipStatus>) =>
    s.setDraft(s.draft.map((x) => (x.id === id ? { ...x, ...patch } : x)))
  const active = s.draft.find((x) => x.id === pick) ?? s.draft[0]
  const timeline = ["info", "transit", pick, "delivered"].filter((v, i, xs) => v && xs.indexOf(v) === i).map((id) =>
    s.draft.find((x) => x.id === id)
  ).filter((x): x is ShipStatus => !!x && x.show !== "hidden")

  return (
    <>
      <div className="grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,1fr)_300px]">
        <SettingCard
          title="Wat de klant leest"
          icon={Truck}
          subtitle="Per status van de vervoerder de zin die de klant ziet. {vervoerder} wordt de naam van de vervoerder."
        >
          <div className="table-scroll overflow-hidden rounded-xl bg-paper shadow-[0_1px_2px_rgb(0_0_0/0.04)]">
            <div className="grid min-w-[640px] grid-cols-[200px_16px_minmax(0,1fr)_170px_56px] items-center gap-3 bg-mist px-3.5 py-2 font-medium text-ink-3 text-xs">
              <span>Status van de vervoerder</span>
              <span />
              <span>Wat de klant leest</span>
              <span>Waar</span>
              <span className="text-right">Nu</span>
            </div>
            {s.draft.map((x, i) => (
              <div
                key={x.id}
                onFocusCapture={() => setPick(x.id)}
                onPointerDown={() => setPick(x.id)}
                className={cn(
                  "grid min-w-[640px] grid-cols-[200px_16px_minmax(0,1fr)_170px_56px] items-center gap-3 px-3.5 py-1.5 text-sm transition-colors",
                  x.id === pick ? "bg-arc-tint/50" : i % 2 ? "bg-mist/40" : "bg-paper"
                )}
              >
                <span className="truncate text-ink-2">{x.carrier}</span>
                <ArrowRight className="size-3.5 text-ink-4" strokeWidth={1.75} />
                <input
                  value={x.label}
                  disabled={!s.canEdit}
                  onChange={(e) => set(x.id, { label: e.target.value })}
                  aria-label={`Wat de klant leest bij ${x.carrier}`}
                  className="h-8 w-full rounded-md bg-paper px-2.5 text-ink outline-none shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--ink)_7%,transparent)] focus:shadow-[inset_0_0_0_1px_var(--arc)]"
                />
                <select
                  value={x.show}
                  disabled={!s.canEdit}
                  onChange={(e) => set(x.id, { show: e.target.value as ShipStatus["show"] })}
                  aria-label={`Waar bij ${x.carrier}`}
                  className="field h-8 rounded-md px-2 text-ink text-sm outline-none focus:bg-paper"
                >
                  {(Object.keys(SHOW) as Array<ShipStatus["show"]>).map((k) => (
                    <option key={k} value={k}>
                      {SHOW[k]}
                    </option>
                  ))}
                </select>
                <span className="text-right text-ink-3 tabular-nums">{x.orders}</span>
              </div>
            ))}
          </div>
        </SettingCard>

        <aside className="flex flex-col gap-3 xl:sticky xl:top-4 xl:self-start">
          <h2 className="font-medium text-ink text-md">Zo ziet de klant het</h2>
          <div className="flex flex-col gap-4 rounded-xl bg-paper p-4 shadow-[0_1px_2px_rgb(0_0_0/0.04)]">
            <div className="flex flex-col gap-0.5">
              <span className="text-ink-3 text-xs">Bestelling #12218</span>
              <span className="font-medium text-ink text-lg">{active ? filled(active.label) : ""}</span>
            </div>
            <ol className="flex flex-col gap-3">
              {timeline.map((t, i) => {
                const done = i < timeline.findIndex((x) => x.id === active?.id) || t.id === active?.id
                return (
                  <li key={t.id} className="flex items-start gap-2.5 text-sm">
                    <span
                      className={cn(
                        "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-sm",
                        done ? "bg-abyss text-mesh-ink" : "bg-ink/8"
                      )}
                    >
                      {done ? <Check className="size-3" strokeWidth={2.5} /> : null}
                    </span>
                    <span
                      className={cn(t.id === active?.id ? "font-medium text-ink" : done ? "text-ink-2" : "text-ink-3")}
                    >
                      {filled(t.label)}
                    </span>
                  </li>
                )
              })}
            </ol>
            <div className="rounded-lg bg-mist px-3 py-2.5 text-ink-2 text-sm leading-[1.5]">
              <span className="text-ink-3 text-xs">De klantagent op “waar is mijn pakket?”</span>
              <p>
                Je bestelling #12218 is nu:{" "}
                {active ? filled(active.label).toLowerCase() : ""}. De laatste scan was vanochtend om 06:14.
              </p>
            </div>
          </div>
        </aside>
      </div>

      <SettingCard title="Volgen" subtitle="Waar Insyte de status van een zending vandaan haalt.">
        <BandedList>
          <BandedRow
            leading={<BrandLogo brand="17track" name="17TRACK" size={32} />}
            title="17TRACK"
            detail="Niet gekoppeld · nu leest Insyte de statussen uit Shopify, die minder vaak bijwerken"
            trailing={source.trackingUnavailable
              ? <span className="text-ink-3 text-sm">Nog niet beschikbaar</span>
              : (
                <Link
                  to={"/marketplace" as never}
                  className="field flex h-8 items-center rounded-md px-2.5 font-medium text-ink text-sm hover:field-hover"
                >
                  Koppelen
                </Link>
              )}
          />
        </BandedList>
      </SettingCard>
      <UnsavedBar
        visible={s.dirty && s.canEdit}
        onDiscard={s.discard}
        onSave={() =>
          s.save(
            "Verzendstatussen opgeslagen",
            "Klanten lezen de nieuwe zinnen vanaf de volgende update van hun zending."
          )}
      />
    </>
  )
}
