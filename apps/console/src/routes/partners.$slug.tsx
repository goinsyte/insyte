import { useAtomSet, useAtomValue } from "@effect/atom-react"
import { NotFound } from "@insyte/domain/Errors"
import { AffiliateApply } from "@insyte/ui/app/affiliate/apply-screen"
import { PageSkeleton } from "@insyte/ui/app/loading/page-skeletons"
import { createFileRoute, notFound, redirect, useNavigate } from "@tanstack/react-router"
import { Effect, Exit, Option, Schema } from "effect"
import { AsyncResult, AtomRegistry } from "effect/reactivity"
import { useState } from "react"
import { toast } from "sonner"
import {
  AFFILIATE_PORTAL,
  affiliateMeAtom,
  affiliatePortalWrites,
  programLandingAtom
} from "../data/affiliate-portal.ts"
import { sessionMeAtom } from "../data/session.ts"
import { failureOf, type RefusalCopy, sayRefusal } from "../frame/refusals.ts"

const isNotFound = Schema.is(NotFound)

/** An optional field left empty is left out. */
const text = (s: string) => (s.trim() === "" ? {} : undefined)

const COPY: RefusalCopy = {
  gone: "Dit partnerprogramma bestaat niet",
  conflicts: {
    closed: ["Het programma is gesloten", "Er worden nu geen nieuwe aanmeldingen aangenomen."],
    member: ["Je hoort al bij dit team", "Een teamlid kan niet ook affiliate van dezelfde winkel zijn."],
    open: ["Je aanmelding loopt al", "Je hoort het zodra er een besluit is."]
  },
  invalid: { name: "Vul je naam in.", url: "Die URL is te lang." }
}

/**
 * A brand's public partner page, `/partners/<slug>` (M16 step 3; PLAN 22): the programme's name and whether it takes
 * applications, then the application. Signed out, sign-in first with the way back; already an affiliate or an
 * applicant here, the portal, which shows where they stand. Sent, the portal's "wordt beoordeeld" takes over.
 */
export const Route = createFileRoute("/partners/$slug")({
  head: () => ({ meta: [{ title: "Partnerprogramma · Insyte" }] }),
  beforeLoad: async ({ context, location }) => {
    const me = await Effect.runPromise(
      AtomRegistry.getResult(context.registry, sessionMeAtom).pipe(
        Effect.asSome,
        Effect.catchTag("Unauthenticated", () => Effect.succeedNone)
      )
    )
    if (Option.isNone(me)) throw redirect({ to: "/login", search: { redirect: location.href } })
    const affiliate = await Effect.runPromiseExit(AtomRegistry.getResult(context.registry, affiliateMeAtom))
    if (Exit.isSuccess(affiliate)) throw redirect({ to: "/affiliate/dashboard" })
    return { name: me.value.user.name }
  },
  loader: async ({ context, params }) => {
    const atom = programLandingAtom(params.slug)
    // Mounted so the value survives until the registry is dehydrated into the document.
    context.registry.mount(atom)
    const exit = await Effect.runPromiseExit(AtomRegistry.getResult(context.registry, atom))
    if (Exit.isFailure(exit) && exit.cause.reasons.some((r) => r._tag === "Fail" && isNotFound(r.error))) {
      throw notFound()
    }
    return { name: context.name }
  },
  pendingComponent: () => <PageSkeleton kind="settings" title="Partnerprogramma" />,
  component: PartnerRoute
})

function PartnerRoute() {
  const { slug } = Route.useParams()
  const { name } = Route.useLoaderData()
  const landing = Option.getOrUndefined(AsyncResult.value(useAtomValue(programLandingAtom(slug))))
  const apply = useAtomSet(affiliatePortalWrites.apply, { mode: "promiseExit" })
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  if (landing === undefined) return <PageSkeleton kind="settings" title="Partnerprogramma" />
  return (
    <AffiliateApply
      brand={landing.brand}
      open={landing.open}
      name={name}
      busy={busy}
      onSubmit={(a) => {
        setBusy(true)
        void apply({
          payload: {
            program: slug,
            name: a.name,
            ...(text(a.businessName) ?? { businessName: a.businessName.trim() }),
            ...(text(a.country) ?? { country: a.country }),
            ...(text(a.channel) ?? { channel: a.channel }),
            ...(text(a.audience) ?? { audience: a.audience.trim() }),
            ...(text(a.motivation) ?? { motivation: a.motivation.trim() }),
            ...(text(a.url) ?? { url: a.url.trim() }),
            payout: a.payout
          },
          reactivityKeys: AFFILIATE_PORTAL
        }).then((exit) => {
          setBusy(false)
          if (Exit.isFailure(exit)) return sayRefusal(failureOf(exit), COPY)
          toast.success("Aanmelding verstuurd", { description: `${landing.brand} beoordeelt je aanmelding.` })
          void navigate({ to: "/affiliate/dashboard" })
        })
      }}
    />
  )
}
