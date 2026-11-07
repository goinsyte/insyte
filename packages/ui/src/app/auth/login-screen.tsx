import { useForm } from "@tanstack/react-form"
import { getRouteApi, Link, useNavigate } from "@tanstack/react-router"
import { motion } from "motion/react"
import { useEffect, useState } from "react"
import { z } from "zod"
import { InsyteMark } from "../../brand/mark"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "../../components/dialog"
import { appHref } from "../../data-source/hrefs"
import { Eye, EyeOff, Loader, Mail } from "../../icons"
import { ContactEmail } from "../../lib/contact-email"
import { FormError } from "../common/form-error"
import { authClient } from "../lib/auth-client"
import { applyServerError, serverFormMessage } from "../lib/form-errors"
import { GoogleButton, OAuthDivider } from "../onboarding/oauth-buttons"
import { createHumanCheck, HumanCheck } from "./human-check"

const Route = getRouteApi("/login")

export function LoginPage() {
  const navigate = useNavigate()
  const { redirect } = Route.useSearch()
  const dest = redirect ?? "/dashboard"
  const [show, setShow] = useState(false)
  const [resetOpen, setResetOpen] = useState(false)
  // The human check joins the form once the server asks for it (a warm address or IP); each try spends its token.
  const [humanAsked, setHumanAsked] = useState(false)
  const [human] = useState(createHumanCheck)

  const form = useForm({
    defaultValues: { email: "", password: "" },
    validators: {
      onSubmit: z.object({
        email: z.email("Vul een geldig e-mailadres in."),
        // The length rule is registration's and reset's; signing in only needs a password (05 §3.1).
        password: z.string().min(1, "Vul je wachtwoord in.")
      })
    },
    onSubmit: async ({ value, formApi }) => {
      const attemptSignIn = (turnstileToken: string | undefined) =>
        authClient.signIn.email({ email: value.email, password: value.password, turnstileToken })
      let { error } = await attemptSignIn(humanAsked ? await human.token() : undefined)
      if (humanAsked) human.spent()
      // Asked for the first time: show the check, wait for its token, and send once more, without a second click.
      if (error?.code === "TURNSTILE_REQUIRED" && !humanAsked) {
        setHumanAsked(true)
        ;({ error } = await attemptSignIn(await human.token()))
        human.spent()
      }
      if (error) {
        applyServerError(
          formApi,
          error,
          "Inloggen mislukt. Controleer je gegevens."
        )
        return
      }
      navigate({ to: dest, search: {} as never })
    }
  })

  function ssoIn() {
    // Absolute URL to the web origin — a relative callbackURL resolves
    // against the API server (:3000), not the app.
    authClient.signIn.social({
      provider: "google",
      callbackURL: `${window.location.origin}${appHref(dest)}`
    })
  }

  return (
    <div className="grid min-h-svh grid-rows-[44vh_1fr] bg-background lg:grid-cols-2 lg:grid-rows-1">
      <BrandHalf />

      <main className="flex flex-col items-center justify-center px-6 py-10 sm:px-10 lg:px-16">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          className="flex w-full max-w-[400px] flex-col gap-5"
        >
          <header className="mb-1 flex flex-col gap-1.5">
            <h2 className="font-medium text-[24px] text-ink leading-[1.15] tracking-[-0.6px]">
              Inloggen
            </h2>
            <p className="text-[13px] text-ink-3 leading-[1.5]">
              Welkom terug. Ga verder waar je gebleven was.
            </p>
          </header>

          <div className="flex flex-col gap-2.5">
            <GoogleButton onClick={ssoIn} />
          </div>

          <OAuthDivider label="of met e-mail" />

          <form
            onSubmit={(e) => {
              e.preventDefault()
              e.stopPropagation()
              form.handleSubmit()
            }}
            className="flex flex-col gap-3"
          >
            <form.Field name="email">
              {(field) => (
                <Field label="Zakelijk e-mailadres">
                  <input
                    type="email"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                    autoComplete="email"
                    className={INPUT_CLASS}
                    placeholder="naam@northwind.co"
                  />
                  <FieldError errors={field.state.meta.errors} />
                </Field>
              )}
            </form.Field>

            <form.Field name="password">
              {(field) => (
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-baseline justify-between">
                    <label
                      htmlFor="login-password"
                      className="font-medium text-[12px] text-ink-3 leading-none tracking-[-0.05px]"
                    >
                      Wachtwoord
                    </label>
                    <button
                      type="button"
                      onClick={() => setResetOpen(true)}
                      className="font-medium text-[12px] text-arc-ink leading-none transition-colors hover:text-ink"
                    >
                      Vergeten?
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      id="login-password"
                      type={show ? "text" : "password"}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                      autoComplete="current-password"
                      className={`${INPUT_CLASS} pr-11`}
                      placeholder="••••••••"
                    />
                    <button
                      type="button"
                      aria-label={show ? "Wachtwoord verbergen" : "Wachtwoord tonen"}
                      onClick={() => setShow((s) => !s)}
                      className="absolute top-1/2 right-1.5 flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-ink-3 transition-colors hover:bg-mist hover:text-ink"
                    >
                      {show ?
                        <EyeOff className="size-4" strokeWidth={1.75} /> :
                        <Eye className="size-4" strokeWidth={1.75} />}
                    </button>
                  </div>
                  <FieldError errors={field.state.meta.errors} />
                </div>
              )}
            </form.Field>

            {humanAsked ? <HumanCheck controller={human} /> : null}

            <form.Subscribe selector={(s) => s.errorMap.onServer}>
              {(onServer) => <FormError message={serverFormMessage(onServer)} />}
            </form.Subscribe>

            <form.Subscribe
              selector={(s) => ({
                canSubmit: s.canSubmit,
                isSubmitting: s.isSubmitting
              })}
            >
              {({ canSubmit, isSubmitting }) => (
                <button
                  type="submit"
                  disabled={!canSubmit || isSubmitting}
                  className="mt-2 flex h-11 items-center justify-center rounded-lg bg-abyss px-4 font-medium text-[14px] text-mesh-ink leading-none tracking-[-0.1px] shadow-primary transition-colors hover:bg-abyss-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {isSubmitting ? <Loader className="size-4 animate-spin" strokeWidth={2} /> : (
                    "Inloggen"
                  )}
                </button>
              )}
            </form.Subscribe>
          </form>

          <p className="mt-1 text-center text-[13px] text-ink-3 leading-[1.4]">
            Nieuw bij Insyte?{" "}
            <Link
              to="/register"
              className="font-medium text-arc-ink transition-colors hover:text-ink"
            >
              Account aanmaken
            </Link>
          </p>
        </motion.div>
      </main>

      <ResetPasswordDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        initialEmail={form.getFieldValue("email")}
      />
    </div>
  )
}

/* --------------------------------- RESET PASSWORD --------------------------------- */

/* Mails a link to `/reset-password`; the installed client decides whether anything is really sent. */
function ResetPasswordDialog({
  open,
  onOpenChange,
  initialEmail
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  initialEmail: string
}) {
  const [email, setEmail] = useState("")
  const [state, setState] = useState<"form" | "sending" | "sent">("form")
  const [error, setError] = useState<string | null>(null)
  const [human] = useState(createHumanCheck)

  // Each opening starts fresh, from whatever is already in the sign-in email field.
  // biome-ignore lint/correctness/useExhaustiveDependencies: refill only when the dialog opens.
  useEffect(() => {
    if (!open) return
    setEmail(initialEmail)
    setState("form")
    setError(null)
  }, [open])

  async function send() {
    if (!z.email().safeParse(email.trim()).success) {
      setError("Vul een geldig e-mailadres in.")
      return
    }
    setError(null)
    setState("sending")
    // The answer is the same whether or not the address has an account, so "sent" says nothing about which.
    const { error: failed } = await authClient.requestPasswordReset({
      email: email.trim(),
      redirectTo: appHref("/reset-password"),
      turnstileToken: await human.token()
    })
    human.spent()
    if (failed) {
      setError(failed.message ?? "De resetlink kon niet worden verstuurd. Probeer het opnieuw.")
      setState("form")
      return
    }
    setState("sent")
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        {state === "sent" ?
          (
            <>
              <DialogHeader>
                <span className="mb-2 flex size-10 items-center justify-center rounded-lg bg-mist text-ink-2">
                  <Mail className="size-4" strokeWidth={1.75} />
                </span>
                <DialogTitle>Check je inbox</DialogTitle>
                {/* Worded so it holds whether or not the address has an account: the dialog never says which (M2.3). */}
                <DialogDescription>
                  Als <span className="font-medium text-ink">{email.trim()}</span>{" "}
                  bij ons bekend is, ontvang je een resetlink. De link is 30 minuten geldig.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <button
                  type="button"
                  onClick={() => setState("form")}
                  className="flex h-9 items-center rounded-lg px-3.5 font-medium text-sm text-ink-2 transition-colors hover:bg-ink/6 hover:text-ink"
                >
                  Ander e-mailadres gebruiken
                </button>
                <button type="button" onClick={() => onOpenChange(false)} className={PRIMARY_SM}>
                  Klaar
                </button>
              </DialogFooter>
            </>
          ) :
          (
            <form
              className="grid gap-4"
              onSubmit={(e) => {
                e.preventDefault()
                void send()
              }}
            >
              <DialogHeader>
                <DialogTitle>Wachtwoord opnieuw instellen</DialogTitle>
                <DialogDescription>We mailen je een link om een nieuw wachtwoord te kiezen.</DialogDescription>
              </DialogHeader>
              <Field label="Zakelijk e-mailadres">
                <input
                  type="email"
                  autoFocus
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  className="field h-11 w-full rounded-lg px-3.5 text-[14px] text-ink leading-none outline-none placeholder:text-ink-3 focus-visible:ring-focus"
                  placeholder="naam@northwind.co"
                />
                <FieldError errors={[error ? { message: error } : undefined]} />
              </Field>
              <HumanCheck controller={human} />
              <DialogFooter>
                <button
                  type="button"
                  onClick={() => onOpenChange(false)}
                  className="flex h-9 items-center rounded-lg px-3.5 font-medium text-sm text-ink-2 transition-colors hover:bg-ink/6 hover:text-ink"
                >
                  Annuleren
                </button>
                <button type="submit" disabled={state === "sending"} className={PRIMARY_SM}>
                  {state === "sending" ? <Loader className="size-4 animate-spin" strokeWidth={2} /> : (
                    "Resetlink versturen"
                  )}
                </button>
              </DialogFooter>
            </form>
          )}
      </DialogContent>
    </Dialog>
  )
}

const PRIMARY_SM =
  "flex h-9 min-w-[88px] items-center justify-center rounded-lg bg-abyss px-3.5 font-medium text-sm text-mesh-ink shadow-primary transition-colors hover:bg-abyss-2 disabled:opacity-70"

/* --------------------------------- BRAND HALF --------------------------------- */

export function BrandHalf() {
  return (
    <aside className="relative isolate flex flex-col overflow-hidden bg-stripe-mesh-dark px-6 py-8 text-mesh-ink sm:px-10 sm:py-10 lg:px-12 lg:py-12 xl:px-16">
      <MeshAtmosphere />

      {/* Top: mark + wordmark. */}
      <div className="relative z-10 flex items-center gap-2.5">
        <InsyteMark size={22} tone="white" />
        <span className="font-medium text-[18px] tracking-tight">
          insyte
        </span>
      </div>

      {/* Middle: the editorial line. */}
      <div className="relative z-10 my-auto flex flex-col gap-5 py-6 sm:gap-7 sm:py-8">
        <motion.h1
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="font-medium text-[36px] leading-[1.05] tracking-[-1.2px] sm:text-[44px] sm:leading-[1.04] sm:tracking-[-1.6px] lg:text-[56px] lg:leading-[1.02] lg:tracking-[-2px]"
        >
          Standaard stil.
          <br />
          <span className="text-arc-ink">Luid</span> als het ertoe doet.
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: 0.6,
            delay: 0.08,
            ease: [0.22, 1, 0.36, 1]
          }}
          className="hidden max-w-[42ch] text-[15px] text-mesh-ink/75 leading-[1.55] sm:block"
        >
          Het besturingssysteem voor dropshippers. Bestellingen, klantenservice, leveranciers, chargebacks en
          automatiseringen in één commandocentrum.
        </motion.p>
      </div>

      {/* Bottom: support, desktop only (mobile cuts it for vertical density). */}
      <div className="relative z-10 hidden items-center text-[12px] leading-[1.4] lg:flex">
        <ContactEmail
          name="support"
          className="font-medium text-mesh-ink/70 transition-colors hover:text-mesh-ink"
        />
      </div>
    </aside>
  )
}

/* --------------------------------- MESH ATMOSPHERE --------------------------------- */

function MeshAtmosphere() {
  return (
    <>
      <div
        className="glow-orb glow-orb--arc anim-orb-drift"
        style={{
          width: 720,
          height: 720,
          top: -240,
          left: -200,
          opacity: 0.9
        }}
        aria-hidden
      />
      <div
        className="glow-orb glow-orb--sky anim-orb-drift-slow"
        style={{
          width: 560,
          height: 560,
          bottom: -200,
          right: -160,
          opacity: 0.7
        }}
        aria-hidden
      />
      <div
        className="glow-orb glow-orb--mint anim-orb-drift"
        style={{
          width: 380,
          height: 380,
          top: "55%",
          left: "38%",
          opacity: 0.4
        }}
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 bg-dot-grid opacity-40"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 bg-vignette"
        aria-hidden
      />
    </>
  )
}

/* --------------------------------- BITS --------------------------------- */

export const INPUT_CLASS =
  "h-11 w-full rounded-lg bg-paper px-3.5 text-[14px] leading-none text-ink placeholder:text-ink-3 outline-none transition-shadow " +
  "focus-visible:ring-focus"

export function FieldError({
  errors
}: {
  errors: ReadonlyArray<{ message?: string } | undefined>
}) {
  const message = errors[0]?.message
  if (!message) return null
  return (
    <p className="pl-0.5 tabular-nums text-[11.5px] text-red-600 leading-[1.4]">
      {message}
    </p>
  )
}

export function Field({
  label,
  children
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: the input is provided via children and implicitly associated
    <label className="flex flex-col gap-1.5">
      <span className="font-medium text-[12px] text-ink-3 leading-none tracking-[-0.05px]">
        {label}
      </span>
      {children}
    </label>
  )
}
