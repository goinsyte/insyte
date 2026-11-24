import { useState } from "react"
import { money, stamp } from "../../fixtures/order-desk.ts"
import { customer, product } from "../../fixtures/records.ts"
import type { Carrier } from "../../fixtures/records.ts"
import {
  amountOf,
  changeReturns,
  findReturn,
  giftCardCode,
  itemsOf,
  moveReturn,
  photoMissing,
  photoRequired,
  restoreReturns,
  RETURN_SETTINGS,
  returnsNow,
  validTracking
} from "../../fixtures/returns.ts"
import type { InShopify, Resolution, ReturnRecord } from "../../fixtures/returns.ts"
import { ME } from "../../fixtures/workspace.ts"
import { Link, paths } from "../../router.tsx"
import { copyAndSay, saveFile, undoable } from "../../ui/acts.ts"
import { Button } from "../../ui/button.tsx"
import { Checkbox } from "../../ui/checkbox.tsx"
import { Dialog } from "../../ui/dialog.tsx"
import { Copy, Download, Image, RotateCcw, Truck } from "../../ui/icons.tsx"
import { Field, Input } from "../../ui/input.tsx"
import { Notice } from "../../ui/notice.tsx"
import { PageSection } from "../../ui/page.tsx"
import { ServiceLogo } from "../../ui/service-logo.tsx"
import { Spinner } from "../../ui/spinner.tsx"

/*
 * The parts of one return that came over from `/app`'s `returns/parts.tsx`: the lines coming back,
 * the shopper's photos, the label and its carrier, and what the resolution made in Shopify.
 */

/** Every line coming back, with the total when there is more than one. */
export function Items({ r }: { readonly r: ReturnRecord }) {
  const items = itemsOf(r)
  if (items.length === 1) {
    const [only] = items
    if (only === undefined) return null
    return (
      <p className="text-sm text-ink">
        <Link to={paths.product(only.productId)} className="font-medium hover:underline">
          {product(only.productId)?.name ?? only.productId}
        </Link>
        {` · maat ${only.size} · ${only.qty}× `}
        <span className="figure">{money(only.unitPrice)}</span>
      </p>
    )
  }
  return (
    <div className="flex flex-col gap-1.5">
      <ul aria-label="Artikelen" className="flex flex-col gap-1.5">
        {items.map((i) => (
          <li key={`${i.productId}-${i.size}`} className="flex items-baseline justify-between gap-4 text-sm">
            <span className="min-w-0 text-ink">
              <Link to={paths.product(i.productId)} className="font-medium hover:underline">
                {product(i.productId)?.name ?? i.productId}
              </Link>
              <span className="text-ink-2">{` · maat ${i.size} · ${i.qty}×`}</span>
            </span>
            <span className="figure shrink-0 text-ink-2">{money(i.unitPrice * i.qty)}</span>
          </li>
        ))}
      </ul>
      <p className="flex items-baseline justify-between gap-4 text-sm font-medium text-ink">
        <span>{items.length} artikelen</span>
        <span className="figure">{money(amountOf(r))}</span>
      </p>
    </div>
  )
}

/** The shopper's photos, or the warning that a reason which needs one came without. */
export function Photos({ r, edit }: { readonly r: ReturnRecord; readonly edit: boolean }) {
  const [open, setOpen] = useState<string | null>(null)
  const photos = r.photos ?? []
  const shown = photos.find((x) => x.id === open)
  const asked = r.events.some((e) => e.text.startsWith("Foto gevraagd"))
  if (photoMissing(r)) {
    return (
      <Notice
        tone="warn"
        title="Geen foto bijgevoegd"
        action={edit && !asked && (
          <Button
            size="sm"
            onClick={() => {
              const before = changeReturns((st) =>
                moveReturn(st, r, {}, "Foto gevraagd aan de klant, per mail", ME.name)
              )
              undoable("Foto gevraagd", () => restoreReturns(before), "De klant krijgt een mail met een uploadlink.")
            }}
          >
            Foto vragen
          </Button>
        )}
      >
        Een foto is verplicht voor deze reden, maar de klant stuurde er geen.
        {asked ? " Er is om een foto gevraagd; de retour wacht daarop." : ""}
      </Notice>
    )
  }
  if (photos.length === 0) return null
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-medium text-ink-3">
        Foto's van de klant{photoRequired(r) ? "" : " (niet verplicht)"}
      </p>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {photos.map((x) => (
          <li key={x.id}>
            <button
              type="button"
              onClick={() => setOpen(x.id)}
              className="flex w-full flex-col gap-1.5 text-left"
            >
              <span className="flex aspect-4/3 w-full items-center justify-center rounded-md bg-well text-ink-3 transition-colors hover:bg-hover">
                <Image size={22} />
              </span>
              <span className="truncate text-xs text-ink-2">{x.caption}</span>
            </button>
          </li>
        ))}
      </ul>
      <Dialog
        open={shown !== undefined}
        onClose={() => setOpen(null)}
        title={shown?.name ?? ""}
        description={shown?.caption}
        size="lg"
      >
        <span className="mb-2 flex aspect-4/3 w-full items-center justify-center rounded-md bg-well text-ink-3">
          <Image size={36} />
        </span>
      </Dialog>
    </div>
  )
}

const CARRIERS: ReadonlyArray<Carrier> = ["PostNL", "DHL", "DPD", "UPS"]

/** The label as a page to print: who it is from, where it goes, the carrier and the code. */
function labelPage(r: ReturnRecord): string {
  const who = customer(r.customerId)
  const label = r.label
  return `<!doctype html><meta charset="utf-8"><title>Retourlabel ${r.number}</title>
<body style="font:14px/1.5 system-ui;padding:32px;max-width:420px">
<h1 style="font-size:18px">Retourlabel ${r.number}</h1>
<p><strong>Van</strong><br>${who?.name ?? ""}<br>${who?.city ?? ""}</p>
<p><strong>Naar</strong><br>${RETURN_SETTINGS.address}</p>
<p><strong>${label?.carrier ?? ""}</strong> ${label?.tracking ?? ""}<br>Bestelling #${r.orderNumber}</p>
</body>`
}

/**
 * Where the parcel is: the label (made, sent, failed) with its download, the carrier's scan that
 * puts it on its way, and the tracking a shopper gives who sent it with their own carrier.
 */
export function LabelSection({ r, edit }: { readonly r: ReturnRecord; readonly edit: boolean }) {
  const [making, setMaking] = useState(false)
  const [tracking, setTracking] = useState(false)
  const waiting = r.status === "wacht-op-pakket" || r.status === "onderweg"
  if (r.label === undefined && !waiting) return null
  const label = r.label

  const remake = () => {
    setMaking(true)
    globalThis.setTimeout(() => {
      setMaking(false)
      const current = findReturn(r.id) ?? r
      const carrier = current.label?.carrier ?? "PostNL"
      const at = returnsNow()
      const before = changeReturns((st) =>
        moveReturn(
          st,
          current,
          { label: { carrier, tracking: `3SNWD${current.number.slice(2).padStart(5, "0")}9`, madeAt: at, sentAt: at } },
          `Retourlabel van ${carrier} opnieuw gemaakt en naar de klant gestuurd`,
          ME.name
        )
      )
      undoable("Label gemaakt en verstuurd", () => restoreReturns(before), "De klant krijgt het in de mail.")
    }, 900)
  }
  const scan = () => {
    if (label === undefined) return
    const before = changeReturns((st) =>
      moveReturn(st, r, { status: "onderweg" }, `Pakket aangenomen bij een ${label.carrier}-punt`, label.carrier)
    )
    undoable("Pakket aangenomen", () => restoreReturns(before), `${label.carrier} heeft het pakket gescand.`)
  }

  return (
    <PageSection title="Retourlabel" id="label">
      {making
        ? (
          <p className="flex items-center gap-2 text-sm text-ink-2" role="status">
            <Spinner size={14} />
            Wordt gemaakt bij de vervoerder…
          </p>
        )
        : label?.failed !== undefined
        ? (
          <Notice
            tone="bad"
            title="Het label kon niet worden gemaakt"
            action={edit && <Button size="sm" icon={<RotateCcw />} onClick={remake}>Opnieuw maken</Button>}
          >
            {label.carrier} meldt dat {label.failed}. Kijk het retouradres na en maak het opnieuw.
          </Notice>
        )
        : label !== undefined
        ? (
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
            <span className="flex items-center gap-3">
              <ServiceLogo service={label.carrier} name={label.carrier} size={32} />
              <span className="min-w-0 text-sm">
                <span className="text-ink">
                  {label.carrier} <span className="figure">{label.tracking}</span>
                </span>
                <span className="block text-xs text-ink-3">
                  {label.byShopper === true
                    ? `Door de klant verstuurd, ingevuld ${stamp(new Date(label.madeAt))}`
                    : label.sentAt === undefined
                    ? `Gemaakt ${stamp(new Date(label.madeAt))}, nog niet verstuurd`
                    : `Verstuurd ${stamp(new Date(label.sentAt))}`}
                </span>
              </span>
            </span>
            <span className="flex flex-wrap gap-2">
              {label.byShopper !== true && (
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<Download />}
                  onClick={() => saveFile(`retourlabel-${r.number}.html`, labelPage(r), "text/html")}
                >
                  Label downloaden
                </Button>
              )}
              {edit && r.status === "wacht-op-pakket" && label.sentAt !== undefined && (
                <Button size="sm" icon={<Truck />} onClick={scan}>Scan van vervoerder</Button>
              )}
            </span>
          </div>
        )
        : <p className="text-sm text-ink-3">Er is nog geen label.</p>}
      {edit && r.status === "wacht-op-pakket" && !making && (
        <button
          type="button"
          onClick={() => setTracking(true)}
          className="self-start text-xs text-ink-3 underline underline-offset-2 hover:text-ink pointer-coarse:min-h-11"
        >
          De klant stuurde het zelf op? Tracking invullen
        </button>
      )}
      <TrackingDialog r={r} open={tracking} onClose={() => setTracking(false)} />
    </PageSection>
  )
}

function TrackingDialog({ r, open, onClose }: {
  readonly r: ReturnRecord
  readonly open: boolean
  readonly onClose: () => void
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Tracking invullen"
      description="Voor een pakket dat de klant met een eigen vervoerder stuurde. De retour gaat dan op onderweg."
    >
      {open && <TrackingForm r={r} onDone={onClose} />}
    </Dialog>
  )
}

function TrackingForm({ r, onDone }: { readonly r: ReturnRecord; readonly onDone: () => void }) {
  const [carrier, setCarrier] = useState<Carrier>(r.label?.carrier ?? "PostNL")
  const [code, setCode] = useState("")
  const [byShopper, setByShopper] = useState(true)
  const [tried, setTried] = useState(false)
  const wrong = validTracking(code) ? undefined : "Een trackingcode heeft 4 tot 40 letters, cijfers of streepjes"
  const save = () => {
    setTried(true)
    if (wrong !== undefined) return
    const at = returnsNow()
    const before = changeReturns((st) =>
      moveReturn(
        st,
        r,
        {
          status: "onderweg",
          label: {
            carrier,
            tracking: code.trim().toUpperCase(),
            madeAt: at,
            sentAt: at,
            ...(byShopper ? { byShopper } : {})
          }
        },
        `Tracking ingevuld: ${carrier} ${code.trim().toUpperCase()}${byShopper ? ", verstuurd door de klant" : ""}`,
        ME.name
      )
    )
    onDone()
    undoable("Tracking opgeslagen", () => restoreReturns(before), `${r.number} staat op onderweg.`)
  }
  return (
    <form
      className="flex flex-col gap-4 pb-2"
      onSubmit={(event) => {
        event.preventDefault()
        save()
      }}
    >
      <fieldset className="flex flex-col gap-1.5">
        <legend className="pb-1.5 text-xs font-medium text-ink">Vervoerder</legend>
        <div className="flex flex-wrap gap-1.5">
          {CARRIERS.map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={carrier === c}
              onClick={() => setCarrier(c)}
              className={carrier === c
                ? "inline-flex h-8 items-center gap-1.5 rounded-sm bg-selected px-2.5 text-sm font-medium text-ink ring-1 ring-line-strong pointer-coarse:h-11"
                : "inline-flex h-8 items-center gap-1.5 rounded-sm px-2.5 text-sm text-ink-2 hover:bg-hover hover:text-ink pointer-coarse:h-11"}
            >
              <ServiceLogo service={c} name={c} size={16} bare />
              {c}
            </button>
          ))}
        </div>
      </fieldset>
      <Field label="Trackingcode" error={tried ? wrong : undefined}>
        {(f) => (
          <Input
            {...f}
            autoFocus
            value={code}
            placeholder="3SABC1234567"
            autoCapitalize="characters"
            onChange={(e) => setCode(e.target.value)}
          />
        )}
      </Field>
      <Checkbox checked={byShopper} onChange={setByShopper} label="Door de klant verstuurd, niet met ons label" />
      <div className="flex flex-wrap justify-end gap-2 pt-2">
        <Button variant="ghost" onClick={onDone}>Annuleren</Button>
        <Button variant="primary" type="submit">Opslaan</Button>
      </div>
    </form>
  )
}

/* ── what the resolution made in Shopify ──────────────────────────────────────────────────────── */

const WHAT: Readonly<Record<Resolution, string>> = {
  terugbetalen: "De terugbetaling",
  cadeaubon: "De cadeaubon",
  ruilen: "De ruilbestelling",
  "nieuw-artikel": "De nieuwe bestelling"
}

/** Shopify's first try for a new item timed out once this visit; the retry goes through. */
const tried = new Set<string>()

/** Ask Shopify for what the resolution gives: a gift card with its code, or a new order. */
export function makeInShopify(id: string) {
  globalThis.setTimeout(() => {
    const r = findReturn(id)
    const res = r?.resolution
    if (r === undefined || res === undefined || res.shopify?.state !== "maken") return
    const fails = res.kind === "nieuw-artikel" && !tried.has(id)
    tried.add(id)
    const shopify: InShopify = fails
      ? { state: "mislukt", reason: "Shopify antwoordde niet op tijd" }
      : res.kind === "cadeaubon"
      ? { state: "gemaakt", code: giftCardCode(r) }
      : res.kind === "terugbetalen"
      ? { state: "gemaakt" }
      : { state: "gemaakt", order: `#${r.orderNumber}-R1` }
    const text = shopify.state === "mislukt"
      ? `${WHAT[res.kind]} kon niet worden gemaakt in Shopify: ${shopify.reason}`
      : res.kind === "cadeaubon"
      ? `Cadeaubon gemaakt in Shopify en gemaild aan de klant`
      : res.kind === "terugbetalen"
      ? "Terugbetaling verwerkt in Shopify"
      : `Bestelling #${r.orderNumber}-R1 gemaakt in Shopify`
    changeReturns((st) => moveReturn(st, r, { resolution: { ...res, shopify } }, text, "Shopify"))
  }, 1200)
}

/** The line under a resolution: being made, made (with the code or the order), or failed with a retry. */
export function InShopifyLine({ r, edit }: { readonly r: ReturnRecord; readonly edit: boolean }) {
  const res = r.resolution
  const shopify = res?.shopify
  if (res === undefined || shopify === undefined) return null
  const name = customer(r.customerId)?.name ?? "de klant"
  if (shopify.state === "maken") {
    return (
      <p className="flex items-center gap-2 text-sm text-ink-2" role="status">
        <Spinner size={14} />
        {WHAT[res.kind]} wordt gemaakt in Shopify…
      </p>
    )
  }
  if (shopify.state === "mislukt") {
    return (
      <Notice
        tone="bad"
        title={`${WHAT[res.kind]} kon niet worden gemaakt in Shopify`}
        action={edit && (
          <Button
            size="sm"
            icon={<RotateCcw />}
            onClick={() => {
              changeReturns((st) =>
                moveReturn(
                  st,
                  r,
                  { resolution: { ...res, shopify: { state: "maken" } } },
                  "Opnieuw geprobeerd in Shopify",
                  ME.name
                )
              )
              makeInShopify(r.id)
            }}
          >
            Opnieuw proberen
          </Button>
        )}
      >
        {shopify.reason}. Er is nog niets naar {name} gegaan.
      </Notice>
    )
  }
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-2">
      {res.kind === "cadeaubon" && shopify.code !== undefined
        ? (
          <>
            <span>
              Cadeaubon gemaakt in Shopify:{" "}
              <span className="figure font-medium text-ink">{shopify.code}</span>, gemaild aan {name}.
            </span>
            <Button size="sm" variant="ghost" icon={<Copy />} onClick={() => copyAndSay(shopify.code ?? "", "Code")}>
              Kopiëren
            </Button>
          </>
        )
        : shopify.order !== undefined
        ? (
          <span>
            Bestelling <span className="figure font-medium text-ink">{shopify.order}</span>{" "}
            gemaakt in Shopify; hij gaat vandaag de deur uit.
          </span>
        )
        : <span>Verwerkt in Shopify; {name} ziet het geld binnen 3 werkdagen.</span>}
    </div>
  )
}
