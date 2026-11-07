import { useAtomSet, useAtomValue } from "@effect/atom-react"
import type { AdvanceInput } from "@insyte/modules/onboarding/domain/Onboarding"
import { authClient } from "@insyte/ui/app/lib/auth-client"
import { fieldCopy } from "@insyte/ui/app/lib/errors"
import { planStep, readyStep, storeStep } from "@insyte/ui/app/onboarding/admin-tail-steps"
import { search } from "@insyte/ui/app/onboarding/onboarding-search"
import { OnboardingShell, type StepDef } from "@insyte/ui/app/onboarding/onboarding-shell"
import { type NewWorkspace, organizationStep } from "@insyte/ui/app/onboarding/organization-step"
import { sharedHeadSteps } from "@insyte/ui/app/onboarding/shared-steps"
import { useOnboardingState } from "@insyte/ui/app/onboarding/use-onboarding-state"
import { createFileRoute, redirect } from "@tanstack/react-router"
import { Cause, Effect, Exit, Option } from "effect"
import { AsyncResult, AtomRegistry } from "effect/reactivity"
import { useEffect } from "react"
import { advanceOnboardingAtom, ONBOARDING, onboardingMeAtom } from "../../data/onboarding.ts"

/**
 * Onboarding (step 2, M4.1): the design reference's shell and steps, with the progress on the server. The loader reads
 * `Onboarding.me` before any HTML, so a reload, another device or a return next week opens on the right step; choosing
 * a role is `Onboarding.advance`. Signed out (account, verify) the steps run locally, and the verification link lands
 * on `?step=2`, signed in.
 *
 * Built so far: the shared head and the admin track up to ready (organisation founds the workspace, plan starts the
 * trial, the store is left for Start until M6), which lands on Start. Sync, analysis and offline follow a connected
 * store (M6, M15); the partner tracks say they are not available yet (11 §7.3). A finished person is sent to Start.
 */
export const Route = createFileRoute("/onboarding/")({
  validateSearch: search,
  head: () => ({ meta: [{ title: "Aan de slag · Insyte" }] }),
  loader: async ({ context }) => {
    // Mounted so the value survives until the registry is dehydrated into the document.
    context.registry.mount(onboardingMeAtom)
    const me = await Effect.runPromise(Effect.option(AtomRegistry.getResult(context.registry, onboardingMeAtom)))
    if (Option.isSome(me) && me.value.completed) throw redirect({ to: "/dashboard" })
  },
  component: ConsoleOnboarding
})

/** Sync, analysis and offline follow a connected store (M6, M15); skipping the store never reaches them. */
const AFTER_A_STORE = (["sync", "analysis", "offline"] as const).map((id): StepDef => ({
  id,
  title: "Deze stap volgt zodra je winkel is gekoppeld.",
  hidePrimary: true,
  content: null
}))

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
  // Founds the workspace on the server; a refusal comes back as the sentence for its first field.
  const create = async (workspace: NewWorkspace) => {
    const exit = await advance({ payload: { step: "organization", ...workspace }, reactivityKeys: ONBOARDING })
    if (Exit.isSuccess(exit)) return undefined
    const failure = Cause.findErrorOption(exit.cause)
    if (failure._tag === "Some" && failure.value._tag === "Invalid") return fieldCopy(failure.value.fields)
    return "Je werkruimte kon niet worden aangemaakt. Probeer het opnieuw."
  }
  // The later steps move to where the server says: skipping the store skips the steps a store would need.
  const finish = async (payload: Exclude<AdvanceInput, { step: "organization" }>) => {
    const exit = await advance({ payload, reactivityKeys: ONBOARDING })
    if (Exit.isFailure(exit)) throw new Error("Dit kon niet worden opgeslagen. Probeer het opnieuw.")
    state.setStepIndex(exit.value.index)
    return exit.value
  }
  const { data, patch, next } = state
  const tail = state.persona === null
    ? []
    : state.persona === "admin"
    ? [
      organizationStep({ data, patch, next, onCreate: create }),
      planStep({
        data,
        patch,
        next,
        onStart: async (plan, cycle) => {
          await finish({ step: "plan", plan, cycle })
        }
      }),
      storeStep({
        data,
        patch,
        next,
        onSkip: async () => {
          await finish({ step: "store", choice: "later" })
        }
      }),
      ...AFTER_A_STORE,
      readyStep({
        data,
        finish: () => undefined,
        onReady: async () => {
          await finish({ step: "ready" })
          await navigate({ to: "/dashboard" })
        }
      })
    ]
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
