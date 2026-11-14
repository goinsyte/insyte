import { useAtomRefresh, useAtomSet, useAtomValue } from "@effect/atom-react"
import type { AdvanceInput } from "@insyte/modules/onboarding/domain/Onboarding"
import { authClient } from "@insyte/ui/app/lib/auth-client"
import { fieldCopy } from "@insyte/ui/app/lib/errors"
import { planStep, readyStep, storeStep } from "@insyte/ui/app/onboarding/admin-tail-steps"
import { analysisStep } from "@insyte/ui/app/onboarding/analysis-step"
import { search } from "@insyte/ui/app/onboarding/onboarding-search"
import { OnboardingShell, type StepDef } from "@insyte/ui/app/onboarding/onboarding-shell"
import { type NewWorkspace, organizationStep } from "@insyte/ui/app/onboarding/organization-step"
import { sharedHeadSteps } from "@insyte/ui/app/onboarding/shared-steps"
import { SyncProgress, type SyncRowData, syncStep } from "@insyte/ui/app/onboarding/sync-progress"
import { useOnboardingState } from "@insyte/ui/app/onboarding/use-onboarding-state"
import { createFileRoute, redirect } from "@tanstack/react-router"
import { Cause, Effect, Exit, Option } from "effect"
import { AsyncResult, AtomRegistry } from "effect/reactivity"
import { useEffect, useRef } from "react"
import { toast } from "sonner"
import { firstAnalysisAtom } from "../../data/first-analysis.ts"
import { advanceOnboardingAtom, ONBOARDING, onboardingMeAtom } from "../../data/onboarding.ts"
import { storesAtom, syncStatusAtom } from "../../data/stores.ts"
import { AnalysisLive, ConsoleReadyCard, useConsoleAnalysis } from "../../onboarding/analysis.tsx"
import { LiveUpdates } from "../../realtime/live-updates.tsx"
import { useBeginConnect } from "../../stores/begin-connect.ts"
import { notConnected } from "../../stores/stores-source.tsx"

/**
 * Onboarding (step 2, M4.1): the design reference's shell and steps, with the progress on the server. The loader reads
 * `Onboarding.me` before any HTML, so a reload, another device or a return next week opens on the right step; choosing
 * a role is `Onboarding.advance`. Signed out (account, verify) the steps run locally, and the verification link lands
 * on `?step=2`, signed in.
 *
 * Built so far: the shared head and the admin track up to ready (organisation founds the workspace, plan starts the
 * trial, the store connects through Shopify or waits on Start), which lands on Start. Shopify's way back is
 * `?connected=shopify` (the store step is then recorded as connected) or `?error=`; the sync step shows the first
 * import as it lands, live, and the analysis step the store's first analysis as the server reads it (M6.5). The
 * offline plan follows with autonomy (M15); the partner tracks say they are not available yet (11 §7.3). A finished
 * person is sent to Start.
 */
export const Route = createFileRoute("/onboarding/")({
  validateSearch: search,
  head: () => ({ meta: [{ title: "Aan de slag · Insyte" }] }),
  loader: async ({ context }) => {
    // Mounted so the value survives until the registry is dehydrated into the document.
    context.registry.mount(onboardingMeAtom)
    const me = await Effect.runPromise(Effect.option(AtomRegistry.getResult(context.registry, onboardingMeAtom)))
    if (Option.isSome(me) && me.value.completed) throw redirect({ to: "/dashboard" })
    // The sync step reads the store it imports: in the document too.
    if (Option.isSome(me) && me.value.step === "sync") {
      context.registry.mount(storesAtom)
      await Effect.runPromise(Effect.ignore(AtomRegistry.getResult(context.registry, storesAtom)))
    }
    // The analysis and ready steps show the store's first analysis: in the document too.
    if (Option.isSome(me) && (me.value.step === "analysis" || me.value.step === "ready")) {
      context.registry.mount(firstAnalysisAtom)
      await Effect.runPromise(Effect.ignore(AtomRegistry.getResult(context.registry, firstAnalysisAtom)))
    }
  },
  component: ConsoleOnboarding
})

/** The offline plan follows with autonomy (M15); until then the server goes from the analysis straight to ready. */
const OFFLINE: StepDef = {
  id: "offline",
  title: "Deze stap volgt zodra je winkel is gekoppeld.",
  hidePrimary: true,
  content: null
}

const SYNC_LABELS = [
  { id: "products", label: "Producten" },
  { id: "customers", label: "Klanten" },
  { id: "orders", label: "Bestellingen" }
] as const

/** The workspace's store being imported, or "no store" (the reference's own copy for that). */
function ConsoleSync() {
  const stores = Option.getOrUndefined(AsyncResult.value(useAtomValue(storesAtom))) ?? []
  const store = stores.find((s) => s.status !== "disconnected")
  if (store === undefined) return <SyncProgress connected={false} rows={[]} />
  return <SyncOf storeId={store.id} />
}

/** The mirror's counts as they land: every page's frame refetches them, and a slow poll covers a lost socket. */
function SyncOf({ storeId }: { storeId: string }) {
  const status = Option.getOrUndefined(AsyncResult.value(useAtomValue(syncStatusAtom(storeId))))
  const refresh = useAtomRefresh(syncStatusAtom(storeId))
  const done = status?.lastSyncedAt !== null && status?.lastSyncedAt !== undefined
  useEffect(() => {
    if (done) return
    const timer = setInterval(refresh, 4000)
    return () => clearInterval(timer)
  }, [done, refresh])
  const rows: Array<SyncRowData> = SYNC_LABELS.map((r, i) => ({
    ...r,
    to: status?.counts[r.id] ?? 0,
    delay: i * 250,
    done: done || status?.resources.find((x) => x.resource === r.id)?.phase === "done"
  }))
  return (
    <>
      <LiveUpdates />
      <SyncProgress connected rows={rows} live />
    </>
  )
}

const NOT_YET: StepDef = {
  id: "next",
  title: "Je account staat klaar.",
  subtitle: "De volgende stappen van de onboarding zijn nog niet beschikbaar. Je kunt dit venster sluiten.",
  hidePrimary: true,
  content: null
}

function ConsoleOnboarding() {
  const { step, connected, error } = Route.useSearch()
  // Shopify's way back, as the page arrived: the address is rewritten to the step at once.
  const arrival = useRef({ connected, error })
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
  const beginConnect = useBeginConnect("/onboarding")
  const analysis = useConsoleAnalysis(
    server?.step === "analysis" ? "analysis" : server?.step === "ready" ? "ready" : "other"
  )

  // Back from Shopify: a connected store is the store step's answer; a refusal is said once.
  useEffect(() => {
    if (server === undefined) return
    const { connected: back, error: refused } = arrival.current
    arrival.current = { connected: undefined, error: undefined }
    if (refused !== undefined) notConnected(refused)
    else if (back !== undefined && server.step === "store") {
      void finish({ step: "store", choice: "connected" }).catch((e: Error) => toast.error(e.message))
    }
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- once, on arrival
  }, [server === undefined])

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
        },
        onConnect: beginConnect
      }),
      {
        ...syncStep({
          connected: true,
          rows: [],
          canContinue: true,
          onPrimary: async () => {
            const exit = await advance({ payload: { step: "sync" }, reactivityKeys: ONBOARDING })
            if (Exit.isSuccess(exit)) return state.setStepIndex(exit.value.index)
            const failure = Cause.findErrorOption(exit.cause)
            throw new Error(
              failure._tag === "Some" && failure.value._tag === "StepNotReady"
                ? "De eerste import is nog bezig. Nog even geduld."
                : "Dit kon niet worden opgeslagen. Probeer het opnieuw."
            )
          }
        }),
        content: <ConsoleSync />
      },
      (() => {
        const step = analysisStep({
          source: analysis.source,
          data,
          patch,
          onPrimary: async (ids, answers) => {
            await analysis.prepare(ids, answers)
            await finish({ step: "analysis" })
          }
        })
        return {
          ...step,
          content: (
            <>
              <AnalysisLive reading={analysis.view?.state === "reading" || analysis.view?.state === "none"} />
              {step.content}
            </>
          )
        }
      })(),
      OFFLINE,
      readyStep({
        data,
        finish: () => undefined,
        onReady: async () => {
          await finish({ step: "ready" })
          await navigate({ to: "/dashboard" })
        },
        content: <ConsoleReadyCard view={analysis.view} />
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
