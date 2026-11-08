import { useAtomValue } from "@effect/atom-react"
import type { Landing } from "@insyte/modules/members/domain/Landing"
import { InvitationView } from "@insyte/ui/app/auth/invitation-view"
import { createFileRoute } from "@tanstack/react-router"
import { Effect, Option } from "effect"
import { AsyncResult, AtomRegistry } from "effect/reactivity"
import { useEffect, useRef } from "react"
import { landingAtom, landingKey } from "../data/landing.ts"
import { useConsoleInvitationSource } from "../invitations/landing-source.ts"

/**
 * An invitation's landing, `/invitations/<id>?k=<secret>` or `/invitations/link_<token>` (step 4.4, M3.4): the
 * reference's page over `Landing.resolve`, read on the server so the first paint is the right state, for whoever
 * opened it, signed in or not. A sign-in that went elsewhere (Google, the second factor, the confirmation mail) comes
 * back with `accept=1`; signed in as the invitee by then, the page accepts at once, as "Inloggen en accepteren" would.
 */
export const Route = createFileRoute("/invitations/$invitationId")({
  validateSearch: (search: Record<string, unknown>): { k?: string | undefined; accept?: "1" | undefined } => ({
    k: typeof search["k"] === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(search["k"]) ? search["k"] : undefined,
    accept: search["accept"] === "1" || search["accept"] === 1 ? "1" : undefined
  }),
  loaderDeps: ({ search }) => ({ k: search.k }),
  loader: async ({ context, params, deps }) => {
    const atom = landingAtom(landingKey(params.invitationId, deps.k))
    // Mounted so the value survives until the registry is dehydrated into the document.
    context.registry.mount(atom)
    await Effect.runPromise(Effect.ignore(AtomRegistry.getResult(context.registry, atom)))
  },
  head: () => ({ meta: [{ title: "Uitnodiging · Insyte" }] }),
  component: InvitationRoute
})

function InvitationRoute() {
  const { invitationId } = Route.useParams()
  const { k } = Route.useSearch()
  const result = useAtomValue(landingAtom(landingKey(invitationId, k)))
  // A re-read (after signing out, or an ask) keeps the page as it was until the new state is in.
  const landing = AsyncResult.isSuccess(result)
    ? result.value
    : Option.getOrUndefined(AsyncResult.value(result))
  if (landing === undefined) return null
  // A new state is a new page: its own phase, its own fields.
  return <Loaded key={landing.state} landing={landing} />
}

function Loaded({ landing }: { landing: Landing }) {
  const { invitationId } = Route.useParams()
  const { k, accept } = Route.useSearch()
  const source = useConsoleInvitationSource(landing, { id: invitationId, k })
  const started = useRef(false)
  const ready = accept === "1" && landing.signedInAs !== null &&
    (landing.state === "existing" || landing.state === "link" || landing.state === "sso")
  useEffect(() => {
    if (!ready || started.current) return
    started.current = true
    void source.join({ name: "", field: 0, notify: { on: 3, email: false }, via: "sign-in" })
  }, [ready, source])
  return <InvitationView source={source} />
}
