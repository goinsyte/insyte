import { useRef, useState } from "react"
import type { ReactNode } from "react"
import {
  invitation,
  longDate,
  NOTIFY,
  PORTAL_SCOPES,
  relative,
  ROLES,
  SEATS_TOTAL,
  SIGNED_IN_AS,
  storesLabel
} from "../../fixtures/auth.ts"
import type { BrandLine, Invitation, InvitationState } from "../../fixtures/auth.ts"
import { Link, navigate, paths } from "../../router.tsx"
import { Avatar } from "../../ui/avatar.tsx"
import { Button } from "../../ui/button.tsx"
import { cx } from "../../ui/cx.ts"
import { ArrowRight, Check, Image, Mail, ShieldCheck, X } from "../../ui/icons.tsx"
import { Field, Input } from "../../ui/input.tsx"
import { toast } from "../../ui/toast.tsx"
import { Segmented, ToggleRow } from "../../ui/toggle.tsx"
import {
  AuthFrame,
  FormColumn,
  GoogleButton,
  Heading,
  isEmail,
  OrDivider,
  PasswordInput,
  pause,
  primaryWide,
  secondaryWide,
  StepBar,
  TALL,
  TextButton,
  TextLink
} from "./frame.tsx"

/*
 * Where an invitation link lands (`/app/invitations/$invitationId`), in every state it can be in.
 *
 * The page always says the same three things first (whose workspace, who asked, and as what, with
 * what that role may do) and then the one thing to do about it: make an account, sign in, switch
 * account, continue with the company's Google Workspace, or, when the link no longer works, ask for
 * a new one. A new person joins in three short steps (account, photo, notifications); a supplier or
 * an affiliate makes the account here and goes on to their portal.
 */

type Phase = "invite" | "photo" | "notify" | "requested"

export function InvitationScreen({ id }: { readonly id: string }) {
  const inv = invitation(id)
  const [state, setState] = useState<InvitationState>(inv.state)
  const [phase, setPhase] = useState<Phase>("invite")
  const [name, setName] = useState(inv.name ?? "")
  const [photo, setPhoto] = useState<string | undefined>()
  const role = inv.roleId === undefined ? "" : ROLES[inv.roleId].label
  const who = name.trim() || inv.name || inv.email || "collega"

  const join = (notify: { on: number; email: boolean }) => {
    toast({
      title: `Je zit in ${inv.workspace}`,
      body: notify.on === 0
        ? "Meldingen staan uit. Je zet ze aan in je profiel."
        : `${notify.on} soorten meldingen aan, in Insyte${notify.email ? " en per e-mail" : ""}.`,
      tone: "good"
    })
    navigate(paths.home)
  }

  const joinPartner = () => {
    if (state === "supplier") {
      toast({
        title: `Account gemaakt voor ${inv.company ?? "je bedrijf"}`,
        body: "De bestellingen voor jullie staan in het portaal.",
        tone: "good"
      })
      navigate(paths.supplierPortal())
      return
    }
    toast({ title: "Account gemaakt", body: `Je start op ${inv.tier?.label ?? "Brons"}.`, tone: "good" })
    navigate(paths.affiliatePortal())
  }

  const steps = state === "new" || state === "link" || state === "sso"
  const stepKey = `${state}-${phase}`

  return (
    <AuthFrame
      line={brandLine(inv, state)}
      meta={<WorkspaceChip name={inv.workspace} />}
      shell={{
        // The workspace exists already: its shell stands complete, waiting for you to come in.
        workspace: inv.workspace,
        detail: `Uitnodiging van ${firstName(inv.inviter.name)}`,
        crumbs: ["Uitnodiging", ...(phase === "photo" ? ["Je foto"] : phase === "notify" ? ["Meldingen"] : [])],
        lit: 1,
        meta: null,
        person: name,
        ...(steps ? { index: phase === "photo" ? 1 : phase === "notify" ? 2 : 0, total: 3 } : {}),
        stage: {
          phase: "analyse",
          workspace: inv.workspace,
          greeting: name.trim() === "" ? "Welkom" : `Welkom, ${firstName(name.trim())}`,
          store: "northwind.myshopify.com"
        },
        history: phase === "photo"
          ? [{ q: `Word je lid van ${inv.workspace}?`, a: "Ja" }]
          : phase === "notify"
          ? [{ q: `Word je lid van ${inv.workspace}?`, a: "Ja" }, { q: "Hoe herkent je team je?", a: "Foto gekozen" }]
          : []
      }}
    >
      <FormColumn stepKey={stepKey}>
        {phase === "photo"
          ? (
            <>
              <StepBar index={1} total={3} />
              <PhotoStep
                name={who}
                photo={photo}
                setPhoto={setPhoto}
                onNext={() => setPhase("notify")}
                onBack={() => setPhase("invite")}
              />
            </>
          )
          : phase === "notify"
          ? (
            <>
              <StepBar index={2} total={3} />
              <NotifyStep
                workspace={inv.workspace}
                onDone={join}
                onBack={() => setPhase(state === "sso" ? "invite" : "photo")}
              />
            </>
          )
          : phase === "requested"
          ? <Requested inv={inv} state={state} />
          : (
            <>
              {steps && <StepBar index={0} total={3} />}
              <Body
                inv={inv}
                state={state}
                role={role}
                name={name}
                setName={setName}
                onJoinNew={() => setPhase("photo")}
                onJoinSso={() => setPhase("notify")}
                onSignedIn={() => join({ on: 3, email: false })}
                onPartner={joinPartner}
                onRequested={() => setPhase("requested")}
                setState={setState}
              />
            </>
          )}
      </FormColumn>
    </AuthFrame>
  )
}

/** Whose workspace this is: its initials and its name, beside the wordmark on a phone. */
function WorkspaceChip({ name }: { readonly name: string }) {
  const initials = name.split(/\s+/).filter((w) => /[a-z0-9]/i.test(w[0] ?? "")).map((w) => w[0]).slice(0, 2).join("")
    .toUpperCase()
  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-xs bg-rail-fg text-2xs font-bold text-rail">
        {initials}
      </span>
      <span className="truncate">{name}</span>
    </span>
  )
}

function brandLine(inv: Invitation, state: InvitationState): BrandLine {
  if (state === "supplier") {
    return {
      lead: "Lever aan",
      rest: inv.workspace,
      body:
        `Je ziet alleen de bestellingen met jullie producten en wat ${inv.workspace} daarvoor betaalt. Nooit de gegevens van hun klanten.`
    }
  }
  if (state === "affiliate") {
    return {
      lead: "Verdien mee met",
      rest: inv.workspace,
      body: `${
        inv.tier?.rate ?? 10
      }% commissie op elke bestelling via jouw code, op de 15e van de maand erna uitbetaald.`
    }
  }
  if (state === "expired" || state === "revoked" || state === "missing") {
    return {
      lead: "Deze link",
      rest: "werkt niet meer.",
      body: "Een uitnodiging is persoonlijk en tijdelijk. Wie je uitnodigde, kan in een klik een nieuwe sturen."
    }
  }
  if (state === "accepted") {
    return { lead: "Je zit al in", rest: inv.workspace, body: "Log in en je gaat verder waar je gebleven was." }
  }
  if (state === "full") {
    return {
      lead: "Bijna binnen bij",
      rest: inv.workspace,
      body: "Het abonnement van deze werkruimte heeft geen vrije plek. Eén klik en de eigenaar weet het."
    }
  }
  return {
    lead: "Kom erbij in",
    rest: inv.workspace,
    body:
      "Bestellingen, tickets, chats en chargebacks van het hele team in één wachtrij. Insyte doet het werk, binnen de regels van jullie team."
  }
}

const firstName = (name: string) => name.split(" ")[0] ?? name

/* ── the invitation itself, and what to do about it ────────────────────────────────────────────── */

function Body({ inv, state, role, name, setName, onJoinNew, onJoinSso, onSignedIn, onPartner, onRequested, setState }: {
  readonly inv: Invitation
  readonly state: InvitationState
  readonly role: string
  readonly name: string
  readonly setName: (next: string) => void
  readonly onJoinNew: () => void
  readonly onJoinSso: () => void
  readonly onSignedIn: () => void
  readonly onPartner: () => void
  readonly onRequested: () => void
  readonly setState: (next: InvitationState) => void
}) {
  const until = inv.at === undefined ? "" : relative(inv.at)
  const first = firstName(inv.inviter.name)

  if (state === "expired" || state === "revoked" || state === "missing") {
    const title = state === "expired"
      ? "Deze uitnodiging is verlopen"
      : state === "revoked"
      ? "Deze uitnodiging is ingetrokken"
      : "Deze uitnodiging bestaat niet"
    const sub = state === "expired"
      ? `De uitnodiging van ${inv.inviter.name} voor ${inv.workspace} verliep ${until}. Vraag een nieuwe en je krijgt hem op ${
        inv.email ?? "je e-mailadres"
      }.`
      : state === "revoked"
      ? `${inv.inviter.name} heeft deze uitnodiging voor ${inv.workspace} ingetrokken. Denk je dat dat een vergissing is, vraag het dan even na.`
      : "Controleer of je de hele link hebt gekopieerd, of vraag wie je uitnodigde om hem opnieuw te sturen."
    return (
      <>
        <Sign tone="off" />
        <Heading title={title}>{sub}</Heading>
        <Actions>
          {state === "expired" && <AskButton label="Nieuwe uitnodiging vragen" onDone={onRequested} />}
          {state === "revoked" && (
            <AskButton label={`${first} mailen`} icon={<Mail size={16} />} onDone={onRequested} />
          )}
          <Link to={paths.login} className={state === "missing" ? primaryWide : secondaryWide}>Naar inloggen</Link>
        </Actions>
      </>
    )
  }

  if (state === "accepted") {
    return (
      <>
        <Sign tone="ok" />
        <Heading title={`Je zit al in ${inv.workspace}`}>
          {inv.email} accepteerde deze uitnodiging op{" "}
          {inv.at === undefined ? "een eerdere dag" : longDate(inv.at)}. De link doet verder niets meer.
        </Heading>
        <RoleCard inv={inv} role={role} />
        <Actions>
          <Link to={paths.home} className={primaryWide}>
            Naar {inv.workspace}
            <ArrowRight size={16} />
          </Link>
          <Link to={paths.login} className={secondaryWide}>Met een ander account inloggen</Link>
        </Actions>
      </>
    )
  }

  if (state === "full") {
    return (
      <>
        <Heading title={`${inv.workspace} is vol`}>
          Je uitnodiging is geldig, maar alle {SEATS_TOTAL} plekken op het abonnement zijn bezet. {inv.inviter.name}
          {" "}
          kan er een bijkopen of iemand anders zijn plek laten vrijgeven.
        </Heading>
        <RoleCard inv={inv} role={role} />
        <div className="flex flex-col gap-1.5">
          <div className="flex gap-0.5" aria-hidden="true">
            {Array.from({ length: SEATS_TOTAL }, (_, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: seats are positions
              <span key={i} className="h-1.5 flex-1 rounded-full bg-warn" />
            ))}
          </div>
          <p className="figure text-xs text-ink-3">{SEATS_TOTAL} van {SEATS_TOTAL} plekken bezet</p>
        </div>
        <Actions>
          <AskButton label={`${first} om een plek vragen`} onDone={onRequested} />
          <Link to={paths.login} className={secondaryWide}>Met een ander account inloggen</Link>
        </Actions>
      </>
    )
  }

  if (state === "other-account") {
    return (
      <>
        <Heading title={`Uitnodiging voor ${inv.workspace}`}>
          <InviterLine inv={inv} until={until} />
        </Heading>
        <Message inv={inv} />
        <RoleCard inv={inv} role={role} />
        <p className="rounded-md bg-warn-tint px-3.5 py-3 text-sm text-pretty text-ink">
          Je bent ingelogd als <span className="font-medium">{SIGNED_IN_AS.email}</span>. Deze uitnodiging is voor{" "}
          <span className="font-medium">{inv.email}</span>, en alleen dat account kan hem accepteren.
        </p>
        <Actions>
          <SwitchButton email={inv.email ?? ""} onDone={() => setState("existing")} />
          <AskButton label={`${first} vragen mijn werkadres uit te nodigen`} secondary onDone={onRequested} />
        </Actions>
      </>
    )
  }

  if (state === "existing") return <SignInState inv={inv} role={role} until={until} onSignedIn={onSignedIn} />
  if (state === "sso") return <SsoState inv={inv} role={role} until={until} onContinue={onJoinSso} />

  return (
    <AccountState
      inv={inv}
      state={state}
      role={role}
      until={until}
      name={name}
      setName={setName}
      onDone={state === "supplier" || state === "affiliate" ? onPartner : onJoinNew}
    />
  )
}

function Requested({ inv, state }: { readonly inv: Invitation; readonly state: InvitationState }) {
  return (
    <>
      <Sign tone="ok" />
      <Heading title={`${firstName(inv.inviter.name)} weet het`}>
        We hebben {inv.inviter.name} gevraagd{" "}
        {state === "full" ? "een plek vrij te maken of bij te kopen" : "je een nieuwe uitnodiging te sturen"}. Die komt
        binnen op {inv.email ?? "je e-mailadres"}.
      </Heading>
      <Link to={paths.login} className={secondaryWide}>Naar inloggen</Link>
    </>
  )
}

function Sign({ tone }: { readonly tone: "ok" | "off" }) {
  return (
    <span
      className={cx(
        "inline-flex size-10 items-center justify-center rounded-full",
        tone === "ok" ? "bg-good-tint text-good-ink" : "bg-well text-ink-2"
      )}
    >
      {tone === "ok" ? <Check size={18} strokeWidth={2.25} /> : <X size={18} />}
      <span className="sr-only">{tone === "ok" ? "Gelukt" : "Werkt niet meer"}</span>
    </span>
  )
}

function Actions({ children }: { readonly children: ReactNode }) {
  return <div className="flex flex-col gap-2.5">{children}</div>
}

/** Asks the inviter for something (a new invitation, a seat), busy for a moment, then says it went. */
function AskButton({ label, icon, secondary = false, onDone }: {
  readonly label: string
  readonly icon?: ReactNode
  readonly secondary?: boolean
  readonly onDone: () => void
}) {
  const [busy, setBusy] = useState(false)
  return (
    <Button
      variant={secondary ? "secondary" : "primary"}
      icon={icon}
      loading={busy}
      className={secondary ? secondaryWide : primaryWide}
      onClick={async () => {
        setBusy(true)
        await pause()
        setBusy(false)
        onDone()
      }}
    >
      {label}
    </Button>
  )
}

function SwitchButton({ email, onDone }: { readonly email: string; readonly onDone: () => void }) {
  const [busy, setBusy] = useState(false)
  return (
    <Button
      variant="primary"
      loading={busy}
      className={cx(primaryWide, "h-auto py-2 whitespace-normal")}
      onClick={async () => {
        setBusy(true)
        await pause()
        setBusy(false)
        toast({ title: `Uitgelogd als ${SIGNED_IN_AS.email}` })
        onDone()
      }}
    >
      Uitloggen en doorgaan als {email}
    </Button>
  )
}

function InviterLine({ inv, until }: { readonly inv: Invitation; readonly until: string }) {
  return (
    <>
      {inv.inviter.name} ({inv.inviter.role}) nodigde{" "}
      {inv.email === undefined ? "je" : <span className="font-medium text-ink">{inv.email}</span>} uit
      {until === "" ? "." : `. De uitnodiging verloopt ${until}.`}
    </>
  )
}

/** Who asked, and what they wrote, in their own words: no box, the face and the quote. */
function Message({ inv }: { readonly inv: Invitation }) {
  if (inv.message === undefined) return null
  return (
    <figure className="flex gap-3">
      <Avatar name={inv.inviter.name} size={28} />
      <div className="flex min-w-0 flex-col gap-0.5">
        <blockquote className="text-sm text-pretty text-ink">{inv.message}</blockquote>
        <figcaption className="text-xs text-ink-3">{inv.inviter.name}</figcaption>
      </div>
    </figure>
  )
}

/** The role the invitation grants and what it may do, in the roles matrix's own words. */
function RoleCard({ inv, role }: { readonly inv: Invitation; readonly role: string }) {
  if (inv.company !== undefined) {
    return (
      <section aria-label="Wat je ziet" className="flex flex-col gap-2.5 rounded-md bg-well px-4 py-3.5">
        <h2 className="text-sm font-semibold text-ink">Wat {inv.company} in het portaal ziet</h2>
        <ul className="flex flex-col gap-2 text-sm text-ink-2">
          {PORTAL_SCOPES.map((s) => (
            <li key={s.id}>
              <span className="text-ink">{s.label}.</span> {s.detail}
            </li>
          ))}
        </ul>
      </section>
    )
  }
  if (inv.tier !== undefined) {
    return (
      <section aria-label="Je niveau" className="flex flex-col gap-2.5 rounded-md bg-well px-4 py-3.5">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-semibold text-ink">Niveau {inv.tier.label}</h2>
          <span className="figure text-lg font-semibold text-ink">{inv.tier.rate}%</span>
        </div>
        <ul className="flex flex-col gap-2 text-sm text-ink-2">
          <li>
            Je eigen kortingscode{inv.code === undefined ? "" : `, voorlopig ${inv.code}`}, en links naar elk product.
          </li>
          <li>Commissie na een retourtermijn van 14 dagen, uitbetaald op de 15e.</li>
          <li>Je ziet alleen je eigen doorverwijzingen, niet de winkel.</li>
        </ul>
      </section>
    )
  }
  const abilities = inv.roleId === undefined ? [] : ROLES[inv.roleId].abilities
  return (
    <section aria-label="Je rol" className="flex flex-col gap-2.5 rounded-md bg-well px-4 py-3.5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold text-ink">Als {role || "teamlid"}</h2>
        <span className="truncate text-xs text-ink-3">{storesLabel(inv.stores)}</span>
      </div>
      <ul className="flex flex-col gap-2 text-sm text-pretty text-ink-2">
        {abilities.map((a) => <li key={a}>{a}</li>)}
        <li>
          Werkt in {inv.stores === "all" ? "alle winkels, ook die later gekoppeld worden" : storesLabel(inv.stores)}.
        </li>
      </ul>
    </section>
  )
}

/* ── the forms ─────────────────────────────────────────────────────────────────────────────────── */

function AccountState({ inv, state, role, until, name, setName, onDone }: {
  readonly inv: Invitation
  readonly state: InvitationState
  readonly role: string
  readonly until: string
  readonly name: string
  readonly setName: (next: string) => void
  readonly onDone: () => void
}) {
  const link = state === "link"
  const supplier = state === "supplier"
  const [email, setEmail] = useState(inv.email ?? "")
  const [company, setCompany] = useState(inv.company ?? "")
  const [password, setPassword] = useState("")
  const [errors, setErrors] = useState<{ name?: string; email?: string; password?: string }>({})
  const [busy, setBusy] = useState<"form" | "google" | null>(null)

  const title = supplier
    ? `${inv.company ?? "Je bedrijf"} in het leveranciersportaal`
    : state === "affiliate"
    ? `Partner worden van ${inv.workspace}`
    : `Word lid van ${inv.workspace}`

  const submit = async () => {
    const next = {
      name: name.trim() === ""
        ? (supplier ? `Vul je naam in, zo weet ${inv.workspace} met wie ze praten.` : "Vul je naam in.")
        : undefined,
      email: link && !isEmail(email) ? "Vul een geldig e-mailadres in." : undefined,
      password: password.length < 8 ? "Kies een wachtwoord van minimaal 8 tekens." : undefined
    }
    setErrors(next)
    if (next.name !== undefined || next.email !== undefined || next.password !== undefined) return
    setBusy("form")
    await pause()
    setBusy(null)
    onDone()
  }

  return (
    <>
      <Heading title={title}>
        {link
          ? (
            <>
              {inv.inviter.name} deelde deze link. Je komt binnen als{" "}
              <span className="font-medium text-ink">{role}</span>
              {until === "" ? "." : `; hij werkt tot ${until}.`}
            </>
          )
          : <InviterLine inv={inv} until={until} />}
      </Heading>
      <Message inv={inv} />
      <RoleCard inv={inv} role={role} />
      <GoogleButton
        loading={busy === "google"}
        disabled={busy === "form"}
        onClick={async () => {
          if (name.trim() === "") setName(inv.name ?? "")
          setBusy("google")
          await pause(900)
          setBusy(null)
          onDone()
        }}
      />
      <OrDivider label="of met een wachtwoord" />
      <form
        noValidate
        className="flex flex-col gap-3.5"
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        <Field label={supplier ? "Zakelijk e-mailadres" : "E-mailadres"} error={errors.email}>
          {(control) => (
            <Input
              {...control}
              type="email"
              autoComplete="email"
              placeholder="naam@bedrijf.nl"
              value={email}
              readOnly={!link}
              onChange={(event) => setEmail(event.target.value)}
              className={TALL}
            />
          )}
        </Field>
        {supplier && (
          <Field label="Bedrijfsnaam">
            {(control) => (
              <Input
                {...control}
                autoComplete="organization"
                value={company}
                onChange={(event) => setCompany(event.target.value)}
                className={TALL}
              />
            )}
          </Field>
        )}
        <Field label={supplier ? "Je naam" : "Volledige naam"} error={errors.name}>
          {(control) => (
            <Input
              {...control}
              autoComplete="name"
              placeholder="Voornaam Achternaam"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className={TALL}
            />
          )}
        </Field>
        <Field label="Wachtwoord" error={errors.password}>
          {(control) => (
            <PasswordInput
              {...control}
              autoComplete="new-password"
              placeholder="Minimaal 8 tekens"
              value={password}
              onChange={setPassword}
            />
          )}
        </Field>
        <Button
          type="submit"
          variant="primary"
          loading={busy === "form"}
          disabled={busy === "google"}
          className={cx(primaryWide, "mt-1.5")}
        >
          {supplier || state === "affiliate" ? "Account maken en verder" : "Account maken en deelnemen"}
        </Button>
      </form>
      <p className="text-center text-sm text-ink-3">
        Heb je al een account? <TextLink to={paths.login}>Inloggen</TextLink>
      </p>
    </>
  )
}

function SignInState({ inv, role, until, onSignedIn }: {
  readonly inv: Invitation
  readonly role: string
  readonly until: string
  readonly onSignedIn: () => void
}) {
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | undefined>()
  const [busy, setBusy] = useState<"form" | "google" | null>(null)

  const run = async (kind: "form" | "google") => {
    setBusy(kind)
    await pause(kind === "google" ? 900 : 650)
    setBusy(null)
    onSignedIn()
  }

  return (
    <>
      <Heading title={`Inloggen om ${inv.workspace} te openen`}>
        <InviterLine inv={inv} until={until} />
      </Heading>
      <Message inv={inv} />
      <RoleCard inv={inv} role={role} />
      <GoogleButton loading={busy === "google"} disabled={busy === "form"} onClick={() => void run("google")} />
      <OrDivider label="of met je wachtwoord" />
      <form
        noValidate
        className="flex flex-col gap-3.5"
        onSubmit={(event) => {
          event.preventDefault()
          if (password.length < 8) {
            setError("Minimaal 8 tekens.")
            return
          }
          setError(undefined)
          void run("form")
        }}
      >
        <Field label="E-mailadres">
          {(control) => <Input {...control} readOnly value={inv.email ?? ""} className={TALL} />}
        </Field>
        <div className="flex flex-col gap-1.5">
          <Field label="Wachtwoord" error={error}>
            {(control) => (
              <PasswordInput {...control} autoComplete="current-password" value={password} onChange={setPassword} />
            )}
          </Field>
          <span className="self-end text-xs">
            <TextButton
              onClick={() =>
                toast({ title: `Resetlink verstuurd naar ${inv.email ?? ""}`, body: "De link is 30 minuten geldig." })}
            >
              Wachtwoord vergeten?
            </TextButton>
          </span>
        </div>
        <Button
          type="submit"
          variant="primary"
          loading={busy === "form"}
          disabled={busy === "google"}
          className={cx(primaryWide, "mt-1.5")}
        >
          Inloggen en accepteren
        </Button>
      </form>
    </>
  )
}

function SsoState({ inv, role, until, onContinue }: {
  readonly inv: Invitation
  readonly role: string
  readonly until: string
  readonly onContinue: () => void
}) {
  const [busy, setBusy] = useState(false)
  const domain = inv.email?.split("@")[1] ?? "je bedrijf"
  return (
    <>
      <Heading title={`Word lid van ${inv.workspace}`}>
        <InviterLine inv={inv} until={until} />
      </Heading>
      <RoleCard inv={inv} role={role} />
      <p className="flex gap-3 text-sm text-pretty text-ink-2">
        <ShieldCheck size={16} className="mt-0.5 shrink-0 text-ink-3" />
        <span>
          {inv.workspace} laat alleen inloggen toe via Google Workspace van{" "}
          <span className="font-medium text-ink">{domain}</span>. Een wachtwoord voor Insyte maak je dus niet aan.
        </span>
      </p>
      <GoogleButton
        label={busy ? "Doorsturen naar Google" : "Doorgaan met Google Workspace"}
        loading={busy}
        onClick={async () => {
          setBusy(true)
          await pause(1000)
          setBusy(false)
          onContinue()
        }}
      />
      <p className="text-center text-sm text-ink-3">
        Je logt in als {inv.email}. Een ander account van Google werkt hier niet.
      </p>
    </>
  )
}

/* ── joining: a face, and what you hear ────────────────────────────────────────────────────────── */

function PhotoStep({ name, photo, setPhoto, onNext, onBack }: {
  readonly name: string
  readonly photo: string | undefined
  readonly setPhoto: (next: string | undefined) => void
  readonly onNext: () => void
  readonly onBack: () => void
}) {
  const picker = useRef<HTMLInputElement>(null)
  return (
    <>
      <Heading title="Hoe je team je herkent">
        Je foto of je initialen staan bij alles wat je doet: tickets, reacties, wie wat heeft uitgevoerd.
      </Heading>
      <div className="flex items-center gap-4">
        {photo === undefined
          ? <Avatar name={name} size={64} />
          : <img src={photo} alt="Je profielfoto" className="size-16 shrink-0 rounded-full object-cover" />}
        <div className="flex min-w-0 flex-col gap-2">
          <span className="truncate text-md font-semibold text-ink">{name}</span>
          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" icon={<Image size={14} />} onClick={() => picker.current?.click()}>
              {photo === undefined ? "Foto uploaden" : "Andere foto"}
            </Button>
            {photo !== undefined && (
              <Button size="sm" variant="ghost" onClick={() => setPhoto(undefined)}>Initialen gebruiken</Button>
            )}
          </div>
          <input
            ref={picker}
            type="file"
            accept="image/*"
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file !== undefined) setPhoto(URL.createObjectURL(file))
              event.target.value = ""
            }}
          />
        </div>
      </div>
      <StepFoot onBack={onBack} onNext={onNext} label="Verder" skip={onNext} />
    </>
  )
}

function NotifyStep({ workspace, onDone, onBack }: {
  readonly workspace: string
  readonly onDone: (notify: { on: number; email: boolean }) => void
  readonly onBack: () => void
}) {
  const [on, setOn] = useState<Record<string, boolean>>(Object.fromEntries(NOTIFY.map((n) => [n.id, n.on])))
  const [where, setWhere] = useState<"app" | "email">("app")
  const [busy, setBusy] = useState(false)
  const count = Object.values(on).filter(Boolean).length
  return (
    <>
      <Heading title="Wat je wilt horen">
        Insyte meldt alleen wat jou aangaat. Je past dit later aan in je profiel.
      </Heading>
      <div className="flex flex-col">
        {NOTIFY.map((n) => (
          <ToggleRow
            key={n.id}
            title={n.label}
            detail={n.detail}
            on={on[n.id] === true}
            onChange={(next) => setOn({ ...on, [n.id]: next })}
          />
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-medium text-ink">Waar</span>
        <Segmented
          stretch
          label="Waar"
          value={where}
          onChange={setWhere}
          options={[{ value: "app", label: "In Insyte" }, { value: "email", label: "In Insyte en per e-mail" }]}
        />
      </div>
      <StepFoot
        onBack={onBack}
        busy={busy}
        label={`Naar ${workspace}`}
        onNext={async () => {
          setBusy(true)
          await pause(700)
          onDone({ on: count, email: where === "email" })
        }}
      />
    </>
  )
}

function StepFoot({ onBack, onNext, label, skip, busy = false }: {
  readonly onBack: () => void
  readonly onNext: () => void
  readonly label: string
  readonly skip?: () => void
  readonly busy?: boolean
}) {
  return (
    <footer className="mt-2 flex items-center justify-between gap-3">
      <Button variant="ghost" onClick={onBack} disabled={busy} className="-ml-2.5 pointer-coarse:min-h-11">
        Terug
      </Button>
      <div className="flex items-center gap-1">
        {skip !== undefined && (
          <Button variant="ghost" onClick={skip} className="pointer-coarse:min-h-11">Overslaan</Button>
        )}
        <Button variant="primary" onClick={onNext} loading={busy} className={TALL}>
          {label}
          {!busy && <ArrowRight size={16} />}
        </Button>
      </div>
    </footer>
  )
}
