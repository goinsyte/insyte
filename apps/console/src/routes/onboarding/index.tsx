import { useAtomSet, useAtomValue } from "@effect/atom-react"
import { authClient } from "@insyte/ui/app/lib/auth-client"
import { search } from "@insyte/ui/app/onboarding/onboarding-search"
import { OnboardingShell, type StepDef } from "@insyte/ui/app/onboarding/onboarding-shell"
import { organizationStep } from "@insyte/ui/app/onboarding/organization-step"
import { sharedHeadSteps } from "@insyte/ui/app/onboarding/shared-steps"
import { useOnboardingState } from "@insyte/ui/app/onboarding/use-onboarding-state"
import { createFileRoute } from "@tanstack/react-router"
import { Effect } from "effect"
import { AsyncResult, AtomRegistry } from "effect/reactivity"
import { useEffect } from "react"
import { advanceOnboardingAtom, ONBOARDING, onboardingMeAtom } from "../../data/onboarding.ts"

/**
 * Onboarding (step 2, M4.1): the design reference's shell and steps, with the progress on the server. The loader reads
 * `Onboarding.me` before any HTML, so a reload, another device or a return next week opens on the right step; choosing
 * a role is `Onboarding.advance`. Signed out (account, verify) the steps run locally, and the verification link lands
 * on `?step=2`, signed in.
 *
 * Built so far: the shared head and the admin track's organisation step, whose workspace arrives in step 3. The rest of
 * the admin track and the partner tracks say they are not available yet (11 §7.3).
 */
export const Route = createFileRoute("/onboarding/")({
  validateSearch: search,
  head: () => ({ meta: [{ title: "Aan de slag · Insyte" }] }),
  loader: async ({ context }) => {
    // Mounted so the value survives until the registry is dehydrated into the document.
    context.registry.mount(onboardingMeAtom)
    await Effect.runPromise(Effect.ignore(AtomRegistry.getResult(context.registry, onboardingMeAtom)))
  },
  component: ConsoleOnboarding
})

const NOT_YET: StepDef = {
  id: "next",
  title: "Je account staat klaar.",
  subtitle: "De volgende stappen van de onboarding zijn nog niet beschikbaar. Je kunt dit venster sluiten.",
  hidePrimary: true,
  content: null
}

function ConsoleOnboarding() {
  const { step } = Route.useSearch()
  const navigate = Route.useNavigate()
  const me = useAtomValue(onboardingMeAtom)
  const server = AsyncResult.isSuccess(me) ? me.value : undefined
  const advance = useAtomSet(advanceOnboardingAtom, { mode: "promiseExit" })
  const state = useOnboardingState({
    persona: server?.answers.persona ?? null,
    stepIndex: server?.index ?? step ?? 0
  })

  // The server decides where a signed-in person is: on arrival, and after every step it records.
  useEffect(() => {
    if (server === undefined) return
    const persona = server.answers.persona ?? null
    if (persona !== state.persona) state.resumeTo(persona, server.index)
    else if (server.index !== state.stepIndex) state.setStepIndex(server.index)
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- follows the server's answer only
  }, [server?.index, server?.answers.persona])

  // The step in the address, so the back button and a shared link land where the person was.
  useEffect(() => {
    void navigate({ search: { step: state.stepIndex }, replace: true })
  }, [navigate, state.stepIndex])

  const head = sharedHeadSteps({
    data: state.data,
    patch: state.patch,
    next: state.next,
    // Recorded on the server; its answer, read again through `ONBOARDING`, moves the screen on.
    setPersona: (persona) => void advance({ payload: { step: "role", persona }, reactivityKeys: ONBOARDING })
  })
  const tail = state.persona === null
    ? []
    : state.persona === "admin"
    ? [organizationStep({ data: state.data, patch: state.patch, next: state.next })]
    : [NOT_YET]

  return (
    <OnboardingShell
      persona={state.persona}
      steps={[...head, ...tail]}
      stepIndex={state.stepIndex}
      onBack={() => state.back()}
      onChangeRole={() => state.setStepIndex(2)}
      onExit={async () => {
        // Leaving the flow signs out: there is nothing else to go to yet. No reset first: the step would be written back
        // into the address over this navigation, and leaving the route drops the state anyway.
        await authClient.signOut()
        await navigate({ to: "/login", search: {} })
      }}
    />
  )
}
