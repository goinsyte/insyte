import { useState } from "react"
import { AUTH_ERRORS, DEMO_REFUSALS, LOGIN_LINE, SIGNED_IN_AS } from "../../fixtures/auth.ts"
import { navigate, paths } from "../../router.tsx"
import { Button } from "../../ui/button.tsx"
import { Checkbox } from "../../ui/checkbox.tsx"
import { cx } from "../../ui/cx.ts"
import { Dialog } from "../../ui/dialog.tsx"
import { Mail } from "../../ui/icons.tsx"
import { Field, FieldLabel, Input } from "../../ui/input.tsx"
import { toast } from "../../ui/toast.tsx"
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
  primaryWide,
  TALL,
  TextButton,
  TextLink
} from "./frame.tsx"

/*
 * Signing in (`/app/login`): Google, or the work address and the password, with "Vergeten?" opening
 * the reset request in place. The demo takes any well-formed address and password and goes on to
 * the second step, as an account with two-factor on does; the password "fout" shows the refusal,
 * which never says whether the address exists.
 */
export function LoginScreen() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({})
  const [refused, setRefused] = useState<string | null>(null)
  const [busy, setBusy] = useState<"form" | "google" | null>(null)
  const [resetOpen, setResetOpen] = useState(false)

  const submit = async () => {
    const next = {
      email: isEmail(email) ? undefined : "Vul een geldig e-mailadres in.",
      password: password === "" ? "Vul je wachtwoord in." : undefined
    }
    setErrors(next)
    setRefused(null)
    if (next.email !== undefined || next.password !== undefined) return
    setBusy("form")
    await pause()
    setBusy(null)
    if (password === DEMO_REFUSALS.wrongPassword) {
      setRefused(AUTH_ERRORS.invalidLogin)
      return
    }
    navigate(paths.twoFactor)
  }

  const google = async () => {
    setBusy("google")
    await pause(900)
    setBusy(null)
    toast({ title: `Welkom terug, ${SIGNED_IN_AS.name.split(" ")[0]}`, tone: "good" })
    navigate(paths.home)
  }

  return (
    <AuthFrame line={LOGIN_LINE}>
      <FormColumn>
        <Heading title="Inloggen">Welkom terug. Ga verder waar je gebleven was.</Heading>
        <GoogleButton onClick={() => void google()} loading={busy === "google"} disabled={busy === "form"} />
        <OrDivider label="of met e-mail" />
        <form
          noValidate
          className="flex flex-col gap-3.5"
          onSubmit={(event) => {
            event.preventDefault()
            void submit()
          }}
        >
          <Field label="Zakelijk e-mailadres" error={errors.email}>
            {(control) => (
              <Input
                {...control}
                type="email"
                autoComplete="email"
                placeholder="naam@northwind.co"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className={TALL}
              />
            )}
          </Field>
          <div className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between">
              <FieldLabel htmlFor="login-password">Wachtwoord</FieldLabel>
              <span className="text-xs">
                <TextButton onClick={() => setResetOpen(true)}>Vergeten?</TextButton>
              </span>
            </div>
            <PasswordInput
              id="login-password"
              autoComplete="current-password"
              value={password}
              onChange={setPassword}
              aria-invalid={errors.password === undefined ? undefined : true}
              aria-describedby={errors.password === undefined ? undefined : "login-password-error"}
            />
            {errors.password !== undefined && (
              <p id="login-password-error" className="text-xs text-bad-ink">{errors.password}</p>
            )}
          </div>
          {refused !== null && <FormError>{refused}</FormError>}
          <Button
            type="submit"
            variant="primary"
            loading={busy === "form"}
            disabled={busy === "google"}
            className={cx(primaryWide, "mt-1.5")}
          >
            Inloggen
          </Button>
        </form>
        <div className="flex flex-col gap-1 text-center text-sm text-ink-3">
          <p>
            Nieuw bij Insyte? <TextLink to={paths.register}>Account aanmaken</TextLink>
          </p>
          <p className="text-xs">Insyte is in private bèta en werkt op uitnodiging.</p>
        </div>
        <DemoHint>
          In de demo werkt elk wachtwoord. Met het wachtwoord “{DEMO_REFUSALS.wrongPassword}” zie je de foutmelding.
        </DemoHint>
      </FormColumn>
      <ResetRequest open={resetOpen} onClose={() => setResetOpen(false)} initialEmail={email} />
    </AuthFrame>
  )
}

/** How to see the refusals in the demo, at the foot of the column. The design reference only. */
export function DemoHint({ children }: { readonly children: string | ReadonlyArray<string> }) {
  return <p className="mt-auto pt-6 text-center text-2xs text-pretty text-ink-3">{children}</p>
}

/**
 * The reset request, from "Vergeten?": the address, then "Check je inbox" in words that hold whether
 * or not the address has an account. The demo opens the mailed link from there.
 */
function ResetRequest({ open, onClose, initialEmail }: {
  readonly open: boolean
  readonly onClose: () => void
  readonly initialEmail: string
}) {
  return (
    <Dialog open={open} onClose={onClose} title="Wachtwoord opnieuw instellen" size="sm">
      {open && <ResetRequestBody key={initialEmail} initialEmail={initialEmail} onClose={onClose} />}
    </Dialog>
  )
}

function ResetRequestBody({ initialEmail, onClose }: { readonly initialEmail: string; readonly onClose: () => void }) {
  const [email, setEmail] = useState(initialEmail)
  const [error, setError] = useState<string | undefined>()
  const [state, setState] = useState<"form" | "sending" | "sent">("form")

  const send = async () => {
    if (!isEmail(email)) {
      setError("Vul een geldig e-mailadres in.")
      return
    }
    setError(undefined)
    setState("sending")
    await pause()
    setState("sent")
  }

  if (state === "sent") {
    return (
      <div className="flex flex-col gap-4">
        <span className="inline-flex size-10 items-center justify-center rounded-full bg-well text-ink-2">
          <Mail size={18} />
        </span>
        <div className="flex flex-col gap-1">
          <p className="text-md font-semibold text-ink">Check je inbox</p>
          <p className="text-sm text-pretty text-ink-2">
            Als <span className="font-medium text-ink">{email.trim()}</span>{" "}
            bij ons bekend is, ontvang je een resetlink. De link is 30 minuten geldig.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button variant="ghost" onClick={() => setState("form")}>Ander e-mailadres gebruiken</Button>
          <Button variant="secondary" onClick={() => navigate(paths.resetPassword)}>Link uit de mail openen</Button>
          <Button variant="primary" onClick={onClose}>Klaar</Button>
        </div>
      </div>
    )
  }

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        void send()
      }}
    >
      <p className="text-sm text-ink-2">We mailen je een link om een nieuw wachtwoord te kiezen.</p>
      <Field label="Zakelijk e-mailadres" error={error}>
        {(control) => (
          <Input
            {...control}
            type="email"
            autoComplete="email"
            placeholder="naam@northwind.co"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className={TALL}
          />
        )}
      </Field>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>Annuleren</Button>
        <Button type="submit" variant="primary" loading={state === "sending"}>Resetlink versturen</Button>
      </div>
    </form>
  )
}

/*
 * The second step (`/app/login/two-factor`): the six digits from the authenticator app, or a backup
 * code, each of which works once, and "Dit apparaat 30 dagen onthouden". The demo takes any six
 * digits; 000000 shows the refusal.
 */
export function TwoFactorScreen() {
  const [mode, setMode] = useState<"totp" | "backup">("totp")
  const [code, setCode] = useState("")
  const [trust, setTrust] = useState(false)
  const [error, setError] = useState<string | undefined>()
  const [refused, setRefused] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const switchMode = () => {
    setMode(mode === "totp" ? "backup" : "totp")
    setCode("")
    setError(undefined)
    setRefused(null)
  }

  const submit = async () => {
    const value = code.trim()
    const invalid = mode === "totp"
      ? (/^\d{6}$/.test(value) ? undefined : "Vul de zes cijfers uit je app in.")
      : (value === "" ? "Vul een back-upcode in." : undefined)
    setError(invalid)
    setRefused(null)
    if (invalid !== undefined) return
    setBusy(true)
    await pause()
    setBusy(false)
    if (mode === "totp" && value === DEMO_REFUSALS.wrongCode) {
      setRefused(AUTH_ERRORS.invalidCode)
      return
    }
    if (mode === "backup" && !/^[a-z0-9]{5}-[a-z0-9]{5}$/i.test(value)) {
      setRefused(AUTH_ERRORS.invalidBackup)
      return
    }
    toast({
      title: `Welkom terug, ${SIGNED_IN_AS.name.split(" ")[0]}`,
      body: trust ? "Dit apparaat vraagt 30 dagen niet om een code." : undefined,
      tone: "good"
    })
    navigate(paths.home)
  }

  return (
    <AuthFrame line={LOGIN_LINE}>
      <FormColumn stepKey={mode}>
        <Heading title="Tweestapsverificatie">
          {mode === "totp"
            ? "Vul de code van zes cijfers uit je authenticator-app in."
            : "Vul een van je back-upcodes in. Elke code werkt één keer."}
        </Heading>
        <form
          noValidate
          className="flex flex-col gap-3.5"
          onSubmit={(event) => {
            event.preventDefault()
            void submit()
          }}
        >
          <Field label={mode === "totp" ? "Code" : "Back-upcode"} error={error}>
            {(control) => (
              <Input
                {...control}
                // biome-ignore lint/a11y/noAutofocus: the one field on the page, reached from the step before.
                autoFocus
                value={code}
                onChange={(event) => setCode(event.target.value)}
                {...(mode === "totp"
                  ? {
                    inputMode: "numeric" as const,
                    autoComplete: "one-time-code",
                    maxLength: 6,
                    placeholder: "123456"
                  }
                  : { autoComplete: "off", placeholder: "abcde-fghij" })}
                className={cx(TALL, "figure", mode === "totp" && "text-md")}
              />
            )}
          </Field>
          <Checkbox checked={trust} onChange={setTrust} label="Dit apparaat 30 dagen onthouden" />
          {refused !== null && <FormError>{refused}</FormError>}
          <Button type="submit" variant="primary" loading={busy} className={cx(primaryWide, "mt-1.5")}>
            Bevestigen
          </Button>
        </form>
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <TextButton onClick={switchMode}>
            {mode === "totp" ? "Een back-upcode gebruiken" : "De code uit je app gebruiken"}
          </TextButton>
          <TextLink to={paths.login}>Opnieuw inloggen</TextLink>
        </div>
        <DemoHint>
          {mode === "totp"
            ? `In de demo werkt elke code van zes cijfers. Met ${DEMO_REFUSALS.wrongCode} zie je de foutmelding.`
            : "In de demo werkt elke code in de vorm abcde-12345."}
        </DemoHint>
      </FormColumn>
    </AuthFrame>
  )
}
