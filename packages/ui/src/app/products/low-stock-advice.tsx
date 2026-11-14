import { ProposalPlate } from "../ask/parts"
import { ProductThumb } from "../product/product-thumb"
import type { Decision } from "../stores/ask-store"

/*
 * The low-stock advice as a plate (`LowStockPlate` is the design app's host of it): the product that runs out soonest,
 * the figures it rests on, and the proposal, from whoever hosts it.
 */

/** The product the advice is about, and the figures it rests on, from whoever hosts it. */
export interface LowStockPick {
  title: string
  image: string | undefined
  /** Units on hand over every variant. */
  units: number
  /** Units sold a day, over the last 30 days. */
  perDay: number
  /** How long the units last at that pace; `null` when it did not sell. */
  daysLeft: number | null
  /** Orders with it that are not delivered, cancelled or refunded. */
  openOrders: number
  supplierName: string | undefined
}

/** "is uitverkocht", "is vandaag op" or "is over N dagen op". */
export const whenOf = (units: number, daysLeft: number | null) =>
  units === 0
    ? "is uitverkocht"
    : daysLeft !== null && daysLeft < 1
    ? "is vandaag op"
    : `is over ${Math.round(daysLeft ?? 0)} ${Math.round(daysLeft ?? 0) === 1 ? "dag" : "dagen"} op`

/**
 * The plate itself: the evidence, the proposal and the decision at its foot. `ads` is whether the host can pause the
 * ads still sending buyers to it; without, the proposal is the restock request alone.
 */
export function LowStockAdvice({ pick, ads, decision, onFile, onDiscard, onEdit }: {
  pick: LowStockPick
  ads: boolean
  decision: Decision
  onFile: () => void
  onDiscard: () => void
  onEdit: () => void
}) {
  const { title, units, perDay, daysLeft, openOrders, supplierName } = pick
  const sold = Math.round(perDay * 30)
  const when = whenOf(units, daysLeft)
  const supplier = supplierName ?? "de leverancier"

  return (
    <div className="mb-3">
      <ProposalPlate
        level={2}
        wide
        evidence={
          <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
            <ProductThumb src={pick.image} title={title} size={44} />
            {[
              ["Op voorraad", units.toLocaleString("nl-NL")],
              ["Verkocht, 30 dagen", sold.toLocaleString("nl-NL")],
              ["In open bestellingen", openOrders.toLocaleString("nl-NL")],
              ["Op over", units === 0 ? "nu" : daysLeft === null ? "—" : `${Math.max(0, Math.round(daysLeft))} d`]
            ].map(([k, v]) => (
              <div key={k} className="flex flex-col gap-0.5">
                <span className="text-mesh-ink-2 text-xs">{k}</span>
                <span className="figure text-2xl text-mesh-ink">{v}</span>
              </div>
            ))}
            {supplierName ? <span className="text-mesh-ink-2 text-xs">Leverancier {supplierName}</span> : null}
          </div>
        }
        proposal={{
          title: ads
            ? `Advertenties voor ${title} pauzeren en ${supplier} om nieuwe voorraad vragen`
            : `${supplierName ?? "De leverancier"} om nieuwe voorraad vragen voor ${title}`,
          body: units === 0
            ? `${title} is uitverkocht en verkoopt nog: ${sold} in de bestellingen van de afgelopen 30 dagen. Het zit in ${openOrders} open ${
              openOrders === 1 ? "bestelling" : "bestellingen"
            }.`
            : `${title} ${when} als het tempo zo blijft: nog ${units} over, ongeveer ${
              perDay < 1
                ? `${sold} per maand`
                : `${perDay.toLocaleString("nl-NL", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} per dag`
            }. Het zit in ${openOrders} open ${openOrders === 1 ? "bestelling" : "bestellingen"}.`,
          confidence: Math.min(94, 58 + sold * 3),
          why: ads
            ? `Op basis van ${sold} verkocht in de bestellingen van de afgelopen 30 dagen. Advertenties blijven kopers sturen terwijl de voorraad slinkt.`
            : `Op basis van ${sold} verkocht in de bestellingen van de afgelopen 30 dagen.`,
          fileLabel: ads ? "Pauzeren en vragen" : "Bijbestelling vragen",
          action: { kind: "open", to: "/products" }
        }}
        decision={decision}
        onFile={onFile}
        onDiscard={onDiscard}
        onEdit={onEdit}
      />
    </div>
  )
}
