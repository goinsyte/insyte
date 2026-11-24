import { useState } from "react"
import {
  lookupOrder,
  PORTAL_DEMO,
  portalStore,
  REASONS,
  RESOLUTION_DETAIL,
  RESOLUTION_LABEL,
  returnAddress,
  STATUS_LABEL
} from "../../fixtures/public.ts"
import type {
  OpenRequest,
  PortalLine,
  PortalOrder,
  PortalStore,
  Reason,
  Resolution,
  ReturnKind
} from "../../fixtures/public.ts"
import { euro } from "../../fixtures/records.ts"
import { Button, buttonClass } from "../../ui/button.tsx"
import { cx } from "../../ui/cx.ts"
import { FileDrop } from "../../ui/file-drop.tsx"
import { Check, Image, MapPin, Printer, RotateCcw, Store, X } from "../../ui/icons.tsx"
import { Field, Input, Textarea } from "../../ui/input.tsx"
import { QrCode } from "../../ui/qr.tsx"
import { EmptyState, ErrorState } from "../../ui/states.tsx"
import { dataState, setView, useView } from "../../view.ts"
import {
  BackButton,
  ChoiceButton,
  dayMonth,
  isEmail,
  LoadingStep,
  pause,
  PublicFrame,
  Row,
  Step,
  Title
} from "./frame.tsx"

/*
 * The return portal (`/app/retour/$storeHandle`): the page a shopper reaches from the shipping mail.
 * Look the order up by its number and the address it was placed with, then either send something
 * back (which item, why, what you want instead, how you hand it in) or report a problem (which item,
 * what is wrong, photos, what you want). Lines that cannot go back say why in the shopper's words.
 * An order with a request already open shows that request instead; an approved one shows its label
 * and the QR code to scan at the drop-off point.
 */

type StepId = "lookup" | "kind" | "items" | "reason" | "photos" | "resolution" | "method" | "summary" | "done"
type Method = "qr" | "print"
type Photo = { readonly url: string; readonly name: string }

const LOOKUP_PROBLEM = {
  not_found:
    "We vinden geen bestelling met dit nummer en e-mailadres. Kijk in je bevestigingsmail welk bestelnummer en e-mailadres erbij horen.",
  rate_limited: "Te veel pogingen. Probeer het later opnieuw."
} as const

const PHOTO_PROBLEM = {
  type: "Dat bestand is geen foto. Kies een JPG, PNG of HEIC.",
  size: "Die foto is groter dan 10 MB. Kies een kleinere."
} as const

const MAX_TRIES = 5

export function ReturnPortalScreen({ handle }: { readonly handle: string }) {
  const view = useView()
  const store = portalStore(handle)
  if (store === undefined) {
    return (
      <PublicFrame brand="Retourportaal">
        <EmptyState glyph={Store} title="Deze winkel vinden we niet">
          Controleer het adres in je verzendmail. Daar staat de juiste link naar het retourportaal.
        </EmptyState>
      </PublicFrame>
    )
  }
  const data = dataState(view)
  if (data === "empty" || !store.on) {
    return (
      <PublicFrame brand={store.name}>
        <EmptyState
          glyph={RotateCcw}
          title="Retourneren via dit portaal kan nu niet"
          action={
            <a href={`mailto:${store.email}`} className={buttonClass("secondary", "md", "min-h-10")}>
              Mail {store.email}
            </a>
          }
        >
          Mail ons met je bestelnummer, dan helpen we je verder.
        </EmptyState>
      </PublicFrame>
    )
  }
  if (data === "loading") {
    return (
      <PublicFrame brand={store.name}>
        <LoadingStep />
      </PublicFrame>
    )
  }
  if (data === "error") {
    return (
      <PublicFrame brand={store.name}>
        <ErrorState
          title="Het retourportaal laadt niet"
          detail="503 · portal.lookup"
          action={<Button onClick={() => setView({ staat: "gewoon" })}>Opnieuw proberen</Button>}
        >
          Er ging iets mis aan onze kant. Probeer het over een minuut opnieuw.
        </ErrorState>
      </PublicFrame>
    )
  }
  return <Portal store={store} />
}

function Portal({ store }: { readonly store: PortalStore }) {
  const [step, setStep] = useState<StepId>("lookup")
  const [number, setNumber] = useState("")
  const [email, setEmail] = useState("")
  const [fieldErrors, setFieldErrors] = useState<{ number?: string; email?: string }>({})
  const [problem, setProblem] = useState<string | null>(null)
  const [tries, setTries] = useState(0)
  const [busy, setBusy] = useState(false)
  const [order, setOrder] = useState<PortalOrder | null>(null)
  const [kind, setKind] = useState<ReturnKind>("return")
  const [picked, setPicked] = useState<ReadonlyArray<string>>([])
  const [reason, setReason] = useState<Reason | null>(null)
  const [note, setNote] = useState("")
  const [photos, setPhotos] = useState<ReadonlyArray<Photo>>([])
  const [photoError, setPhotoError] = useState<string | undefined>()
  const [resolution, setResolution] = useState<Resolution | null>(null)
  const [exchangeTo, setExchangeTo] = useState<string | null>(null)
  const [method, setMethod] = useState<Method>("qr")
  const [made, setMade] = useState<string | null>(null)

  const go = (to: StepId) => {
    setStep(to)
    window.scrollTo({ top: 0 })
  }

  const lines = order?.lines ?? []
  const chosen = lines.filter((l) => picked.includes(l.id))
  const amount = chosen.reduce((sum, l) => sum + l.price, 0)
  const notArrived = order !== null && order.delivered === null
  const reasons = REASONS.filter((r) =>
    r.kind === kind && (kind === "return" || (notArrived ? r.id === "not_arrived" : r.id !== "not_arrived"))
  )
  const options: ReadonlyArray<Resolution> = kind === "claim"
    ? ["replacement", "refund"]
    : (chosen.every((l) => l.exchange.length > 0) && chosen.length === 1
      ? ["exchange", "refund", "gift_card"]
      : ["refund", "gift_card"])
  const address = returnAddress(order?.country ?? "NL")
  const claimStep = (i: number) =>
    kind === "claim" && !notArrived
      ? (
        <p className="figure text-sm text-ink-3">
          Stap {i} van {store.claimSteps.length} · {store.claimSteps[i - 1]}
        </p>
      )
      : null

  const lookup = async () => {
    const errors = {
      number: number.trim() === "" ? "Vul je bestelnummer in." : undefined,
      email: isEmail(email) ? undefined : "Vul een geldig e-mailadres in."
    }
    setFieldErrors(errors)
    setProblem(null)
    if (errors.number !== undefined || errors.email !== undefined) return
    if (tries >= MAX_TRIES) {
      setProblem(LOOKUP_PROBLEM.rate_limited)
      return
    }
    setBusy(true)
    await pause(800)
    setBusy(false)
    const result = lookupOrder(store, number, email)
    if (!result.ok) {
      setTries((n) => n + 1)
      setProblem(tries + 1 >= MAX_TRIES ? LOOKUP_PROBLEM.rate_limited : LOOKUP_PROBLEM[result.problem])
      return
    }
    setOrder(result.order)
    go("kind")
  }

  const addPhotos = (files: ReadonlyArray<File>) => {
    setPhotoError(undefined)
    const good: Photo[] = []
    for (const file of files) {
      if (!file.type.startsWith("image/")) {
        setPhotoError(PHOTO_PROBLEM.type)
        continue
      }
      if (file.size > 10_000_000) {
        setPhotoError(PHOTO_PROBLEM.size)
        continue
      }
      good.push({ url: URL.createObjectURL(file), name: file.name })
    }
    setPhotos((now) => [...now, ...good])
  }

  const submit = async () => {
    setBusy(true)
    await pause(900)
    setBusy(false)
    setMade("R-1049")
    go("done")
  }

  const restart = () => {
    setOrder(null)
    setNumber("")
    setEmail("")
    setPicked([])
    setReason(null)
    setNote("")
    setPhotos([])
    setResolution(null)
    setExchangeTo(null)
    setMade(null)
    setTries(0)
    go("lookup")
  }

  const next = {
    afterReason: (): StepId => (reason?.photo === true ? "photos" : "resolution"),
    afterResolution: (): StepId => (kind === "return" ? "method" : "summary")
  }

  return (
    <PublicFrame brand={store.name}>
      {step === "lookup" && (
        <Step stepKey="lookup">
          <Title sub={store.intro}>Retourneren of een probleem melden</Title>
          <form
            noValidate
            className="flex flex-col gap-3.5"
            onSubmit={(event) => {
              event.preventDefault()
              void lookup()
            }}
          >
            <Field label="Bestelnummer" error={fieldErrors.number}>
              {(c) => (
                <Input
                  {...c}
                  value={number}
                  onChange={(e) => setNumber(e.target.value)}
                  placeholder="#6288"
                  autoComplete="off"
                  inputMode="numeric"
                  className="figure min-h-10 pointer-coarse:min-h-11"
                />
              )}
            </Field>
            <Field label="E-mailadres van de bestelling" error={fieldErrors.email}>
              {(c) => (
                <Input
                  {...c}
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="naam@voorbeeld.nl"
                  autoComplete="email"
                  className="min-h-10 pointer-coarse:min-h-11"
                />
              )}
            </Field>
            {problem !== null && <Problem>{problem}</Problem>}
            <Button type="submit" variant="primary" loading={busy} className={WIDE}>Bestelling zoeken</Button>
          </form>
          <DemoOrders
            onPick={(n, e) => {
              setNumber(`#${n}`)
              setEmail(e)
              setFieldErrors({})
              setProblem(null)
            }}
          />
        </Step>
      )}

      {step === "kind" && order !== null && (
        <Step stepKey="kind">
          <BackButton onClick={() => go("lookup")} />
          <Title
            sub={
              <span className="figure">
                {order.firstName}, {order.delivered === null
                  ? (order.promisedAt === null
                    ? "nog onderweg"
                    : `nog onderweg, ${order.carrier} beloofde hem op ${dayMonth(order.promisedAt)}`)
                  : `bezorgd op ${dayMonth(order.delivered)}`} · {order.lines.length}{" "}
                {order.lines.length === 1 ? "artikel" : "artikelen"}
              </span>
            }
          >
            Bestelling {order.number}
          </Title>
          {order.open !== null && <OpenRequestView request={order.open} order={order} />}
          {order.open?.label === undefined && (
            <div className="flex flex-col gap-2">
              <ChoiceButton
                title="Iets terugsturen"
                body={order.delivered === null
                  ? "Kan zodra het pakket binnen is."
                  : `Te klein, te groot of anders dan verwacht. Binnen ${store.returnDays} dagen na bezorging.`}
                disabled={order.delivered === null}
                onClick={() => {
                  setKind("return")
                  setPicked([])
                  setReason(null)
                  setResolution(null)
                  go("items")
                }}
              />
              <ChoiceButton
                title="Een probleem melden"
                body={order.delivered === null
                  ? "Je pakket is te laat of niet aangekomen. We zoeken het uit met de vervoerder."
                  : "Beschadigd, verkeerd of niet goed. Met een foto erbij handelen we het snel af."}
                onClick={() => {
                  setKind("claim")
                  setPicked(order.delivered === null ? order.lines.map((l) => l.id) : [])
                  setReason(null)
                  setResolution(null)
                  go(order.delivered === null ? "reason" : "items")
                }}
              />
            </div>
          )}
        </Step>
      )}

      {step === "items" && order !== null && (
        <Step stepKey="items">
          <BackButton onClick={() => go("kind")} />
          <Title>{kind === "claim" ? "Met welk artikel is iets mis?" : "Wat wil je terugsturen?"}</Title>
          {claimStep(1)}
          <ul className="flex flex-col gap-2">
            {lines.map((l) => (
              <li key={l.id}>
                <LineChoice
                  line={l}
                  refusal={kind === "claim" ? l.noClaim : l.noReturn}
                  on={picked.includes(l.id)}
                  onToggle={() =>
                    setPicked((now) => now.includes(l.id) ? now.filter((x) => x !== l.id) : [...now, l.id])}
                />
              </li>
            ))}
          </ul>
          {lines.every((l) => (kind === "claim" ? l.noClaim : l.noReturn) !== null) && (
            <p className="text-sm text-ink-2">
              Niets uit deze bestelling kan nu {kind === "claim" ? "gemeld worden" : "terug"}. Vragen? Mail{" "}
              <a href={`mailto:${store.email}`} className="font-medium text-accent-ink hover:text-ink">
                {store.email}
              </a>.
            </p>
          )}
          <Button variant="primary" disabled={picked.length === 0} onClick={() => go("reason")} className={WIDE}>
            Verder
          </Button>
        </Step>
      )}

      {step === "reason" && (
        <Step stepKey="reason">
          <BackButton onClick={() => go(notArrived ? "kind" : "items")} />
          <Title>{kind === "claim" ? "Wat is er mis?" : "Waarom stuur je het terug?"}</Title>
          {claimStep(1)}
          <div className="flex flex-col gap-2" role="radiogroup" aria-label="Reden">
            {reasons.map((r) => (
              <ChoiceButton
                key={r.id}
                role="radio"
                title={r.label}
                on={reason?.id === r.id}
                onClick={() => setReason(r)}
                meta={r.photo ? <span className="shrink-0 text-xs text-ink-3">foto nodig</span> : undefined}
              />
            ))}
          </div>
          <Field label="Vertel er iets meer over" optional>
            {(c) => (
              <Textarea
                {...c}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                placeholder={kind === "claim"
                  ? (notArrived
                    ? "Bijvoorbeeld: track en trace staat al dagen stil"
                    : "Bijvoorbeeld: de naad bij de schouder is gescheurd")
                  : "Bijvoorbeeld: valt kleiner dan de maattabel"}
              />
            )}
          </Field>
          <Button variant="primary" disabled={reason === null} onClick={() => go(next.afterReason())} className={WIDE}>
            Verder
          </Button>
        </Step>
      )}

      {step === "photos" && (
        <Step stepKey="photos">
          <BackButton onClick={() => go("reason")} />
          <Title sub="Een foto van het probleem en een van de verpakking helpen ons het snelst. Minstens één is nodig.">
            Foto's van het artikel
          </Title>
          {claimStep(2)}
          <FileDrop
            accept="image/*"
            label="Foto's kiezen"
            hint="Of maak er een met je camera. JPG, PNG of HEIC, tot 10 MB."
            onFiles={addPhotos}
            invalid={photoError}
          />
          {photos.length > 0 && (
            <ul className="flex flex-wrap gap-2.5" aria-label="Gekozen foto's">
              {photos.map((p) => (
                <li key={p.url} className="relative">
                  <img src={p.url} alt={p.name} className="size-20 rounded-md object-cover" />
                  <button
                    type="button"
                    aria-label={`${p.name} weghalen`}
                    onClick={() => setPhotos((now) => now.filter((x) => x.url !== p.url))}
                    className="absolute -top-2 -right-2 inline-flex size-7 items-center justify-center rounded-full bg-panel text-ink-2 shadow-sm hover:text-ink pointer-coarse:size-9"
                  >
                    <X size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <Button variant="primary" disabled={photos.length === 0} onClick={() => go("resolution")} className={WIDE}>
            Verder
          </Button>
        </Step>
      )}

      {step === "resolution" && (
        <Step stepKey="resolution">
          <BackButton onClick={() => go(reason?.photo === true ? "photos" : "reason")} />
          <Title>Wat wil je dat we doen?</Title>
          {claimStep(3)}
          <div className="flex flex-col gap-2" role="radiogroup" aria-label="Oplossing">
            {options.map((r) => (
              <ChoiceButton
                key={r}
                role="radio"
                on={resolution === r}
                onClick={() => setResolution(r)}
                title={r === "gift_card" && store.giftCardBonus > 0
                  ? `${RESOLUTION_LABEL[r]} met ${store.giftCardBonus}% extra`
                  : RESOLUTION_LABEL[r]}
                body={`Je krijgt ${RESOLUTION_DETAIL[r]}.`}
                meta={r === "refund"
                  ? <span className="figure shrink-0 text-sm text-ink-2">{euro(amount)}</span>
                  : r === "gift_card"
                  ? (
                    <span className="figure shrink-0 text-sm text-ink-2">
                      {euro(Math.round(amount * (100 + store.giftCardBonus)) / 100)}
                    </span>
                  )
                  : undefined}
              />
            ))}
          </div>
          {resolution === "exchange" && chosen[0] !== undefined && (
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium text-ink">Welke maat wil je?</span>
              <div className="flex gap-2" role="radiogroup" aria-label="Maat">
                {chosen[0].exchange.map((s) => (
                  <button
                    key={s}
                    type="button"
                    role="radio"
                    aria-checked={exchangeTo === s}
                    onClick={() => setExchangeTo(s)}
                    className={cx(
                      "h-11 flex-1 rounded-sm text-sm font-medium transition-colors",
                      exchangeTo === s ? "bg-ink text-on-ink" : "bg-well text-ink hover:bg-hover"
                    )}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          <Button
            variant="primary"
            disabled={resolution === null || (resolution === "exchange" && exchangeTo === null)}
            onClick={() => go(next.afterResolution())}
            className={WIDE}
          >
            Verder
          </Button>
        </Step>
      )}

      {step === "method" && order !== null && (
        <Step stepKey="method">
          <BackButton onClick={() => go("resolution")} />
          <Title sub={`Je stuurt het terug met ${address.carrier}. Het label is gratis.`}>
            Hoe lever je het pakket in?
          </Title>
          <div className="flex flex-col gap-2" role="radiogroup" aria-label="Inleveren">
            <ChoiceButton
              role="radio"
              on={method === "qr"}
              onClick={() => setMethod("qr")}
              title="Met een QR-code, zonder printer"
              body={`Laat de code scannen bij een ${address.carrier}-punt. Zij plakken het label.`}
            />
            <ChoiceButton
              role="radio"
              on={method === "print"}
              onClick={() => setMethod("print")}
              title="Label zelf printen"
              body="Plak het op de doos en lever hem in bij een afgiftepunt, of laat hem ophalen."
            />
          </div>
          <Button variant="primary" onClick={() => go("summary")} className={WIDE}>Verder</Button>
        </Step>
      )}

      {step === "summary" && order !== null && reason !== null && resolution !== null && (
        <Step stepKey="summary">
          <BackButton onClick={() => go(kind === "return" ? "method" : "resolution")} />
          <Title>Klopt dit?</Title>
          <dl className="flex flex-col gap-3">
            <Row term="Bestelling">
              <span className="figure">{order.number}</span>
            </Row>
            <Row term={kind === "claim" ? "Probleem met" : "Terug"}>
              <ul className="flex flex-col gap-1">
                {chosen.map((l) => <li key={l.id}>{l.title} · {l.size}</li>)}
              </ul>
            </Row>
            <Row term="Reden">{reason.label}{note.trim() === "" ? "" : `: “${note.trim()}”`}</Row>
            {photos.length > 0 && (
              <Row term="Foto's">
                <span className="figure">{photos.length}</span>
              </Row>
            )}
            <Row term="Je wilt">
              {RESOLUTION_LABEL[resolution]}
              {resolution === "exchange" && exchangeTo !== null ? ` naar ${exchangeTo}` : ""}
              {resolution === "refund" ? <span className="figure">{` · ${euro(amount)}`}</span> : ""}
            </Row>
            {kind === "return" && (
              <Row term="Inleveren">
                {method === "qr" ? `QR-code bij een ${address.carrier}-punt` : `Zelf printen, ${address.carrier}`}
              </Row>
            )}
          </dl>
          <Button variant="primary" loading={busy} onClick={() => void submit()} className={WIDE}>
            {kind === "claim" ? "Probleem melden" : "Retour aanvragen"}
          </Button>
        </Step>
      )}

      {step === "done" && made !== null && (
        <Step stepKey="done">
          <span className="inline-flex size-11 items-center justify-center rounded-full bg-good-tint text-good-ink">
            <Check size={20} strokeWidth={2.25} />
          </span>
          <Title
            sub={
              <>
                Je nummer is{" "}
                <span className="figure font-medium text-ink">{made}</span>. We hebben een bevestiging gestuurd naar
                {" "}
                {email.trim()}.
              </>
            }
          >
            {kind === "claim" ? "Probleem gemeld" : "Retour aangevraagd"}
          </Title>
          <ol className="flex flex-col gap-3">
            {[
              "We bekijken je aanvraag binnen twee werkdagen.",
              kind === "claim" && resolution === "replacement"
                ? "Is het goedgekeurd, dan sturen we het nieuwe artikel; terugsturen is misschien niet nodig."
                : method === "qr" || kind === "claim"
                ? `Is het goedgekeurd, dan krijg je een QR-code per mail. Laat hem scannen bij een ${address.carrier}-punt.`
                : `Is het goedgekeurd, dan krijg je het label van ${address.carrier} per mail. Print het en plak het op de doos.`,
              resolution === "refund"
                ? "Zodra het pakket binnen is, betalen we je terug op dezelfde betaalmethode."
                : resolution === "exchange"
                ? `Zodra het pakket binnen is, sturen we maat ${exchangeTo ?? "die je koos"}.`
                : "Zodra het rond is, krijg je bericht."
            ].map((t, i) => (
              <li key={t} className="flex gap-3 text-sm text-pretty text-ink-2">
                <span className="figure inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-well text-xs font-medium text-ink">
                  {i + 1}
                </span>
                <span className="pt-0.5">{t}</span>
              </li>
            ))}
          </ol>
          <p className="text-sm text-ink-3">{store.done}</p>
          <Button variant="ghost" icon={<RotateCcw size={16} />} onClick={restart} className={WIDE}>
            Nog iets terugsturen
          </Button>
        </Step>
      )}
    </PublicFrame>
  )
}

const WIDE = "min-h-11 w-full"

function Problem({ children }: { readonly children: string }) {
  return <p role="alert" className="rounded-sm bg-bad-tint px-3 py-2.5 text-sm text-pretty text-ink">{children}</p>
}

function LineChoice({ line, refusal, on, onToggle }: {
  readonly line: PortalLine
  readonly refusal: string | null
  readonly on: boolean
  readonly onToggle: () => void
}) {
  const off = refusal !== null
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={on}
      disabled={off}
      onClick={onToggle}
      className={cx(
        "flex w-full items-start gap-3 rounded-md px-3 py-3 text-left transition-colors",
        on ? "bg-accent-tint" : "bg-well",
        off ? "cursor-not-allowed" : on ? "" : "hover:bg-hover"
      )}
    >
      <span
        className={cx(
          "inline-flex size-14 shrink-0 items-center justify-center rounded-sm bg-canvas text-ink-4",
          off && "opacity-60"
        )}
        aria-hidden="true"
      >
        <Image size={20} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className={cx("text-sm font-medium", off ? "text-ink-3" : "text-ink")}>{line.title}</span>
        <span className="figure text-sm text-ink-3">{line.size} · {euro(line.price)}</span>
        {off && <span className="text-sm text-pretty text-ink-2">{refusal}</span>}
      </span>
      {!off && (
        <span
          aria-hidden="true"
          className={cx(
            "mt-1 inline-flex size-5 shrink-0 items-center justify-center rounded-xs",
            on ? "bg-accent text-on-accent" : "bg-canvas ring-1 ring-line-strong ring-inset"
          )}
        >
          {on && <Check size={13} strokeWidth={2.5} />}
        </span>
      )}
    </button>
  )
}

/** A request already open on this order: where it stands, and for an approved one the label itself. */
function OpenRequestView({ request, order }: { readonly request: OpenRequest; readonly order: PortalOrder }) {
  const label = request.label
  const address = returnAddress(order.country)
  if (label === undefined) {
    return (
      <div className="flex flex-col gap-1 rounded-md bg-accent-tint px-4 py-3">
        <p className="text-sm font-medium text-ink">
          Je hebt al een aanvraag: <span className="figure">{request.number}</span>
        </p>
        <p className="text-sm text-pretty text-ink-2">
          Status: {STATUS_LABEL[request.status].toLowerCase()}. {request.status === "review"
            ? "We kijken er binnen twee werkdagen naar."
            : "Je krijgt bericht zodra er iets verandert."}
        </p>
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1 rounded-md bg-good-tint px-4 py-3">
        <p className="text-sm font-medium text-ink">
          <span className="figure">{request.number}</span> is goedgekeurd
        </p>
        <p className="text-sm text-pretty text-ink-2">
          Status: {STATUS_LABEL[request.status].toLowerCase()}. Lever het pakket in vóór {dayMonth(label.dropBy)}.
        </p>
      </div>
      <section aria-labelledby="label-title" className="flex flex-col items-center gap-4 text-center">
        <h2 id="label-title" className="text-md font-semibold text-ink">Laat deze code scannen</h2>
        <QrCode
          text={label.code}
          size={184}
          className="text-ink"
          label={`QR-code voor het retourlabel ${label.code}`}
        />
        <p className="figure text-sm font-medium text-ink">{label.code}</p>
        <p className="max-w-[36ch] text-sm text-pretty text-ink-2">
          Bij elk {label.carrier}-punt. Zij printen en plakken het label; je hoeft alleen de doos dicht te maken.
        </p>
      </section>
      <dl className="flex flex-col gap-3">
        <Row term="Vervoerder">{label.carrier}</Row>
        <Row term="Retouradres">
          <span className="flex flex-col">
            {address.lines.map((l) => <span key={l}>{l}</span>)}
          </span>
        </Row>
      </dl>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button icon={<Printer size={16} />} onClick={() => window.print()} className="min-h-11 flex-1">
          Label printen
        </Button>
        <a
          href={`https://www.google.com/maps/search/${encodeURIComponent(`${label.carrier} servicepunt`)}`}
          target="_blank"
          rel="noreferrer"
          className={buttonClass("secondary", "md", "min-h-11 flex-1")}
        >
          <MapPin size={16} />
          Afgiftepunt zoeken
        </a>
      </div>
    </div>
  )
}

/** The demo's orders, to try each case; a reference aid, quiet at the foot. */
function DemoOrders({ onPick }: { readonly onPick: (number: string, email: string) => void }) {
  return (
    <div className="mt-6 flex flex-col gap-2">
      <p className="text-xs text-ink-3">Bestellingen in de demo</p>
      <ul className="flex flex-col">
        {PORTAL_DEMO.map((d) => (
          <li key={d.number}>
            <button
              type="button"
              onClick={() => onPick(d.number, d.email)}
              className="flex min-h-10 w-full flex-wrap items-baseline gap-x-2 rounded-sm px-2 py-1.5 text-left text-xs hover:bg-hover pointer-coarse:min-h-11"
            >
              <span className="figure font-medium text-ink">#{d.number}</span>
              <span className="text-ink-2">{d.email}</span>
              <span className="text-ink-3">{d.shows}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
