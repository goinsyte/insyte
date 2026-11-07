import { useContext, useEffect, useState } from "react"
import { toast } from "sonner"
import { appHref, siteHref } from "../../data-source/hrefs"
import { Store, TrendingUp, Truck } from "../../icons"
import { HumanCheck } from "../auth/human-check"
import { Field, TextField } from "../common/form-dialog"
import { authClient } from "../lib/auth-client"
import { persistStep } from "../lib/onboarding-api"
import { GoogleButton, OAuthDivider } from "./oauth-buttons"
import { OnboardingBackContext, type StepDef } from "./onboarding-shell"
import { SelectionGroup, SelectionTile } from "./selection-tile"
import type { OnboardingData, OnboardingPersona } from "./use-onboarding-state"

/* ─────────────────────────────────────────────────────────────────────
   Shared head of the onboarding flow.

   Before the role picker, every visitor goes through the same three
   steps: account creation, email verification, then role choice. The
   per-persona builders pick up from step 4.

   Lives in its own module so each persona builder can compose with a
   single import.
   ───────────────────────────────────────────────────────────────────── */

type Args = {
  data: OnboardingData
  patch: (p: OnboardingData) => void
  next: () => void
  setPersona: (p: OnboardingPersona) => void
}

const ROLE_OPTIONS: Array<{
  id: OnboardingPersona
  label: string
  hint: string
  meta: string
  icon: typeof Store
}> = [
  {
    id: "admin",
    label: "Mijn winkel inrichten",
    hint: "Shopify, je team en je wachtrij, alles op één plek.",
    meta: "nog ~7 min · 6 stappen",
    icon: Store
  },
  {
    id: "supplier",
    label: "Ik ben leverancier",
    hint: "Toon je actuele voorraad, accepteer bestellingen en word netjes uitbetaald.",
    meta: "nog ~3 min · 3 stappen",
    icon: Truck
  },
  {
    id: "affiliate",
    label: "Aanmelden als affiliate",
    hint: "Stuur je publiek hierheen. Verdien als ze kopen.",
    meta: "nog ~2 min · 2 stappen",
    icon: TrendingUp
  }
]

export function sharedHeadSteps({
  data,
  patch,
  next,
  setPersona
}: Args): StepDef[] {
  const d = data as Record<string, string | undefined>

  return [
    {
      id: "account",
      title: "Maak je account aan.",
      subtitle: "Eén login voor elke rol in Insyte. Zo meteen kies je wat bij je past.",
      canContinue: true,
      busyLabel: "Account wordt aangemaakt",
      onPrimary: async () => {
        const { error } = await authClient.signUp.email({
          email: d.email ?? "",
          password: d.password ?? "",
          name: d.name ?? "",
          callbackURL: verifiedLanding(),
          turnstileToken: d.turnstile || undefined
        })
        if (error) {
          // The token is spent either way; the widget fetches the next one for the retry.
          patch({ turnstileAttempt: String(Number(d.turnstileAttempt ?? 0) + 1) })
          // Thrown → the shell shows it inline beneath the fields.
          throw new Error(error.message ?? "Je account kon niet worden aangemaakt.")
        }
        persistStep("account", { email: d.email, name: d.name })
        next()
      },
      content: (
        <>
          <div className="flex flex-col gap-2">
            <GoogleButton
              onClick={() => {
                // Real Google OAuth. Google accounts come verified, so the
                // flow resumes past account/verify at the organization step.
                // Absolute URL to the web origin — a relative callbackURL
                // resolves against the API server (:3000), not the app.
                void authClient.signIn.social({
                  provider: "google",
                  callbackURL: `${window.location.origin}${appHref("/onboarding")}`
                })
              }}
            />
          </div>
          <OAuthDivider label="of met e-mail" />
          <Field label="Zakelijk e-mailadres">
            <TextField
              value={(d.email as string) ?? ""}
              onChange={(v) => patch({ email: v })}
              placeholder="founder@allure.co"
              type="email"
            />
          </Field>
          <Field label="Volledige naam">
            <TextField
              value={(d.name as string) ?? ""}
              onChange={(v) => patch({ name: v })}
              placeholder="Elena Hart"
            />
          </Field>
          <Field label="Wachtwoord" hint="Minimaal 8 tekens.">
            <TextField
              value={(d.password as string) ?? ""}
              onChange={(v) => patch({ password: v })}
              placeholder="••••••••"
              type="password"
            />
          </Field>
          <HumanCheck
            onToken={(token) => patch({ turnstile: token ?? "" })}
            attempt={Number(d.turnstileAttempt ?? 0)}
          />
          <p className="text-xs text-ink-3 leading-normal">
            Door verder te gaan ga je akkoord met onze{" "}
            <a
              className="text-ink-3 underline hover:text-ink"
              href={siteHref("/voorwaarden")}
            >
              voorwaarden
            </a>{" "}
            en de{" "}
            <a className="text-ink-3 underline hover:text-ink" href={siteHref("/privacy")}>
              privacyverklaring
            </a>
            .
          </p>
        </>
      )
    },
    {
      id: "verify",
      title: "Check je inbox.",
      subtitle: `We hebben een inloglink gestuurd naar ${
        d.email ?? "je zakelijke e-mailadres"
      }. Tik erop en kom dan terug.`,
      canContinue: true,
      primaryLabel: "Ik heb op de link geklikt",
      busyLabel: "Controleren",
      onPrimary: async () => {
        // The link signs the person in where it is opened, so this tab sees the session once they have clicked it.
        const { data: signedIn } = await authClient.getSession()
        if (signedIn?.user.emailVerified !== true) {
          throw new Error("Je e-mailadres is nog niet bevestigd. Klik op de link in de mail en kom dan terug.")
        }
        persistStep("verify")
        next()
      },
      content: <VerifyActions email={d.email ?? ""} />
    },
    {
      id: "role",
      title: "Aan welke kant van de bestelling sta jij?",
      subtitle: "Kies wat je werk nu het best beschrijft. Je kunt later wisselen via de instellingen.",
      canContinue: false,
      hidePrimary: true,
      onPrimary: next,
      content: (
        <SelectionGroup
          mode="single"
          value={null}
          onChange={(v) => {
            setPersona(v as OnboardingPersona)
          }}
          columns={1}
          label="Rol"
        >
          {ROLE_OPTIONS.map((o) => (
            <SelectionTile
              key={o.id}
              id={o.id}
              icon={o.icon}
              label={o.label}
              hint={o.hint}
              meta={
                <span className="text-xs text-ink-3 tabular-nums">
                  {o.meta}
                </span>
              }
            />
          ))}
        </SelectionGroup>
      )
    }
  ]
}

export const SHARED_HEAD_LENGTH = 3

/** Where the verification link lands, signed in: the role step (`?step=2`). A function: hrefs are configured at boot. */
const verifiedLanding = () => appHref("/onboarding?step=2")

const RESEND_COOLDOWN_S = 30

/* Resend waits 30 seconds between sends, so a second tap cannot pile up emails; Wrong address?
   is the shell's Back, which lands on the account step with the email still filled in. */
function VerifyActions({ email }: { readonly email: string }) {
  const back = useContext(OnboardingBackContext)
  const [sentAt, setSentAt] = useState<Date | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const left = sentAt
    ? Math.max(0, RESEND_COOLDOWN_S - Math.floor((now - sentAt.getTime()) / 1000))
    : 0

  useEffect(() => {
    if (!left) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [left])

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-4 text-sm">
        <button
          type="button"
          disabled={left > 0}
          onClick={async () => {
            const at = new Date()
            setSentAt(at)
            setNow(at.getTime())
            const { error } = await authClient.sendVerificationEmail({ email, callbackURL: verifiedLanding() })
            if (error) toast.error(error.message ?? "De mail kon niet opnieuw worden verstuurd.")
            else toast.success("Verificatiemail opnieuw verstuurd")
          }}
          className="font-medium text-arc-ink transition-colors hover:text-ink disabled:pointer-events-none disabled:text-ink-3"
        >
          {left > 0 ?
            (
              <>
                Opnieuw sturen over <span className="tabular-nums">{left} s</span>
              </>
            ) :
            (
              "E-mail opnieuw sturen"
            )}
        </button>
        <span className="text-ink-3">·</span>
        <button
          type="button"
          onClick={back}
          className="font-medium text-ink-3 transition-colors hover:text-ink"
        >
          Verkeerd adres?
        </button>
      </div>
      {sentAt ?
        (
          <p className="text-xs text-ink-3 leading-normal">
            Opnieuw verstuurd om{" "}
            <span className="tabular-nums">
              {sentAt.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" })}
            </span>
          </p>
        ) :
        null}
    </div>
  )
}
