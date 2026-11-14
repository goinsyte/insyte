import { useAtomRefresh, useAtomSet } from "@effect/atom-react"
import type { AreaId, Level, SpecialId } from "@insyte/domain/Permissions"
import type { Landing } from "@insyte/modules/members/domain/Landing"
import { createHumanCheck } from "@insyte/ui/app/auth/human-check"
import type { InvitationSource } from "@insyte/ui/app/auth/invitation-source"
import { authClient } from "@insyte/ui/app/lib/auth-client"
import type { Landing as LandingView } from "@insyte/ui/app/lib/invitation-types"
import { describe } from "@insyte/ui/app/lib/permissions"
import { useNavigate } from "@tanstack/react-router"
import { Exit } from "effect"
import { toast } from "sonner"
import { landingAtom, landingKey, landingWrites } from "../data/landing.ts"

/*
 * The invitation landing's source in the console: `Landing.resolve` as the page draws it, accounts through
 * better-auth (an invitation's proof travels with the sign-up, so the address needs no confirming; the shareable link's
 * does), and joining through `Landing.accept`. A sign-in that leaves for Google or the second factor comes back here
 * with `accept=1`, and the route accepts then. What the console cannot keep yet (the photo, the notification choices)
 * is asked as the reference asks it and not stored until Profile and notifications exist.
 */

/** One human check for the landing's forms, as onboarding keeps one for its account step. */
const human = createHumanCheck()

/** A full-page handoff is underway: nothing more happens on this page. */
const leaving = () => new Promise<never>(() => {})

const asView = (l: Landing): LandingView => {
  const supplier = l.supplier ?? null
  return {
    id: "",
    // A supplier's person makes their account as the supplier's (M16): the landing's own state for it.
    state: supplier !== null && l.state === "new" ? "supplier" : l.state,
    ...(supplier === null ? {} : { company: supplier, scopes: [...(l.scopes ?? ["orders"])] }),
    workspace: l.workspace ?? "",
    inviter: { id: "", name: l.inviter?.name ?? "", role: l.inviter?.role ?? "" },
    ...(l.email === null ? {} : { email: l.email }),
    ...(l.name === null ? {} : { name: l.name }),
    ...(l.role === null ? {} : { roleId: l.role.id }),
    stores: l.stores === "all" ? "all" : [...l.stores],
    ...(l.message === null ? {} : { message: l.message }),
    ...(l.at === null ? {} : { at: l.at })
  }
}

export function useConsoleInvitationSource(
  landing: Landing,
  ref: { id: string; k: string | undefined }
): InvitationSource {
  const navigate = useNavigate()
  const key = landingKey(ref.id, ref.k)
  const refresh = useAtomRefresh(landingAtom(key))
  const accept = useAtomSet(landingWrites.accept, { mode: "promiseExit" })
  const requestNew = useAtomSet(landingWrites.requestNew, { mode: "promiseExit" })
  const requestSeat = useAtomSet(landingWrites.requestSeat, { mode: "promiseExit" })
  const link = ref.id.startsWith("link_")
  const payload = ref.k === undefined ? { id: ref.id } : { id: ref.id, k: ref.k }
  const keys = { reactivityKeys: [`landing:${key}`] }
  // Where a round trip (Google, the second factor, the confirmation mail) lands, ready to accept.
  const back = () => {
    const query = new URLSearchParams({ ...(ref.k === undefined ? {} : { k: ref.k }), accept: "1" })
    return `/invitations/${ref.id}?${query.toString()}`
  }
  const role = landing.role
  const view = { ...asView(landing), id: ref.id }

  return {
    inv: view,
    role: role?.label ?? "",
    abilities: role === null ? [] : describe({
      id: role.id,
      levels: role.levels as Record<AreaId, Level>,
      specials: role.specials as Record<SpecialId, boolean>,
      refundLimit: role.refundLimit,
      stores: "all"
    }, []),
    // Stores arrive with Shopify (M6): until then everyone works in every store.
    storesLabel: "Alle winkels",
    seatsTotal: landing.seats ?? 0,
    signedInAs: landing.signedInAs === null ? null : { name: "", email: landing.signedInAs },
    human,

    createAccount: async ({ name, email, password }) => {
      const turnstileToken = await human.token()
      const { error } = await authClient.signUp.email({
        email: link ? email : (landing.email ?? email),
        password,
        name,
        callbackURL: `${window.location.origin}${back()}`,
        turnstileToken,
        ...(link || ref.k === undefined ? {} : { invitation: `${ref.id}.${ref.k}` })
      })
      human.spent()
      if (error) return error.message ?? "Je account kon niet worden aangemaakt."
      // The shareable link proves no address: the mail does, and brings them back here to join.
      if (link) {
        return `We stuurden een mail naar ${email}. Bevestig je e-mailadres en je komt hier terug om mee te doen.`
      }
      const signedIn = await authClient.signIn.email({ email: landing.email ?? email, password })
      if (signedIn.error) {
        return "Er is al een account met dit adres. Log in met je wachtwoord om de uitnodiging te accepteren."
      }
      return null
    },

    signIn: async (password) => {
      const email = landing.email ?? ""
      let result = await authClient.signIn.email({ email, password })
      if (result.error?.code === "TURNSTILE_REQUIRED") {
        result = await authClient.signIn.email({ email, password, turnstileToken: await human.token() })
        human.spent()
      }
      if (result.error) return result.error.message ?? "Inloggen mislukt. Controleer je gegevens."
      if (result.data?.twoFactorRedirect === true) {
        await navigate({ to: "/login/two-factor", search: { redirect: back() } })
        return leaving()
      }
      return null
    },

    continueWithGoogle: async () => {
      const { error } = await authClient.signIn.social({
        provider: "google",
        callbackURL: `${window.location.origin}${back()}`
      })
      if (error) {
        toast.error(error.message ?? "Inloggen met Google lukte niet. Probeer het opnieuw.")
        return false
      }
      return leaving()
    },

    resetPassword: () => {
      const email = landing.email ?? ""
      void human.token().then(async (turnstileToken) => {
        const { error } = await authClient.requestPasswordReset({
          email,
          redirectTo: `${window.location.origin}/reset-password`,
          turnstileToken
        })
        human.spent()
        if (error) toast.error(error.message ?? "De resetlink kon niet worden verstuurd. Probeer het opnieuw.")
        else toast.success(`Resetlink verstuurd naar ${email}`, { description: "De link is 30 minuten geldig." })
      })
    },

    switchAccount: async () => {
      await authClient.signOut()
      refresh()
      // The page draws the new state once it is read again.
      return undefined
    },

    requestNew: async () => Exit.isSuccess(await requestNew({ payload, ...keys })),
    requestSeat: async () => Exit.isSuccess(await requestSeat({ payload, ...keys })),

    join: async () => {
      const exit = await accept({ payload, ...keys })
      if (Exit.isFailure(exit)) {
        toast.error("Meedoen lukte niet meer", { description: "De uitnodiging is intussen veranderd." })
        refresh()
        return
      }
      toast.success(`Je zit in ${exit.value.workspace}`)
      // Start's gate asks `Session.me` afresh (no idle TTL), so it sees the new membership.
      await navigate({ href: exit.value.landing })
    },

    // A supplier's person joins as the supplier's contact and lands in its portal (M16).
    joinPartner: () =>
      void accept({ payload, ...keys }).then(async (exit) => {
        if (Exit.isFailure(exit)) {
          toast.error("Meedoen lukte niet meer", { description: "De uitnodiging is intussen veranderd." })
          return refresh()
        }
        await navigate({ href: exit.value.landing })
      }),

    openWorkspace: () =>
      void navigate({ to: (landing.supplier ?? null) === null ? "/dashboard" : "/supplier/dashboard" })
  }
}
