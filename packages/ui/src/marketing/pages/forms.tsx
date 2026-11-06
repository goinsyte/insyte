import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { type FormEvent, type ReactNode, useId, useMemo, useRef, useState } from "react"
import { AlertTriangle, ArrowRight, Check, Loader } from "../../icons.tsx"
import { cn } from "../../lib/utils.ts"
import { Frame } from "../frame.tsx"
import type { MarketingLinks } from "../links.tsx"
import { useMarketingLinks } from "../links.tsx"
import { Logo } from "../parts.tsx"
import { MarketingPage, PageHero } from "./shell.tsx"

/*
 * /toegang and /partners/aanmelden: two forms with client-side validation and a success state, and
 * no backend. Submitting checks every field, waits a moment as a request would, logs the answers to
 * the console and shows what happens next; the page says plainly that nothing was sent.
 *
 * Their moment: beside the form a ruled index of its parts fills, part by part, as the fields in it
 * become valid, and on success the form folds into the confirmation, its check drawn in.
 */

type Rule = (v: string) => string | null

const required = (label: string): Rule => (v) => (v.trim() === "" ? `Vul ${label} in.` : null)
const email: Rule = (v) =>
  v.trim() === ""
    ? "Vul je e-mailadres in."
    : /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim())
    ? null
    : "Dit lijkt geen e-mailadres. Controleer de @ en het domein."
const work: Rule = (v) => {
  const base = email(v)
  if (base !== null) return base
  const domain = v.trim().split("@")[1]?.toLowerCase() ?? ""
  return ["gmail.com", "hotmail.com", "outlook.com", "live.nl", "hotmail.nl", "yahoo.com", "icloud.com"].includes(
      domain
    )
    ? "Gebruik je werkmail, of vraag aan met Google hierboven."
    : null
}
const store: Rule = (v) => {
  const t = v.trim()
  if (t === "") return null
  return /^(https?:\/\/)?([a-z0-9-]+\.)+[a-z]{2,}(\/.*)?$/i.test(t)
    ? null
    : "Vul een webadres in, zoals jouwwinkel.myshopify.com."
}

function useForm<K extends string>(rules: Record<K, Rule>, initial: Record<K, string>) {
  const [values, setValues] = useState(initial)
  const [touched, setTouched] = useState<Partial<Record<K, boolean>>>({})
  const errors = useMemo(() => {
    const out: Partial<Record<K, string>> = {}
    for (const k of Object.keys(rules) as Array<K>) {
      const e = rules[k](values[k])
      if (e !== null) out[k] = e
    }
    return out
  }, [rules, values])
  const field = (k: K) => ({
    value: values[k],
    error: touched[k] === true ? errors[k] : undefined,
    valid: errors[k] === undefined && values[k].trim() !== "",
    onChange: (v: string) => setValues((s) => ({ ...s, [k]: v })),
    onBlur: () => setTouched((s) => ({ ...s, [k]: true }))
  })
  const touchAll = () => setTouched(Object.fromEntries(Object.keys(rules).map((k) => [k, true])) as Record<K, boolean>)
  return { values, setValues, errors, field, touchAll }
}

type FieldProps = {
  readonly label: string
  readonly hint?: string
  readonly value: string
  readonly error: string | undefined
  readonly valid: boolean
  readonly onChange: (v: string) => void
  readonly onBlur: () => void
  readonly type?: string
  readonly placeholder?: string
  readonly autoComplete?: string
  readonly multiline?: boolean
  readonly optional?: boolean
}

function Field(p: FieldProps) {
  const id = useId()
  const describe = p.error !== undefined ? `${id}-fout` : p.hint !== undefined ? `${id}-hint` : undefined
  const common = {
    id,
    value: p.value,
    onChange: (e: { target: { value: string } }) => p.onChange(e.target.value),
    onBlur: p.onBlur,
    placeholder: p.placeholder,
    "aria-invalid": p.error !== undefined,
    "aria-describedby": describe,
    className: cn(
      "w-full rounded-md bg-ink/[0.045] px-3.5 text-base text-ink outline-none transition-[background-color,box-shadow] duration-200 placeholder:text-ink-3 focus:bg-paper",
      p.error !== undefined
        ? "shadow-[inset_0_0_0_1.5px_color-mix(in_oklch,var(--ink)_55%,transparent)]"
        : "shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--ink)_7%,transparent)] focus:shadow-[inset_0_0_0_1px_var(--arc),0_0_0_4px_var(--arc-soft)]",
      p.multiline === true ? "min-h-[104px] py-3" : "h-11"
    )
  }
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="flex items-center justify-between gap-3 font-medium text-ink text-sm">
        <span>
          {p.label}
          {p.optional === true ? <span className="font-normal text-ink-3">{" (optioneel)"}</span> : null}
        </span>
        <AnimatePresence initial={false}>
          {p.valid && p.error === undefined
            ? (
              <motion.span
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.6 }}
                className="text-arc-ink"
                aria-hidden
              >
                <Check size={14} />
              </motion.span>
            )
            : null}
        </AnimatePresence>
      </label>
      {p.multiline === true
        ? <textarea {...common} rows={4} />
        : <input {...common} type={p.type ?? "text"} autoComplete={p.autoComplete} />}
      <AnimatePresence initial={false} mode="popLayout">
        {p.error !== undefined
          ? (
            <motion.p
              key="fout"
              id={`${id}-fout`}
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-1.5 font-medium text-ink text-sm"
            >
              <AlertTriangle size={13} />
              {p.error}
            </motion.p>
          )
          : p.hint !== undefined
          ? <p key="hint" id={`${id}-hint`} className="text-ink-3 text-sm">{p.hint}</p>
          : null}
      </AnimatePresence>
    </div>
  )
}

function Choice<T extends string>(
  { label, options, value, onChange, multiple = false }: {
    readonly label: string
    readonly options: ReadonlyArray<T>
    readonly value: ReadonlyArray<T>
    readonly onChange: (v: ReadonlyArray<T>) => void
    readonly multiple?: boolean
  }
) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1.5 font-medium text-ink text-sm">{label}</legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const on = value.includes(o)
          return (
            <button
              key={o}
              type="button"
              role={multiple ? "checkbox" : "radio"}
              aria-checked={on}
              onClick={() => onChange(multiple ? (on ? value.filter((x) => x !== o) : [...value, o]) : [o])}
              className={cn(
                "inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-sm transition-colors",
                on ? "bg-abyss text-mesh-ink" : "bg-ink/5 text-ink-2 hover:bg-ink/8 hover:text-ink"
              )}
            >
              {on && multiple ? <Check size={13} /> : null}
              {o}
            </button>
          )
        })}
      </div>
    </fieldset>
  )
}

/** The form's parts, their segment filling as the fields in them become valid. */
function Parts(
  { parts }: { readonly parts: ReadonlyArray<{ readonly title: string; readonly line: string; readonly done: number }> }
) {
  const reduced = useReducedMotion() === true
  return (
    <ol className="flex flex-col">
      {parts.map((p, i) => (
        <li key={p.title} className="relative grid grid-cols-[28px_minmax(0,1fr)] gap-4 pb-8 last:pb-0">
          <span className="relative flex flex-col items-center">
            <span
              className={cn(
                "z-10 flex size-7 items-center justify-center rounded-md text-xs tabular-nums transition-colors duration-300",
                p.done >= 1 ? "bg-abyss text-mesh-ink" : "bg-ink/6 text-ink-2"
              )}
            >
              {p.done >= 1 ? <Check size={13} /> : i + 1}
            </span>
            {i < parts.length - 1
              ? (
                <span className="relative mt-1 w-px flex-1 bg-ink/10">
                  <motion.span
                    className="absolute inset-0 origin-top bg-abyss"
                    initial={false}
                    animate={{ scaleY: p.done }}
                    transition={reduced ? { duration: 0 } : { duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                  />
                </span>
              )
              : null}
          </span>
          <span className="flex flex-col gap-1 pt-0.5">
            <span className="font-medium text-ink text-base">{p.title}</span>
            <span className="text-ink-3 text-sm">{p.line}</span>
          </span>
        </li>
      ))}
    </ol>
  )
}

function Success(
  { title, children, onReset }: { readonly title: string; readonly children: ReactNode; readonly onReset: () => void }
) {
  const ref = useRef<HTMLDivElement | null>(null)
  return (
    <motion.div
      ref={ref}
      key="klaar"
      tabIndex={-1}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      onAnimationComplete={() => ref.current?.focus()}
      role="status"
      className="flex flex-col items-start gap-5 p-6 outline-none sm:p-10"
    >
      <svg width="56" height="56" viewBox="0 0 56 56" aria-hidden>
        <rect x="1" y="1" width="54" height="54" rx="12" fill="var(--abyss)" />
        <motion.path
          d="M17 29 L25 37 L40 20"
          fill="none"
          stroke="var(--mesh-ink)"
          strokeWidth="3"
          strokeLinecap="square"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.6, delay: 0.25, ease: [0.16, 1, 0.3, 1] }}
        />
      </svg>
      <h2 className="font-medium text-3xl text-ink">{title}</h2>
      <div className="flex max-w-[52ch] flex-col gap-3 text-ink-2 text-md">{children}</div>
      <button type="button" onClick={onReset} className="font-medium text-arc-ink text-base hover:text-abyss">
        Opnieuw invullen
      </button>
    </motion.div>
  )
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

/* ── /toegang ─────────────────────────────────────────────────────────────────────────────────── */

const STORES = ["1 winkel", "2 tot 5", "6 of meer"] as const
const ORDERS = ["Tot 2.000", "2.000 tot 20.000", "Meer dan 20.000"] as const
const FIRST = ["Bestellingen", "Klantenservice", "Chargebacks", "Leveranciers", "Automatiseringen", "Partners"] as const

const ACCESS_RULES = {
  name: required("je naam"),
  email: work,
  company: required("de naam van je bedrijf of winkel"),
  url: store,
  note: () => null
}

function AccessForm() {
  const links = useMarketingLinks()
  const f = useForm(ACCESS_RULES, { name: "", email: "", company: "", url: "", note: "" })
  const [stores, setStores] = useState<ReadonlyArray<(typeof STORES)[number]>>([])
  const [orders, setOrders] = useState<ReadonlyArray<(typeof ORDERS)[number]>>([])
  const [first, setFirst] = useState<ReadonlyArray<(typeof FIRST)[number]>>([])
  const [consent, setConsent] = useState(false)
  const [tried, setTried] = useState(false)
  const [state, setState] = useState<"open" | "busy" | "done">("open")

  const ok = (k: keyof typeof ACCESS_RULES) => f.errors[k] === undefined && f.values[k].trim() !== ""
  const parts = [
    { title: "Over jou", line: "Je naam en je werkmail.", done: (Number(ok("name")) + Number(ok("email"))) / 2 },
    {
      title: "Je winkels",
      line: "Bedrijf, aantal winkels en bestellingen.",
      done: (Number(ok("company")) + Number(stores.length > 0) + Number(orders.length > 0)) / 3
    },
    { title: "Wat eerst", line: "Waar Insyte je het eerst mee moet helpen.", done: first.length > 0 ? 1 : 0 },
    { title: "Versturen", line: "Akkoord met de privacyverklaring.", done: consent ? 1 : 0 }
  ]
  const choiceErrors = {
    stores: stores.length === 0 ? "Kies hoeveel winkels je draait." : undefined,
    orders: orders.length === 0 ? "Kies hoeveel bestellingen je per maand hebt." : undefined,
    consent: consent ? undefined : "Ga akkoord met de privacyverklaring om verder te gaan."
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    f.touchAll()
    setTried(true)
    const bad = Object.keys(f.errors).length > 0 || Object.values(choiceErrors).some((x) => x !== undefined)
    if (bad) {
      requestAnimationFrame(() => document.querySelector<HTMLElement>("[aria-invalid=true]")?.focus())
      return
    }
    setState("busy")
    await wait(900)
    // No backend: the request is shown here and goes nowhere.
    // oxlint-disable-next-line no-console -- the brief: log the request, send it nowhere
    console.info("[insyte] toegangsaanvraag (niet verstuurd)", { ...f.values, stores, orders, first })
    setState("done")
  }

  const reset = () => {
    f.setValues({ name: "", email: "", company: "", url: "", note: "" })
    setStores([])
    setOrders([])
    setFirst([])
    setConsent(false)
    setTried(false)
    setState("open")
  }

  return (
    <FormLayout parts={parts}>
      <AnimatePresence mode="wait" initial={false}>
        {state === "done"
          ? (
            <Success title="Je aanvraag staat klaar." onReset={reset}>
              <p>
                Bedankt,{" "}
                {f.values.name.split(" ")[0]}. In deze versie van de site wordt een aanvraag nog niet verstuurd: er is
                niets bij Insyte binnengekomen.
              </p>
              <p>
                Wil je echt toegang, vraag dan aan met Google; dat opent de aanvraag in de console, waar Insyte hem
                ontvangt.
              </p>
              <a
                href={links.onboarding}
                className="inline-flex w-fit items-center gap-2 font-medium text-arc-ink hover:text-abyss"
              >
                Toegang aanvragen met Google
                <ArrowRight size={15} />
              </a>
            </Success>
          )
          : (
            <motion.form
              key="formulier"
              noValidate
              onSubmit={(e) => void submit(e)}
              exit={{ opacity: 0, y: -8, transition: { duration: 0.2 } }}
              className="flex flex-col gap-8 p-6 sm:p-10"
            >
              <a
                href={links.onboarding}
                className="flex h-12 items-center justify-center gap-3 rounded-md bg-abyss font-medium text-md text-mesh-ink transition-colors hover:bg-abyss-2"
              >
                <span className="flex size-6 items-center justify-center rounded-sm bg-paper">
                  <Logo vendor="google" size={18} />
                </span>
                Toegang aanvragen met Google
              </a>
              <div className="flex items-center gap-3 text-ink-3 text-sm">
                <span className="h-px flex-1 dash-x" />
                of met je werkmail
                <span className="h-px flex-1 dash-x" />
              </div>
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="Naam" autoComplete="name" {...f.field("name")} />
                <Field
                  label="Werkmail"
                  type="email"
                  autoComplete="email"
                  placeholder="jij@jouwbedrijf.nl"
                  {...f.field("email")}
                />
              </div>
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="Bedrijf of winkel" autoComplete="organization" {...f.field("company")} />
                <Field
                  label="Je Shopify-winkel"
                  optional
                  placeholder="jouwwinkel.myshopify.com"
                  hint="Het adres van één van je winkels."
                  {...f.field("url")}
                />
              </div>
              <div className="grid gap-6 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Choice label="Hoeveel winkels draai je?" options={STORES} value={stores} onChange={setStores} />
                  {tried && choiceErrors.stores !== undefined
                    ? <p className="font-medium text-ink text-sm">{choiceErrors.stores}</p>
                    : null}
                </div>
                <div className="flex flex-col gap-1.5">
                  <Choice label="Bestellingen per maand" options={ORDERS} value={orders} onChange={setOrders} />
                  {tried && choiceErrors.orders !== undefined
                    ? <p className="font-medium text-ink text-sm">{choiceErrors.orders}</p>
                    : null}
                </div>
              </div>
              <Choice
                label="Waar moet Insyte je het eerst mee helpen?"
                options={FIRST}
                value={first}
                onChange={setFirst}
                multiple
              />
              <Field label="Nog iets dat we moeten weten" optional multiline {...f.field("note")} />
              <div className="flex flex-col gap-1.5">
                <label className="flex items-start gap-3 text-ink-2 text-sm">
                  <input
                    type="checkbox"
                    checked={consent}
                    onChange={(e) => setConsent(e.target.checked)}
                    aria-invalid={tried && !consent}
                    className="mt-0.5 size-4 accent-abyss"
                  />
                  <span>
                    Ik ga akkoord met de{" "}
                    <a
                      href={links.page("/privacy")}
                      className="text-arc-ink underline decoration-arc-ink/35 underline-offset-4"
                    >
                      privacyverklaring
                    </a>
                    . Insyte gebruikt je gegevens alleen om je aanvraag op te volgen.
                  </span>
                </label>
                {tried && choiceErrors.consent !== undefined
                  ? <p className="font-medium text-ink text-sm">{choiceErrors.consent}</p>
                  : null}
              </div>
              <div className="flex flex-col gap-3 border-hairline border-t pt-6 sm:flex-row sm:items-center sm:justify-between">
                <p className="max-w-[40ch] text-ink-3 text-sm">
                  Voorbeeldformulier: in deze versie van de site wordt je aanvraag niet verstuurd.
                </p>
                <button
                  type="submit"
                  disabled={state === "busy"}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-abyss px-5 font-medium text-md text-mesh-ink transition-colors hover:bg-abyss-2 disabled:opacity-70"
                >
                  {state === "busy" ? <Loader size={16} className="animate-spin" /> : null}
                  {state === "busy" ? "Even geduld" : "Aanvraag versturen"}
                </button>
              </div>
            </motion.form>
          )}
      </AnimatePresence>
    </FormLayout>
  )
}

function FormLayout(
  { parts, children }: { readonly parts: Parameters<typeof Parts>[0]["parts"]; readonly children: ReactNode }
) {
  return (
    <section aria-label="Formulier" className="relative z-10 bg-paper">
      <Frame top={false} inner="pb-24 sm:pb-32">
        <div className="-mt-32 grid grid-cols-[minmax(0,1fr)] gap-10 sm:-mt-40 lg:grid-cols-[280px_minmax(0,1fr)] lg:gap-16">
          <aside className="lg:sticky lg:top-28 lg:self-start lg:pt-48">
            <Parts parts={parts} />
          </aside>
          <div className="overflow-hidden rounded-xl bg-paper window-lift">{children}</div>
        </div>
      </Frame>
    </section>
  )
}

export function ToegangPage({ links }: { readonly links: MarketingLinks }) {
  return (
    <MarketingPage links={links}>
      <PageHero
        variant="form"
        ground="glacier"
        title="Toegang aanvragen."
        second="Insyte is in private bèta."
        lede="Insyte werkt op uitnodiging. Vertel kort over je winkels; je krijgt bericht zodra er plek is. Een creditcard is niet nodig."
        fields={[
          { label: "Status", value: "Private bèta" },
          { label: "Toegang", value: "Op uitnodiging" },
          { label: "Creditcard", value: "Niet nodig" }
        ]}
      />
      <AccessForm />
    </MarketingPage>
  )
}

/* ── /partners/aanmelden ──────────────────────────────────────────────────────────────────────── */

const REACH = ["Tot 5.000", "5.000 tot 50.000", "Meer dan 50.000"] as const
const CHANNELS = ["Instagram", "TikTok", "YouTube", "Nieuwsbrief", "Blog of website"] as const

const PARTNER_RULES = {
  name: required("je naam"),
  email,
  handle: required("je kanaal of account"),
  why: (
    v: string
  ) => (v.trim().length < 20 ? "Schrijf er minstens een zin over, zodat de winkel je kan beoordelen." : null),
  how: () => null
}

function PartnerForm() {
  const f = useForm(PARTNER_RULES, { name: "", email: "", handle: "", why: "", how: "" })
  const [reach, setReach] = useState<ReadonlyArray<(typeof REACH)[number]>>([])
  const [channels, setChannels] = useState<ReadonlyArray<(typeof CHANNELS)[number]>>([])
  const [tried, setTried] = useState(false)
  const [state, setState] = useState<"open" | "busy" | "done">("open")
  const ok = (k: keyof typeof PARTNER_RULES) => f.errors[k] === undefined && f.values[k].trim() !== ""
  const parts = [
    { title: "Over jou", line: "Je naam en e-mailadres.", done: (Number(ok("name")) + Number(ok("email"))) / 2 },
    {
      title: "Je kanalen",
      line: "Waar je publiek je volgt.",
      done: (Number(ok("handle")) + Number(reach.length > 0)) / 2
    },
    { title: "Waarom deze winkel", line: "Wat je publiek eraan heeft.", done: ok("why") ? 1 : 0 },
    { title: "Goedkeuring", line: "De winkel keurt je aanmelding goed of af.", done: state === "done" ? 1 : 0 }
  ]
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    f.touchAll()
    setTried(true)
    if (Object.keys(f.errors).length > 0 || reach.length === 0) {
      requestAnimationFrame(() => document.querySelector<HTMLElement>("[aria-invalid=true]")?.focus())
      return
    }
    setState("busy")
    await wait(900)
    // No backend: the application is shown here and goes nowhere.
    // oxlint-disable-next-line no-console -- the brief: log the application, send it nowhere
    console.info("[insyte] partneraanmelding (niet verstuurd)", { ...f.values, reach, channels })
    setState("done")
  }
  return (
    <FormLayout parts={parts}>
      <AnimatePresence mode="wait" initial={false}>
        {state === "done"
          ? (
            <Success
              title="Je aanmelding staat klaar."
              onReset={() => {
                f.setValues({ name: "", email: "", handle: "", why: "", how: "" })
                setReach([])
                setChannels([])
                setTried(false)
                setState("open")
              }}
            >
              <p>
                In het echte programma komt je aanmelding bij Northwind binnen als In afwachting; de winkel keurt hem
                goed of af, en na goedkeuring open je het partnerportaal met je eigen links.
              </p>
              <p>Dit is een voorbeeld op de demowinkel: er is niets verstuurd.</p>
            </Success>
          )
          : (
            <motion.form
              key="formulier"
              noValidate
              onSubmit={(e) => void submit(e)}
              exit={{ opacity: 0, y: -8, transition: { duration: 0.2 } }}
              className="flex flex-col gap-8 p-6 sm:p-10"
            >
              <div className="flex items-center gap-3 rounded-lg bg-mist p-4">
                <span className="flex size-10 items-center justify-center rounded-md bg-abyss font-medium text-mesh-ink text-sm">
                  NC
                </span>
                <span className="flex flex-col">
                  <span className="font-medium text-ink text-base">Partnerprogramma van Northwind Clothing Co.</span>
                  <span className="text-ink-3 text-sm">
                    De demowinkel van de console · 10 tot 15% commissie per niveau
                  </span>
                </span>
              </div>
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="Naam" autoComplete="name" {...f.field("name")} />
                <Field label="E-mailadres" type="email" autoComplete="email" {...f.field("email")} />
              </div>
              <div className="grid gap-6 sm:grid-cols-2">
                <Field label="Je belangrijkste kanaal" placeholder="instagram.com/jouwnaam" {...f.field("handle")} />
                <div className="flex flex-col gap-1.5">
                  <Choice label="Bereik" options={REACH} value={reach} onChange={setReach} />
                  {tried && reach.length === 0
                    ? <p className="font-medium text-ink text-sm">Kies ongeveer hoe groot je bereik is.</p>
                    : null}
                </div>
              </div>
              <Choice label="Waar promoot je?" options={CHANNELS} value={channels} onChange={setChannels} multiple />
              <Field
                label="Waarom Northwind?"
                multiline
                placeholder="Wat spreekt je publiek aan in deze winkel?"
                {...f.field("why")}
              />
              <Field
                label="Hoe zou je promoten?"
                optional
                multiline
                placeholder="Lookbook, videoreviews, nieuwsbrief…"
                {...f.field("how")}
              />
              <div className="flex flex-col gap-3 border-hairline border-t pt-6 sm:flex-row sm:items-center sm:justify-between">
                <p className="max-w-[40ch] text-ink-3 text-sm">
                  Voorbeeldformulier op de demowinkel: je aanmelding wordt niet verstuurd.
                </p>
                <button
                  type="submit"
                  disabled={state === "busy"}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-abyss px-5 font-medium text-md text-mesh-ink transition-colors hover:bg-abyss-2 disabled:opacity-70"
                >
                  {state === "busy" ? <Loader size={16} className="animate-spin" /> : null}
                  {state === "busy" ? "Even geduld" : "Aanmelding versturen"}
                </button>
              </div>
            </motion.form>
          )}
      </AnimatePresence>
    </FormLayout>
  )
}

export function PartnerAanmeldenPage({ links }: { readonly links: MarketingLinks }) {
  return (
    <MarketingPage links={links}>
      <PageHero
        variant="form"
        ground="glacier"
        title="Partner worden."
        second="Bij een winkel op Insyte."
        lede="Winkels op Insyte kunnen een eigen partnerprogramma draaien. Zo ziet de aanmelding eruit, hier voor de demowinkel Northwind: je meldt je aan, de winkel keurt goed, en daarna werk je in je eigen partnerportaal."
        fields={[
          { label: "Programma", value: "Northwind (demo)" },
          { label: "Commissie", value: "10 tot 15%" },
          { label: "Goedkeuring", value: "Door de winkel" }
        ]}
      />
      <PartnerForm />
    </MarketingPage>
  )
}
