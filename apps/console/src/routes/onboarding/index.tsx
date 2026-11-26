import { useAtomRefresh, useAtomSet, useAtomValue } from "@effect/atom-react"
import { DEFAULT_LEVELS } from "@insyte/domain/AgentActions"
import type { AutonomyPolicy } from "@insyte/modules/agent/domain/Autonomy"
import type { BillingPlans } from "@insyte/modules/billing/domain/Billing"
import type { AdvanceInput } from "@insyte/modules/onboarding/domain/Onboarding"
import { positionOf } from "@insyte/modules/onboarding/domain/Steps"
import type { StoreView, SyncStatus } from "@insyte/modules/stores/domain/Stores"
import { FormError } from "@insyte/ui/app/common/form-error"
import { authClient } from "@insyte/ui/app/lib/auth-client"
import type { AgentActionId, AutonomyLevel, Policy } from "@insyte/ui/app/lib/autonomy"
import { fieldCopy } from "@insyte/ui/app/lib/errors"
import type { OfflineWindow } from "@insyte/ui/app/lib/first-analysis"
import { CONNECT_FIRST, planStep, readyStep, storeStep } from "@insyte/ui/app/onboarding/admin-tail-steps"
import { analysisStep } from "@insyte/ui/app/onboarding/analysis-step"
import { OfflineStep, proposedLevels } from "@insyte/ui/app/onboarding/first-analysis-steps"
import { search } from "@insyte/ui/app/onboarding/onboarding-search"
import { OnboardingShell, type StepDef } from "@insyte/ui/app/onboarding/onboarding-shell"
import { type NewWorkspace, organizationStep } from "@insyte/ui/app/onboarding/organization-step"
import { sharedHeadSteps } from "@insyte/ui/app/onboarding/shared-steps"
import { SyncProgress, type SyncRowData, syncStep } from "@insyte/ui/app/onboarding/sync-progress"
import { useOnboardingState } from "@insyte/ui/app/onboarding/use-onboarding-state"
import { createFileRoute, redirect } from "@tanstack/react-router"
import { Cause, Effect, Exit, Option } from "effect"
import { AsyncResult, Atom, AtomRegistry } from "effect/reactivity"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { autonomyAtom } from "../../data/agent.ts"
import { billingPlansAtom } from "../../data/billing.ts"
import { firstAnalysisAtom } from "../../data/first-analysis.ts"
import { advanceOnboardingAtom, ONBOARDING, onboardingMeAtom } from "../../data/onboarding.ts"
import { sessionMeAtom } from "../../data/session.ts"
import { storesAtom, syncStatusAtom } from "../../data/stores.ts"
import { AnalysisLive, ConsoleReadyCard, useConsoleAnalysis } from "../../onboarding/analysis.tsx"
import { ORGANIZATION_STEP, useAnotherWorkspace } from "../../onboarding/another-workspace.ts"
import { OFFLINE_WAIT_MS, type OfflineReady, offlineReady } from "../../onboarding/offline-ready.ts"
import { planTiles } from "../../onboarding/plan-tiles.ts"
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
 * import as it lands, live (failed, the way back to Shopify; either way "Nu overslaan" goes on without it to ready),
 * the analysis step the store's first analysis as the server reads it (M6.5, M15), with
 * "Klaarzetten" making the automation draft and the sheet, and the offline step the plan for while nobody is online,
 * written into Zelfstandigheid (M15 step 5). The partner tracks say they are not available yet (11 §7.3). A finished
 * person is sent to Start.
 */
export const Route = createFileRoute("/onboarding/")({
  validateSearch: search,
  head: () => ({ meta: [{ title: "Aan de slag · Insyte" }] }),
  loaderDeps: ({ search: { workspace } }) => ({ workspace }),
  loader: async ({ context, deps }) => {
    // Mounted so the value survives until the registry is dehydrated into the document.
    context.registry.mount(onboardingMeAtom)
    const me = await Effect.runPromise(Effect.option(AtomRegistry.getResult(context.registry, onboardingMeAtom)))
    // Done with onboarding: Start, unless they are here for one more workspace ("Nieuwe werkruimte", M3.1), or have
    // none left to go to (they left every one), when the organisation step is where they go on.
    if (Option.isSome(me) && me.value.completed && deps.workspace !== "new") {
      const session = await Effect.runPromise(Effect.option(AtomRegistry.getResult(context.registry, sessionMeAtom)))
      const none = Option.isSome(session) && !session.value.principals.some((p) => p.kind === "member")
      throw none
        ? redirect({ to: "/onboarding", search: { step: 3, workspace: "new" } })
        : redirect({ to: "/dashboard" })
    }
    // The plan step shows the server's plans and Stripe's prices: in the document too.
    if (Option.isSome(me) && me.value.step === "plan") {
      context.registry.mount(billingPlansAtom)
      await Effect.runPromise(Effect.ignore(AtomRegistry.getResult(context.registry, billingPlansAtom)))
    }
    // The sync step reads the store it imports: in the document too.
    if (Option.isSome(me) && me.value.step === "sync") {
      context.registry.mount(storesAtom)
      await Effect.runPromise(Effect.ignore(AtomRegistry.getResult(context.registry, storesAtom)))
    }
    // The analysis, offline and ready steps show the store's first analysis: in the document too.
    const step = Option.isSome(me) ? me.value.step : undefined
    if (step === "analysis" || step === "offline" || step === "ready") {
      context.registry.mount(firstAnalysisAtom)
      await Effect.runPromise(Effect.ignore(AtomRegistry.getResult(context.registry, firstAnalysisAtom)))
    }
    // The offline step starts from the autonomy policy in force: read from the analysis step on, so it is in by then.
    if (step === "analysis" || step === "offline") {
      context.registry.mount(autonomyAtom)
      await Effect.runPromise(Effect.ignore(AtomRegistry.getResult(context.registry, autonomyAtom)))
    }
  },
  component: ConsoleOnboarding
})

const IDLE_POLICY: Atom.Atom<AsyncResult.AsyncResult<AutonomyPolicy, unknown>> = Atom.make(AsyncResult.initial())

/** The policy in force on the offline step, as "Afronden" makes the plan on it. */
interface OfflinePolicy {
  /** Its levels: the defaults until it is read. */
  readonly levels: Policy
  /** Whether "Afronden" may make the plan yet, and on which version (`offlineReady`). */
  readonly ready: OfflineReady
  /** Reads the policy and the person's step again, and waits afresh. */
  readonly retry: () => void
}

/**
 * The autonomy policy for the offline step: read from the analysis step on, so it is usually in before the step
 * opens; "Afronden" waits for it and for the server to have moved the person onto the step, at most
 * `OFFLINE_WAIT_MS` while the step is shown.
 */
function useOfflinePolicy(serverStep: string | undefined, shown: boolean): OfflinePolicy {
  const on = serverStep === "analysis" || serverStep === "offline"
  const atom = on ? autonomyAtom : IDLE_POLICY
  const result = useAtomValue(atom)
  const refreshPolicy = useAtomRefresh(atom)
  const refreshMe = useAtomRefresh(onboardingMeAtom)
  const [timedOut, setTimedOut] = useState(false)
  const waiting = shown && offlineReady({ serverStep, policy: result, timedOut: false }).kind === "wait"
  useEffect(() => {
    if (!waiting) return
    const timer = setTimeout(() => setTimedOut(true), OFFLINE_WAIT_MS)
    return () => clearTimeout(timer)
  }, [waiting])
  return {
    levels: (Option.getOrUndefined(AsyncResult.value(result))?.levels ?? DEFAULT_LEVELS) as Policy,
    ready: offlineReady({ serverStep, policy: result, timedOut }),
    retry: () => {
      setTimedOut(false)
      refreshPolicy()
      refreshMe()
    }
  }
}

const IDLE_PLANS: Atom.Atom<AsyncResult.AsyncResult<BillingPlans, unknown>> = Atom.make(AsyncResult.initial())

/** The plan step's tiles: the server's plans and Stripe's prices, read on that step only. */
function usePlanTiles(on: boolean) {
  return planTiles(Option.getOrUndefined(AsyncResult.value(useAtomValue(on ? billingPlansAtom : IDLE_PLANS))))
}

const IDLE_STORES: Atom.Atom<AsyncResult.AsyncResult<ReadonlyArray<StoreView>, unknown>> = Atom.make(
  AsyncResult.initial()
)
const IDLE_SYNC: Atom.Atom<AsyncResult.AsyncResult<SyncStatus, unknown>> = Atom.make(AsyncResult.initial())

/**
 * The store's first import, for the sync step: not read yet, no store to import, still importing, in, or failed (the
 * backfill gave up and the store needs the operator, `action_required`). Read on that step only.
 */
type FirstImport =
  | { readonly kind: "loading" }
  | { readonly kind: "none" }
  | {
    readonly kind: "importing" | "done" | "failed"
    readonly store: StoreView
    readonly status: SyncStatus | undefined
  }

/** The import as it lands: every page's frame refetches it, and a slow poll covers a lost socket, until it ends. */
function useFirstImport(on: boolean): FirstImport {
  const listed = useAtomValue(on ? storesAtom : IDLE_STORES)
  const store = Option.getOrUndefined(AsyncResult.value(listed))?.find((s) => s.status !== "disconnected")
  const atom = store === undefined ? IDLE_SYNC : syncStatusAtom(store.id)
  const status = Option.getOrUndefined(AsyncResult.value(useAtomValue(atom)))
  const refresh = useAtomRefresh(atom)
  const kind = store === undefined
    ? "none"
    : status?.lastSyncedAt !== null && status?.lastSyncedAt !== undefined
    ? "done"
    : (status?.status ?? store.status) === "action_required"
    ? "failed"
    : "importing"
  useEffect(() => {
    if (kind !== "importing") return
    const timer = setInterval(refresh, 4000)
    return () => clearInterval(timer)
  }, [kind, refresh])
  if (!on || !AsyncResult.isSuccess(listed)) {
    return on && AsyncResult.isFailure(listed) ? { kind: "none" } : { kind: "loading" }
  }
  return store === undefined ? { kind: "none" } : { kind: kind as "importing" | "done" | "failed", store, status }
}

const SYNC_LABELS = [
  { id: "products", label: "Producten" },
  { id: "customers", label: "Klanten" },
  { id: "orders", label: "Bestellingen" }
] as const

/** The import's rows as the mirror counts them, the reference's "no store" copy, or the way back to Shopify. */
function ConsoleSync({ first, onReconnect }: { first: FirstImport; onReconnect: (domain: string) => Promise<void> }) {
  const [leaving, setLeaving] = useState(false)
  if (first.kind === "loading") return <SyncProgress connected rows={[]} />
  if (first.kind === "none") return <SyncProgress connected={false} rows={[]} />
  if (first.kind === "failed") {
    const { store } = first
    return (
      <button
        type="button"
        disabled={leaving}
        onClick={() => {
          setLeaving(true)
          // The browser leaves for Shopify; it stays here only if it could not (and said why).
          void onReconnect(store.shopDomain).finally(() => setLeaving(false))
        }}
        className="flex h-11 cursor-pointer items-center justify-center gap-2 rounded-lg bg-paper px-4 font-medium text-base text-ink transition-colors hover:bg-ink/4 disabled:cursor-not-allowed disabled:text-ink-3"
      >
        {leaving ? "Shopify wordt geopend" : "Opnieuw koppelen"}
      </button>
    )
  }
  const { status } = first
  const done = first.kind === "done"
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

/** Said when a step was finished on a screen the server had moved past (Terug, another tab): it goes on there. */
const RESUMED = "Je was al verder. Je gaat verder waar je was."

const NOT_YET: StepDef = {
  id: "next",
  title: "Je account staat klaar.",
  subtitle: "De volgende stappen van de onboarding zijn nog niet beschikbaar. Je kunt dit venster sluiten.",
  hidePrimary: true,
  content: null
}

function ConsoleOnboarding() {
  const { step, connected, error, workspace } = Route.useSearch()
  // Shopify's way back, as the page arrived: the address is rewritten to the step at once.
  const arrival = useRef({ connected, error })
  const navigate = Route.useNavigate()
  const me = useAtomValue(onboardingMeAtom)
  const server = AsyncResult.isSuccess(me) ? me.value : undefined
  const advance = useAtomSet(advanceOnboardingAtom, { mode: "promiseExit" })
  const refreshMe = useAtomRefresh(onboardingMeAtom)
  // One more workspace for someone whose onboarding is done: the organisation step again, then the rest of the track
  // for the new workspace, which the server resumes on its own row.
  const another = workspace === "new" && server?.completed === true
  const more = useAnotherWorkspace()
  const state = useOnboardingState({
    persona: another ? "admin" : server?.answers.persona ?? null,
    stepIndex: another ? ORGANIZATION_STEP : server?.index ?? step ?? 0
  })

  // The server decides where a signed-in person is: on arrival, and after every step it records.
  useEffect(() => {
    if (server === undefined || another) return
    const persona = server.answers.persona ?? null
    if (persona !== state.persona) state.resumeTo(persona, server.index)
    else if (server.index !== state.stepIndex) state.setStepIndex(server.index)
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- follows the server's answer only
  }, [server?.index, server?.answers.persona])

  // The step in the address, so the back button and a shared link land where the person was.
  useEffect(() => {
    void navigate({
      search: another ? { step: state.stepIndex, workspace: "new" } : { step: state.stepIndex },
      replace: true
    })
  }, [navigate, state.stepIndex, another])

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
  // The later steps move to where the server says: skipping the store skips the steps a store would need. A step the
  // server has moved past (`NotCurrentStep`) goes to the step it holds; `notReady` says a fact it does not have yet.
  const finish = async (payload: Exclude<AdvanceInput, { step: "organization" }>, notReady?: string) => {
    const exit = await advance({ payload, reactivityKeys: ONBOARDING })
    if (Exit.isSuccess(exit)) {
      state.setStepIndex(exit.value.index)
      return exit.value
    }
    const failure = Cause.findErrorOption(exit.cause)
    if (failure._tag === "Some" && failure.value._tag === "NotCurrentStep" && server !== undefined) {
      state.setStepIndex(positionOf(server.track, failure.value.current).index)
      refreshMe()
      throw new Error(RESUMED)
    }
    if (failure._tag === "Some" && failure.value._tag === "StepNotReady" && notReady !== undefined) {
      throw new Error(notReady)
    }
    throw new Error("Dit kon niet worden opgeslagen. Probeer het opnieuw.")
  }
  const beginConnect = useBeginConnect("/onboarding")
  const analysis = useConsoleAnalysis(
    server?.step === "analysis" || server?.step === "offline" || server?.step === "ready" ? server.step : "other"
  )
  // Whether the offline step is the one on screen: the screen moves on before the server's answer is read again.
  const [offlineShown, setOfflineShown] = useState(false)
  const policy = useOfflinePolicy(server?.step, offlineShown)
  const tiles = usePlanTiles(server?.step === "plan")
  const firstImport = useFirstImport(server?.step === "sync")
  const importing = firstImport.kind !== "loading" && firstImport.kind !== "done"

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
      organizationStep({ data, patch, next, onCreate: another ? more.create : create }),
      planStep({
        data,
        patch,
        next,
        plans: tiles,
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
        // On with the store the server has (back from Shopify, the step not recorded yet); none, it says so.
        onContinue: async () => {
          await finish({ step: "store", choice: "connected" }, CONNECT_FIRST)
        },
        onConnect: beginConnect
      }),
      {
        ...syncStep({
          connected: true,
          rows: [],
          // Nothing to look at without an import: the step goes on without it ("Nu overslaan").
          canContinue: firstImport.kind !== "failed" && firstImport.kind !== "none",
          onPrimary: async () => {
            await finish({ step: "sync" }, "De eerste import is nog bezig. Wacht even, of sla deze stap over.")
          }
        }),
        ...(firstImport.kind === "failed"
          ? {
            title: "De eerste import is mislukt.",
            subtitle:
              "Koppel je winkel opnieuw om het nog eens te proberen, of ga verder zonder en koppel later via Instellingen, Koppelingen."
          }
          : {}),
        // The import may take a while, or fail: no one has to wait for it. Without it there is nothing to analyse, so
        // the steps it feeds are skipped.
        ...(importing
          ? {
            skipLabel: "Nu overslaan",
            onSkip: async () => {
              await finish({ step: "sync", choice: "later" })
            }
          }
          : {}),
        content: <ConsoleSync first={firstImport} onReconnect={beginConnect} />
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
      (() => {
        const ready = policy.ready
        // The answers and the choices as the server kept them, where this tab did not make them (a reload).
        const offline = {
          ...data,
          answers: (data["answers"] as Record<string, string> | undefined) ?? analysis.view?.chosen?.answers ?? {},
          prepared: (data["prepared"] as ReadonlyArray<string> | undefined) ?? analysis.view?.chosen?.ids ?? []
        }
        return {
          id: "offline",
          title: "Terwijl je offline bent.",
          subtitle:
            "Wat Insyte doet als niemand online is. Jij zet de grens, per soort werk, en past hem later aan onder Zelfstandigheid.",
          canContinue: true,
          primaryLabel: "Afronden",
          busyLabel: "Bezig met opslaan",
          // The plan is made on the policy the step shows: "Afronden" waits until it is read.
          pending: ready.kind === "wait",
          pendingLabel: "Bezig met laden",
          onPrimary: async () => {
            // A read that failed or took too long: read again, and wait for it.
            if (ready.kind !== "ready") return policy.retry()
            const levels = (data["offlineLevels"] as Partial<Record<AgentActionId, AutonomyLevel>> | undefined) ??
              proposedLevels(offline.answers, policy.levels)
            const window = (data["offlineWindow"] as OfflineWindow | undefined) ?? "evening"
            try {
              await analysis.agreeOffline(window, levels, ready.version)
            } catch (e) {
              // Saved meanwhile, say: the step reads the policy again, and the next try is made on it.
              policy.retry()
              throw e
            }
            await finish({ step: "offline" })
          },
          content: (
            <div className="flex flex-col gap-6">
              {ready.kind === "failed"
                ? (
                  <FormError message="Zelfstandigheid kon niet worden gelezen. Druk op Afronden om het opnieuw te proberen." />
                )
                : null}
              <OfflineStep data={offline} patch={patch} policy={policy.levels} />
            </div>
          )
        } satisfies StepDef
      })(),
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

  const steps = [...head, ...tail]
  const onOffline = steps[Math.min(Math.max(state.stepIndex, 0), steps.length - 1)]?.id === "offline"
  useEffect(() => setOfflineShown(onOffline), [onOffline])

  return (
    <OnboardingShell
      persona={state.persona}
      steps={steps}
      stepIndex={state.stepIndex}
      onBack={() => (another ? void navigate({ to: "/dashboard" }) : state.back())}
      // Signed in, the steps before the server's are done: going back to one would only move the screen.
      canGoBack={another || server === undefined || state.stepIndex > server.index}
      onChangeRole={() => state.setStepIndex(2)}
      onExit={async () => {
        // Someone with another workspace goes back to it rather than signing out.
        if (await more.leaveToAnother(another)) return
        // Leaving the flow signs out: there is nothing else to go to yet. No reset first: the step would be written back
        // into the address over this navigation, and leaving the route drops the state anyway.
        await authClient.signOut()
        await navigate({ to: "/login", search: {} })
      }}
    />
  )
}
