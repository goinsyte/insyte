import { useEffect, useState } from "react"
import type { ReactNode } from "react"
import {
  AFFILIATE_COUNTRIES,
  ANALYSIS,
  AUTH_ERRORS,
  brandLine,
  COUNTRIES,
  DEMO_REFUSALS,
  PAYOUTS,
  PERSONA_LABEL,
  PERSONA_SLUG,
  PLANS,
  PREPARED,
  QUESTIONS,
  ROLE_OPTIONS,
  STOCK_OPTIONS,
  SUPPLIER_PLATFORMS,
  TEAM_SIZES,
  WORKSPACE_FULL
} from "../../fixtures/auth.ts"
import type { OfflineLevel, Persona, PlanId, PreparedId } from "../../fixtures/auth.ts"
import { navigate, paths, setQuery, useQuery } from "../../router.tsx"
import { Button, IconButton } from "../../ui/button.tsx"
import { ArrowLeft, ArrowRight, Mail, Store, TrendingUp, Truck, X } from "../../ui/icons.tsx"
import { Field, Input, Select } from "../../ui/input.tsx"
import { toast } from "../../ui/toast.tsx"
import { Segmented } from "../../ui/toggle.tsx"
import { setView, useView } from "../../view.ts"
import type { Phase } from "./fill.tsx"
import {
  AuthFrame,
  FormColumn,
  FormError,
  GoogleButton,
  Heading,
  isEmail,
  OrDivider,
  PasswordInput,
  pause,
  StepBar,
  TALL,
  TextButton,
  TextLink
} from "./frame.tsx"
import {
  AffixField,
  analysisCopy,
  analysisMode,
  AnalysisResult,
  ChoiceList,
  defaultPrepared,
  OfflinePlan,
  proposedLevels,
  Reading,
  ReadySummary,
  shopDomain,
  ShopifyConnect,
  SyncProgress
} from "./setup-parts.tsx"

/*
 * Setting up (`/app/onboarding`, and `/app/register`, which starts it). Three steps for everyone
 * (the account, the mailed link, which side of the order you are on) and then the persona's own:
 * a store owner names the workspace, picks a plan, connects Shopify, watches the first import and
 * the first analysis, and says what Insyte may do at night; a supplier gives the company, the
 * platform and how stock is reported; an affiliate applies and waits for a person to read it.
 *
 * The step is in the address (`?stap=`), so a reload or a link lands on it; the persona is the path
 * (`/v2/inrichten/merk`) or `?persona=`. Insyte is a private beta: the account step says it works on
 * invitation, and an address without one is refused in those words.
 */

type StepId =
  | "account"
  | "verify"
  | "role"
  | "organization"
  | "plan"
  | "store"
  | "sync"
  | "analysis"
  | "offline"
  | "ready"
  | "profile"
  | "api"
  | "stock"
  | "review"

const HEAD: ReadonlyArray<StepId> = ["account", "verify", "role"]
const TAIL: Readonly<Record<Persona, ReadonlyArray<StepId>>> = {
  admin: ["organization", "plan", "store", "sync", "analysis", "offline", "ready"],
  supplier: ["profile", "api", "stock", "ready"],
  affiliate: ["profile", "review"]
}

/** Minutes left from each step on, as the role picker promises them. */
const MINUTES: Readonly<Record<Persona, number>> = { admin: 7, supplier: 3, affiliate: 2 }

const MIN_BUSY = 550

const PERSONA_BY_SLUG: Readonly<Record<string, Persona>> = {
  merk: "admin",
  leverancier: "supplier",
  affiliate: "affiliate",
  admin: "admin",
  supplier: "supplier"
}

type Form = {
  email: string
  name: string
  password: string
  workspace: string
  slug: string
  slugTouched: boolean
  country: string
  team: string
  plan: PlanId
  billing: "monthly" | "annual"
  shop: string
  connected: boolean
  read: boolean
  prepared: ReadonlyArray<PreparedId> | null
  answers: Readonly<Record<string, string>>
  offline: string
  levels: Readonly<Record<string, OfflineLevel>> | null
  company: string
  supplierCountry: string
  orderEmail: string
  platform: string
  apiUrl: string
  stock: string
  handle: string
  channel: string
  affCountry: string
  reach: string
  payout: string
}

const INITIAL: Form = {
  email: "",
  name: "",
  password: "",
  workspace: "",
  slug: "",
  slugTouched: false,
  country: "Nederland",
  team: "small",
  plan: "growth",
  billing: "monthly",
  shop: "",
  connected: false,
  read: false,
  prepared: null,
  answers: Object.fromEntries(QUESTIONS.map((q) => [q.id, q.initial])),
  offline: "evening",
  levels: null,
  company: "",
  supplierCountry: "Nederland",
  orderEmail: "",
  platform: SUPPLIER_PLATFORMS[0],
  apiUrl: "",
  stock: "indicator",
  handle: "",
  channel: "",
  affCountry: "Nederland",
  reach: "10k",
  payout: PAYOUTS[0]
}

const slugify = (value: string) =>
  value.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(
    /^-+|-+$/g,
    ""
  ).slice(0, 40)

type Errors = Readonly<Record<string, string>>

export function OnboardingScreen({ slug, register = false }: {
  /** The path's persona word: `merk`, `leverancier`, `affiliate`. */
  readonly slug?: string
  readonly register?: boolean
}) {
  const view = useView()
  const query = useQuery("persona")
  const persona: Persona | null = PERSONA_BY_SLUG[slug ?? ""] ?? PERSONA_BY_SLUG[query ?? ""] ?? null
  const steps: ReadonlyArray<StepId> = persona === null ? HEAD : [...HEAD, ...TAIL[persona]]
  const entered = persona !== null && !register ? (TAIL[persona][0] ?? "account") : "account"
  const asked = useQuery("stap") as StepId | null
  const step: StepId = asked !== null && steps.includes(asked) ? asked : entered
  const index = steps.indexOf(step)

  const [form, setForm] = useState<Form>(INITIAL)
  const [errors, setErrors] = useState<Errors>({})
  const [refused, setRefused] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const set = (next: Partial<Form>) => setForm((f) => ({ ...f, ...next }))

  const seed = view.staat === "leeg" ? ANALYSIS.first : view.staat === "druk" ? ANALYSIS.busy : ANALYSIS.settled
  const mode = analysisMode(form.connected, seed)
  // The error state: the store's first import gave up, and the sync step asks to connect it again.
  const importFailed = form.connected && view.staat === "fout"
  const prepared = form.prepared ?? defaultPrepared(mode)
  const levels = form.levels ?? proposedLevels(form.answers)

  const go = (to: StepId, as: Persona | null = persona) => {
    setErrors({})
    setRefused(null)
    if (slug !== undefined && as !== persona) {
      // The persona is the path here: another one is another address.
      navigate(`${paths.onboarding(as === null ? undefined : PERSONA_SLUG[as])}?stap=${to}`)
      return
    }
    setQuery({ stap: to, persona: slug === undefined && as !== null ? PERSONA_SLUG[as] : null })
    window.scrollTo({ top: 0 })
  }

  const finish = () => {
    toast({ title: "Welkom bij Insyte.", tone: "good" })
    if (persona === "supplier") navigate(paths.supplierPortal())
    else if (persona === "affiliate") {
      setView({ affiliate: "in-afwachting" })
      navigate(paths.affiliatePortal())
    } else navigate(paths.home)
  }

  /** What the step's primary button checks before going on: the field errors, or a refusal. */
  const validate = (): { errors?: Errors; refused?: string } => {
    if (step === "account") {
      const e: Record<string, string> = {}
      if (!isEmail(form.email)) e.email = "Vul een geldig e-mailadres in."
      if (form.name.trim() === "") e.name = "Vul je naam in."
      if (form.password.length < 8) e.password = "Minimaal 8 tekens."
      if (Object.keys(e).length > 0) return { errors: e }
      if (form.email.trim().toLowerCase() === DEMO_REFUSALS.notInvited) return { refused: AUTH_ERRORS.betaClosed }
    }
    if (step === "role" && persona === null) return { errors: { role: "Kies hoe je Insyte gaat gebruiken." } }
    if (step === "organization") {
      const e: Record<string, string> = {}
      if (form.workspace.trim() === "") e.workspace = "Geef je werkruimte een naam."
      if (form.slug === "") e.slug = "Kies een adres van letters, cijfers en streepjes."
      if (Object.keys(e).length > 0) return { errors: e }
    }
    if (step === "store" && !form.connected) {
      return { errors: { shop: "Koppel eerst je winkel, of sla deze stap over." } }
    }
    if (step === "profile" && persona === "supplier") {
      const e: Record<string, string> = {}
      if (form.company.trim() === "") e.company = "Vul de naam van je bedrijf in."
      if (!isEmail(form.orderEmail)) e.orderEmail = "Vul een geldig e-mailadres in."
      if (Object.keys(e).length > 0) return { errors: e }
    }
    if (step === "api" && form.platform === "Eigen API" && !/^https:\/\/\S+\.\S+/.test(form.apiUrl.trim())) {
      return { errors: { apiUrl: "Vul een adres in dat met https:// begint." } }
    }
    if (step === "profile" && persona === "affiliate") {
      const e: Record<string, string> = {}
      if (form.handle.trim() === "") e.handle = "Vul je naam of je account in."
      if (!/^\S+\.\S+/.test(form.channel.trim())) e.channel = "Vul de link naar je kanaal of site in."
      if (Object.keys(e).length > 0) return { errors: e }
    }
    return {}
  }

  const next = async () => {
    if (step === "sync" && importFailed) {
      // "Opnieuw koppelen": Shopify's approval, and the import runs again.
      setBusy(true)
      await pause(900)
      setBusy(false)
      setView({ staat: "gewoon" })
      toast({ title: "Winkel opnieuw gekoppeld", body: "De import begint opnieuw.", tone: "good" })
      return
    }
    const check = validate()
    setErrors(check.errors ?? {})
    setRefused(null)
    if (check.errors !== undefined) return
    setBusy(true)
    await pause(step === "plan" || step === "account" || step === "offline" ? 750 : MIN_BUSY)
    setBusy(false)
    if (check.refused !== undefined) {
      setRefused(check.refused)
      return
    }
    if (step === "ready" || step === "review") {
      finish()
      return
    }
    if (step === "account" && form.orderEmail === "") set({ orderEmail: form.email })
    const to = steps[index + 1]
    if (to !== undefined) go(to)
  }

  const skip = () => {
    if (step === "store") set({ connected: false })
    if (step === "analysis") set({ prepared: [] })
    // Without the import there is nothing to analyse: on to ready, past the analysis and the offline plan.
    if (step === "sync") {
      go("ready")
      return
    }
    const to = steps[index + 1]
    if (to !== undefined) go(to)
  }

  const back = () => {
    const to = steps[index - 1]
    if (to !== undefined) go(to)
  }

  const content = renderStep({
    step,
    persona,
    form,
    set,
    errors,
    mode,
    seed,
    importFailed,
    prepared,
    levels,
    register,
    onRole: (p) => go(TAIL[p][0] ?? "role", p),
    onGoogle: async () => {
      set({ email: form.email || "founder@allure.co", name: form.name || "Elena Hart" })
      await pause(900)
      go("role")
    },
    back,
    onRead: () => set({ read: true })
  })

  const reading = step === "analysis" && mode !== "none" && !form.read
  const minutes = persona === null
    ? null
    : Math.max(1, Math.round(MINUTES[persona] * (1 - Math.max(0, index - HEAD.length) / TAIL[persona].length)))

  // A link straight into a later step has nothing typed yet: the demo's person and workspace stand in.
  const named: Form = {
    ...form,
    name: form.name.trim() !== "" || index === 0 ? form.name : "Elena Hart",
    workspace: form.workspace.trim() !== "" || !steps.includes("organization") || index <= steps.indexOf("organization")
      ? form.workspace
      : WORKSPACE_FULL
  }
  const shell = {
    workspace: persona === "supplier" ? form.company : persona === "affiliate" ? form.handle : named.workspace,
    detail: form.connected && shopDomain(form.shop) !== null
      ? `Shopify · ${form.country === "Nederland" ? "NL" : form.country}`
      : undefined,
    crumbs: steps.slice(0, index + 1).map((id, i) => crumbLabel(id, named, persona, i < index)),
    // The rail fills in from the workspace on: nothing while the account is made, all of it when ready.
    lit: persona === null || index < HEAD.length ? 0 : (index - HEAD.length + 1) / TAIL[persona].length,
    voice: step === "account" ? "plain" as const : "magnus" as const,
    index,
    total: steps.length,
    person: named.name,
    stage: {
      phase: PHASE[step],
      side: persona === "supplier"
        ? "leverancier" as const
        : persona === "affiliate"
        ? "affiliate" as const
        : "winkel" as const,
      workspace: persona === "supplier" ? form.company : persona === "affiliate" ? form.handle : named.workspace,
      person: named.name,
      plan: PLANS.find((p) => p.id === form.plan)?.name,
      store: form.connected ? (shopDomain(form.shop) ?? "je-winkel.myshopify.com") : step === "store" ? undefined : null
    },
    history: steps.slice(0, index).map((id) => ({ q: QUESTION[id], a: crumbLabel(id, named, persona, true) }))
  }

  return (
    <AuthFrame
      shell={shell}
      onClose={() => navigate(paths.login)}
      line={brandLine(persona, step)}
      meta={persona === null ? undefined : `${PERSONA_LABEL[persona]} · nog ~${minutes} min`}
      foot={persona !== null && index > HEAD.length - 1 && step !== "ready" && step !== "review" && (
        <button
          type="button"
          onClick={() => go("role", null)}
          className="rounded-xs font-medium text-rail-ink hover:text-rail-fg pointer-coarse:min-h-11"
        >
          Rol wijzigen
        </button>
      )}
    >
      <FormColumn
        stepKey={step}
        top={
          <div className="flex items-center gap-4">
            <StepBar index={index} total={steps.length} className="flex-1" />
            <IconButton
              label="Inrichten stoppen"
              onClick={() => navigate(paths.login)}
              className="pointer-coarse:size-11"
            >
              <X />
            </IconButton>
          </div>
        }
      >
        {content.head}
        {content.body}
        {refused !== null && <FormError>{refused}</FormError>}
        {content.foot !== false && (
          <footer className="mt-2 flex items-center justify-between gap-3">
            {index > 0 && step !== "ready" && step !== "review"
              ? (
                <Button
                  variant="ghost"
                  icon={<ArrowLeft size={16} />}
                  onClick={back}
                  disabled={busy}
                  className="-ml-2.5 pointer-coarse:min-h-11"
                >
                  Terug
                </Button>
              )
              : <span />}
            <div className="flex items-center gap-1">
              {content.skip !== undefined && (
                <Button variant="ghost" onClick={skip} disabled={busy || reading} className="pointer-coarse:min-h-11">
                  {content.skip}
                </Button>
              )}
              <Button
                variant="primary"
                onClick={() => void next()}
                loading={busy || reading}
                className={TALL}
              >
                {reading ? "Insyte leest" : busy ? (content.busy ?? content.primary) : content.primary}
                {!busy && !reading && <ArrowRight size={16} />}
              </Button>
            </div>
          </footer>
        )}
        {content.after}
      </FormColumn>
    </AuthFrame>
  )
}

/** Each side of the order, as the role picker draws it. */
const ROLE_GLYPH: Readonly<Record<Persona, typeof Store>> = { admin: Store, supplier: Truck, affiliate: TrendingUp }

/** How far the morning in the preview is at each step. */
const PHASE: Readonly<Record<StepId, Phase>> = {
  account: "leeg",
  verify: "leeg",
  role: "leeg",
  organization: "naam",
  plan: "plan",
  store: "winkel",
  sync: "import",
  analysis: "analyse",
  offline: "nacht",
  ready: "klaar",
  profile: "naam",
  api: "winkel",
  stock: "import",
  review: "klaar"
}

/** Each step's question, short, as the conversation keeps it once answered. */
const QUESTION: Readonly<Record<StepId, string>> = {
  account: "Wie ben je?",
  verify: "Is dit adres van jou?",
  role: "Aan welke kant van de bestelling sta jij?",
  organization: "Hoe heet je werkruimte?",
  plan: "Welk abonnement wil je proberen?",
  store: "Welke winkel koppel ik?",
  sync: "Mag ik alles ophalen?",
  analysis: "Wat zie ik in je winkel?",
  offline: "Wat mag ik doen terwijl je slaapt?",
  ready: "Klaar?",
  profile: "Wie ben je als bedrijf?",
  api: "Hoe komen bestellingen bij je binnen?",
  stock: "Hoe geef je voorraad door?",
  review: "Aanmelding versturen?"
}

/** A step in the werkdraad: once done, what was answered (the name, the plan, the store); else its name. */
function crumbLabel(id: StepId, form: Form, persona: Persona | null, done: boolean): string {
  switch (id) {
    case "account":
      return done && form.name.trim() !== "" ? form.name.trim().split(" ")[0] ?? "Account" : "Account"
    case "verify":
      return done ? "E-mail bevestigd" : "E-mail bevestigen"
    case "role":
      return done && persona !== null ? PERSONA_LABEL[persona] : "Jouw kant"
    case "organization":
      return done && form.workspace.trim() !== "" ? form.workspace.trim() : "Werkruimte"
    case "plan":
      return done ? (PLANS.find((p) => p.id === form.plan)?.name ?? "Abonnement") : "Abonnement"
    case "store":
      return done ? (form.connected ? (shopDomain(form.shop) ?? "Shopify") : "Zonder winkel") : "Shopify koppelen"
    case "sync":
      return done ? "Geïmporteerd" : "Importeren"
    case "analysis":
      return "Eerste analyse"
    case "offline":
      return done ? "Nachtregels" : "Terwijl je offline bent"
    case "ready":
      return "Klaar"
    case "profile":
      return done ? (form.company.trim() || form.handle.trim() || "Profiel") : "Profiel"
    case "api":
      return done ? form.platform : "Bestellingen"
    case "stock":
      return "Voorraad"
    case "review":
      return "Aanmelding"
  }
}

type StepContent = {
  readonly head: ReactNode
  readonly body: ReactNode
  readonly primary: string
  readonly busy?: string
  readonly skip?: string
  /** false: the step draws its own way on. */
  readonly foot?: false
  readonly after?: ReactNode
}

type StepArgs = {
  readonly step: StepId
  readonly persona: Persona | null
  readonly form: Form
  readonly set: (next: Partial<Form>) => void
  readonly errors: Errors
  readonly mode: ReturnType<typeof analysisMode>
  readonly seed: (typeof ANALYSIS)["settled"]
  readonly prepared: ReadonlyArray<PreparedId>
  readonly levels: Readonly<Record<string, OfflineLevel>>
  readonly register: boolean
  readonly onRole: (persona: Persona) => void
  readonly onGoogle: () => Promise<void>
  readonly back: () => void
  readonly onRead: () => void
  readonly importFailed: boolean
}

function renderStep(a: StepArgs): StepContent {
  const { form, set, errors } = a
  switch (a.step) {
    case "account":
      return {
        head: (
          <Heading title="Maak je account aan.">
            Insyte is in private bèta en werkt op uitnodiging. Gebruik het adres waarop je de uitnodiging kreeg.
          </Heading>
        ),
        body: (
          <>
            <GoogleAccount onGoogle={a.onGoogle} />
            <OrDivider label="of met e-mail" />
            <div className="flex flex-col gap-3.5">
              <Field label="Zakelijk e-mailadres" error={errors.email}>
                {(c) => (
                  <Input
                    {...c}
                    type="email"
                    autoComplete="email"
                    placeholder="founder@allure.co"
                    value={form.email}
                    onChange={(e) => set({ email: e.target.value })}
                    className={TALL}
                  />
                )}
              </Field>
              <Field label="Volledige naam" error={errors.name}>
                {(c) => (
                  <Input
                    {...c}
                    autoComplete="name"
                    placeholder="Elena Hart"
                    value={form.name}
                    onChange={(e) => set({ name: e.target.value })}
                    className={TALL}
                  />
                )}
              </Field>
              <Field label="Wachtwoord" error={errors.password} hint="Minimaal 8 tekens.">
                {(c) => (
                  <PasswordInput
                    {...c}
                    autoComplete="new-password"
                    value={form.password}
                    onChange={(password) => set({ password })}
                  />
                )}
              </Field>
            </div>
            <p className="text-xs text-pretty text-ink-3">
              Door verder te gaan ga je akkoord met de{" "}
              <a href="/site/voorwaarden" className="rounded-xs font-medium text-ink-2 hover:text-ink">voorwaarden</a>
              {" "}
              en het{" "}
              <a href="/site/privacy" className="rounded-xs font-medium text-ink-2 hover:text-ink">privacybeleid</a>.
            </p>
          </>
        ),
        primary: "Account aanmaken",
        busy: "Account wordt aangemaakt",
        after: (
          <>
            <p className="text-center text-sm text-ink-3">
              Heb je al een account? <TextLink to={paths.login}>Inloggen</TextLink>
            </p>
          </>
        )
      }
    case "verify":
      return {
        head: (
          <Heading title="Check je inbox.">
            We stuurden een link naar{" "}
            <span className="font-medium text-ink">{form.email || "je e-mailadres"}</span>. Open hem op dit apparaat en
            je gaat hier verder.
          </Heading>
        ),
        body: <VerifyHelp onWrongAddress={a.back} />,
        primary: "Ik heb op de link geklikt",
        busy: "Controleren"
      }
    case "role":
      return {
        head: (
          <Heading title="Aan welke kant van de bestelling sta jij?">
            Je kunt later wisselen in de instellingen.
          </Heading>
        ),
        body: (
          <div className="flex flex-col gap-1.5">
            <ChoiceList
              label="Hoe je Insyte gebruikt"
              value={a.persona === null ? [] : [a.persona]}
              onChange={(next) => {
                const p = next[0] as Persona | undefined
                if (p !== undefined) a.onRole(p)
              }}
              options={ROLE_OPTIONS.map((r) => ({
                id: r.id,
                label: r.label,
                hint: r.hint,
                meta: r.meta,
                glyph: ROLE_GLYPH[r.id]
              }))}
            />
            {errors.role !== undefined && <p className="text-xs text-bad-ink">{errors.role}</p>}
          </div>
        ),
        primary: "Verder"
      }
    case "organization":
      return {
        head: (
          <Heading title="Geef je werkruimte een naam.">
            Je team ziet hem bij elke uitnodiging en in de adresbalk.
          </Heading>
        ),
        body: (
          <div className="flex flex-col gap-3.5">
            <Field label="Naam werkruimte" error={errors.workspace}>
              {(c) => (
                <Input
                  {...c}
                  autoComplete="organization"
                  placeholder="Allure Studio"
                  value={form.workspace}
                  onChange={(e) =>
                    set({ workspace: e.target.value, ...(form.slugTouched ? {} : { slug: slugify(e.target.value) }) })}
                  className={TALL}
                />
              )}
            </Field>
            <Field label="Adres" error={errors.slug} hint="Kleine letters, cijfers en streepjes.">
              {(c) => (
                <AffixField
                  id={c.id}
                  before="goinsyte.com/"
                  value={form.slug}
                  onChange={(v) => set({ slug: slugify(v), slugTouched: true })}
                  placeholder="allure-studio"
                  invalid={errors.slug !== undefined}
                  describedBy={c["aria-describedby"]}
                />
              )}
            </Field>
            <Field label="Land">
              {(c) => (
                <Select
                  {...c}
                  value={form.country}
                  onChange={(e) => set({ country: e.target.value })}
                  className={TALL}
                >
                  {COUNTRIES.map((country) => <option key={country}>{country}</option>)}
                </Select>
              )}
            </Field>
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-ink">Teamgrootte</span>
              <ChoiceList
                label="Teamgrootte"
                columns={2}
                value={[form.team]}
                onChange={(next) => set({ team: next[0] ?? form.team })}
                options={TEAM_SIZES}
              />
            </div>
          </div>
        ),
        primary: "Verder"
      }
    case "plan": {
      const annual = form.billing === "annual"
      return {
        head: (
          <Heading title="Kies een abonnement om te proberen.">
            14 dagen gratis, zonder kaart. Daarna kies je opnieuw of stop je.
          </Heading>
        ),
        body: (
          <div className="flex flex-col gap-3">
            <Segmented
              label="Facturatie"
              value={form.billing}
              onChange={(billing) => set({ billing })}
              options={[{ value: "monthly", label: "Maandelijks" }, { value: "annual", label: "Jaarlijks −10%" }]}
            />
            <ChoiceList
              label="Abonnement"
              value={[form.plan]}
              onChange={(next) => set({ plan: (next[0] as PlanId | undefined) ?? form.plan })}
              options={PLANS.map((p) => ({
                id: p.id,
                label: p.name,
                hint: p.tagline,
                meta: (
                  <span className="figure">
                    <span className="text-sm font-semibold text-ink">€{annual ? p.annual : p.monthly}</span> per maand
                  </span>
                )
              }))}
            />
            <p className="text-xs text-ink-3">Prijzen zonder btw{annual ? ", jaarlijks gefactureerd" : ""}.</p>
          </div>
        ),
        primary: "Gratis proefperiode starten",
        busy: "Proefperiode wordt gestart"
      }
    }
    case "store":
      return {
        head: (
          <Heading title="Koppel Shopify.">
            Insyte leest je bestellingen, producten en klanten. Schrijven doet het pas als jij dat toestaat.
          </Heading>
        ),
        body: (
          <div className="flex flex-col gap-2">
            <ShopifyConnect
              handle={form.shop}
              setHandle={(shop) => set({ shop })}
              connected={form.connected}
              onConnected={(domain) => set({ connected: true, shop: domain })}
            />
            {errors.shop !== undefined && !form.connected && <p className="text-xs text-bad-ink">{errors.shop}</p>}
          </div>
        ),
        primary: "Verder",
        skip: form.connected ? undefined : "Nu overslaan"
      }
    case "sync":
      if (a.importFailed) {
        return {
          head: (
            <Heading title="De eerste import is mislukt.">
              Koppel je winkel opnieuw om het nog eens te proberen, of ga verder zonder en koppel later via Instellingen
              › Koppelingen.
            </Heading>
          ),
          body: null,
          primary: "Opnieuw koppelen",
          busy: "Shopify wordt geopend",
          skip: "Nu overslaan"
        }
      }
      return {
        head: (
          <Heading title={form.connected ? "Alles wordt opgehaald." : "Geen winkel, geen import."}>
            {form.connected
              ? `Uit ${shopDomain(form.shop) ?? form.shop}. Dit duurt even, je hoeft niet te wachten.`
              : "Dat is goed: je kunt alles inrichten en later koppelen."}
          </Heading>
        ),
        body: <SyncProgress connected={form.connected} store={a.seed.store} domain={shopDomain(form.shop)} />,
        primary: form.connected ? "Laat Insyte kijken" : "Verder",
        ...(form.connected ? { skip: "Nu overslaan" } : {})
      }
    case "analysis": {
      const copy = analysisCopy(a.mode, form.read, a.seed)
      return {
        head: <Heading title={copy.title}>{copy.subtitle}</Heading>,
        body: a.mode !== "none" && !form.read
          ? <Reading onDone={a.onRead} />
          : (
            <AnalysisResult
              mode={a.mode}
              seed={a.seed}
              prepared={a.prepared}
              setPrepared={(prepared) => set({ prepared })}
              answers={form.answers}
              setAnswer={(id, value) => set({ answers: { ...form.answers, [id]: value }, levels: null })}
            />
          ),
        primary: a.prepared.length === 0 ? "Verder" : "Klaarzetten",
        busy: "Wordt klaargezet",
        skip: a.prepared.length === 0 ? undefined : "Doorgaan zonder"
      }
    }
    case "offline":
      return {
        head: (
          <Heading title="Terwijl je offline bent.">
            Wat Insyte buiten je werktijd zelf mag doen. Alles is later te wijzigen.
          </Heading>
        ),
        body: (
          <OfflinePlan
            answers={form.answers}
            window={form.offline}
            setWindow={(offline) => set({ offline })}
            levels={a.levels}
            setLevel={(id, level) => set({ levels: { ...a.levels, [id]: level } })}
            automation={a.prepared.includes("automation")}
          />
        ),
        primary: "Afronden",
        busy: "Wordt opgeslagen"
      }
    case "ready":
      if (a.persona === "supplier") {
        return {
          head: (
            <Heading title="Je bent binnen.">
              {form.company || "Je bedrijf"} staat klaar in het leveranciersportaal.
            </Heading>
          ),
          body: (
            <div className="flex flex-col gap-1.5 rounded-md bg-well px-4 py-4 text-sm text-pretty">
              <span className="font-semibold text-ink">Leveranciersportaal klaar</span>
              <span className="text-ink-2">
                Bestellingen komen binnen op {form.orderEmail || "je e-mailadres"}. Voorraad:{" "}
                {STOCK_OPTIONS.find((s) => s.id === form.stock)?.title.toLowerCase()}. Koppeling: {form.platform}.
              </span>
            </div>
          ),
          primary: "Naar het portaal"
        }
      }
      return {
        head: <Heading title="Je bent binnen.">{form.workspace || "Je werkruimte"} staat klaar.</Heading>,
        body: (
          <ReadySummary
            connected={form.connected}
            store={a.seed.store}
            prepared={a.prepared.map((id) => PREPARED[id].title)}
          />
        ),
        primary: "Dashboard openen",
        busy: "Dashboard wordt geopend"
      }
    case "profile":
      if (a.persona === "supplier") {
        return {
          head: (
            <Heading title="Vertel ons over je bedrijf.">
              Dit zien klanten op pakbonnen en in mails over terugbetalingen.
            </Heading>
          ),
          body: (
            <div className="flex flex-col gap-3.5">
              <Field label="Bedrijfsnaam" error={errors.company}>
                {(c) => (
                  <Input
                    {...c}
                    autoComplete="organization"
                    placeholder="Black Cedar Studio"
                    value={form.company}
                    onChange={(e) => set({ company: e.target.value })}
                    className={TALL}
                  />
                )}
              </Field>
              <Field label="E-mailadres voor bestellingen" error={errors.orderEmail}>
                {(c) => (
                  <Input
                    {...c}
                    type="email"
                    placeholder="orders@bedrijf.nl"
                    value={form.orderEmail}
                    onChange={(e) => set({ orderEmail: e.target.value })}
                    className={TALL}
                  />
                )}
              </Field>
              <Field label="Verzendt vanuit">
                {(c) => (
                  <Select
                    {...c}
                    value={form.supplierCountry}
                    onChange={(e) => set({ supplierCountry: e.target.value })}
                    className={TALL}
                  >
                    {COUNTRIES.map((country) => <option key={country}>{country}</option>)}
                  </Select>
                )}
              </Field>
            </div>
          ),
          primary: "Verder"
        }
      }
      return {
        head: (
          <Heading title="Vertel ons wie je bereikt.">
            Hoe specifieker, hoe sneller we je aanmelding kunnen beoordelen.
          </Heading>
        ),
        body: (
          <div className="flex flex-col gap-3.5">
            <Field label="Naam of account" error={errors.handle}>
              {(c) => (
                <Input
                  {...c}
                  placeholder="@noor.draagt"
                  value={form.handle}
                  onChange={(e) => set({ handle: e.target.value })}
                  className={TALL}
                />
              )}
            </Field>
            <Field label="Link naar je kanaal of site" error={errors.channel}>
              {(c) => (
                <Input
                  {...c}
                  type="url"
                  inputMode="url"
                  placeholder="instagram.com/noor.draagt"
                  value={form.channel}
                  onChange={(e) => set({ channel: e.target.value })}
                  className={TALL}
                />
              )}
            </Field>
            <Field label="Waar woont je publiek vooral">
              {(c) => (
                <Select
                  {...c}
                  value={form.affCountry}
                  onChange={(e) => set({ affCountry: e.target.value })}
                  className={TALL}
                >
                  {AFFILIATE_COUNTRIES.map((country) => <option key={country}>{country}</option>)}
                </Select>
              )}
            </Field>
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-ink">Bereik</span>
              <Segmented
                stretch
                label="Bereik"
                value={form.reach}
                onChange={(reach) => set({ reach })}
                options={[
                  { value: "1k", label: "Tot 10k" },
                  { value: "10k", label: "10k tot 100k" },
                  { value: "100k", label: "Meer" }
                ]}
              />
            </div>
            <Field label="Uitbetalen via">
              {(c) => (
                <Select
                  {...c}
                  value={form.payout}
                  onChange={(e) => set({ payout: e.target.value })}
                  className={TALL}
                >
                  {PAYOUTS.map((p) => <option key={p}>{p}</option>)}
                </Select>
              )}
            </Field>
          </div>
        ),
        primary: "Aanmelding versturen",
        busy: "Wordt verstuurd"
      }
    case "api":
      return {
        head: (
          <Heading title="Hoe komen bestellingen bij je binnen?">
            Koppel het platform dat je al gebruikt, of sla het over.
          </Heading>
        ),
        body: (
          <div className="flex flex-col gap-3.5">
            <Field label="Platform" optional>
              {(c) => (
                <Select
                  {...c}
                  value={form.platform}
                  onChange={(e) => set({ platform: e.target.value })}
                  className={TALL}
                >
                  {SUPPLIER_PLATFORMS.map((p) => <option key={p}>{p}</option>)}
                </Select>
              )}
            </Field>
            {form.platform === "Eigen API" && (
              <Field
                label="Adres van je API"
                error={errors.apiUrl}
                hint="We sturen een testbestelling zodra je klaar bent."
              >
                {(c) => (
                  <Input
                    {...c}
                    type="url"
                    inputMode="url"
                    placeholder="https://api.bedrijf.nl/orders"
                    value={form.apiUrl}
                    onChange={(e) => set({ apiUrl: e.target.value })}
                    className={TALL}
                  />
                )}
              </Field>
            )}
            <p className="text-sm text-pretty text-ink-2">
              Maatwerk richten we één op één met je in. Tot die tijd komen bestellingen per mail en in het portaal.
            </p>
          </div>
        ),
        primary: "Verder",
        skip: "Overslaan"
      }
    case "stock":
      return {
        head: <Heading title="Hoe geef je voorraad door?">Je kunt later altijd van modus wisselen.</Heading>,
        body: (
          <ChoiceList
            label="Voorraad doorgeven"
            value={[form.stock]}
            onChange={(next) => set({ stock: next[0] ?? form.stock })}
            options={STOCK_OPTIONS.map((s) => ({ id: s.id, label: s.title, hint: s.body }))}
          />
        ),
        primary: "Afronden",
        busy: "Wordt opgeslagen"
      }
    case "review":
      return {
        head: (
          <Heading title="Aanmelding ontvangen.">
            We lezen elke aanmelding zelf en mailen je binnen twee werkdagen. Tot dan zie je je portaal al, met je
            aanmelding als in afwachting.
          </Heading>
        ),
        body: (
          <dl className="flex flex-col gap-2 rounded-md bg-well px-4 py-3.5 text-sm">
            <Row term="Account" value={form.handle || "Je account"} />
            <Row term="Kanaal" value={form.channel || "Nog niet ingevuld"} />
            <Row term="Publiek" value={form.affCountry} />
            <Row term="Uitbetalen via" value={form.payout} />
          </dl>
        ),
        primary: "Begrepen"
      }
  }
}

function Row({ term, value }: { readonly term: string; readonly value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-ink-2">{term}</dt>
      <dd className="min-w-0 truncate text-right font-medium text-ink">{value}</dd>
    </div>
  )
}

function GoogleAccount({ onGoogle }: { readonly onGoogle: () => Promise<void> }) {
  const [busy, setBusy] = useState(false)
  return (
    <GoogleButton
      loading={busy}
      onClick={async () => {
        setBusy(true)
        await onGoogle()
      }}
    />
  )
}

/** Resend with a 30-second wait between sends, and a way back when the address was wrong. */
function VerifyHelp({ onWrongAddress }: { readonly onWrongAddress: () => void }) {
  const [wait, setWait] = useState(0)
  useEffect(() => {
    if (wait === 0) return
    const t = window.setTimeout(() => setWait((n) => n - 1), 1000)
    return () => window.clearTimeout(t)
  }, [wait])
  return (
    <div className="flex items-start gap-3 text-sm text-ink-2">
      <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-well text-ink-2">
        <Mail size={18} />
      </span>
      <div className="flex min-w-0 flex-col gap-1">
        <p className="text-pretty">Niets binnen? Kijk in je spam, of vraag een nieuwe link.</p>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          <TextButton
            disabled={wait > 0}
            onClick={() => {
              setWait(30)
              toast({ title: "Nieuwe link verstuurd", body: "De vorige werkt niet meer." })
            }}
          >
            {wait > 0 ? <span className="figure">Opnieuw over {wait} s</span> : "E-mail opnieuw sturen"}
          </TextButton>
          <TextButton tone="quiet" onClick={onWrongAddress}>Verkeerd adres?</TextButton>
        </div>
      </div>
    </div>
  )
}
