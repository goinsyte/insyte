import { openProposals, useDemo } from "../../demo.ts"
import { AGENTS } from "../../fixtures/agents.ts"
import { APPROVALS } from "../../fixtures/home.ts"
import type { Approval } from "../../fixtures/home.ts"
import { Link, navigate, paths } from "../../router.tsx"
import { Denied, ReadOnlyNotice, useAccess } from "../../ui/access.tsx"
import { AgentAvatar } from "../../ui/avatar.tsx"
import { Button } from "../../ui/button.tsx"
import { cx } from "../../ui/cx.ts"
import { Check, ChevronRight, Sparkles } from "../../ui/icons.tsx"
import { Page, PageHead } from "../../ui/page.tsx"
import { EmptyState } from "../../ui/states.tsx"
import { dataState, useView } from "../../view.ts"
import { WaitingProposal } from "../waiting-proposal.tsx"
import { LoadError, LoadingRows } from "./states.tsx"

/**
 * Goedkeuringen: every proposal an agent brought because its rule says _Eerst vragen_, by deadline.
 * The same items and the same decisions as Start's queue and the agent's page (`demo.ts`), so a yes
 * here is a yes there, and the menu's count follows. A decided proposal stays where it was, showing
 * what happened and the way back, so the list does not jump under the pointer.
 */
export function ApprovalsPage() {
  const view = useView()
  const demo = useDemo()
  const state = dataState(view)
  const support = useAccess("support")
  const agents = useAccess("automations")
  const canSee = support.view || agents.view
  const canDecide = support.edit || agents.edit
  const open = openProposals(demo)
  const items = APPROVALS.toSorted((a, b) => a.deadline - b.deadline)
  const firstOpen = items.find((a) => demo.decisions[a.id] === undefined)?.id

  const head = (
    <PageHead
      title="Goedkeuringen"
      meta={state === "ready" && canSee
        ? (
          <>
            <span className="figure">{open}</span> {open === 1 ? "wacht" : "wachten"}{" "}
            op je ja · wat je agents niet zelf mogen, leggen ze hier voor
          </>
        )
        : "Wat je agents niet zelf mogen, leggen ze hier voor"}
      actions={
        <Button size="sm" icon={<Sparkles />} onClick={() => navigate(paths.settings("ai/zelfstandigheid"))}>
          Zelfstandigheid
        </Button>
      }
    />
  )

  if (!canSee) {
    return (
      <Page width="text">
        {head}
        <Denied area="automations" what="de voorstellen van de agents" />
      </Page>
    )
  }
  if (state === "loading") {
    return (
      <Page width="text">
        {head}
        <LoadingRows rows={3} tall label="Voorstellen laden" />
      </Page>
    )
  }
  if (state === "error") {
    return (
      <Page width="text">
        {head}
        <LoadError what="Voorstellen" detail="GET /agents/proposals · 503 · req_19ac44" />
      </Page>
    )
  }
  if (state === "empty") {
    return (
      <Page width="text">
        {head}
        <EmptyState
          glyph={Check}
          title="Niets wacht op je ja"
          action={
            <Button onClick={() => navigate(paths.settings("ai/zelfstandigheid"))}>Zelfstandigheid instellen</Button>
          }
        >
          Staat een actie van een agent op Eerst vragen, dan legt hij hier een voorstel neer: een antwoord, een korting,
          een mail aan een leverancier. Jij voert het uit, past het aan of negeert het.
        </EmptyState>
      </Page>
    )
  }

  return (
    <Page width="record">
      {head}
      {!canDecide && <ReadOnlyNotice area="support" />}
      <ol className="flex flex-col gap-2">
        {items.map((item) => (
          <li
            key={item.id}
            className="grid gap-x-4 gap-y-1.5 py-2.5 sm:grid-cols-[7.5rem_minmax(0,1fr)] sm:gap-y-2 sm:py-3"
          >
            <When item={item} />
            {canDecide
              ? <WaitingProposal item={item} primary={item.id === firstOpen} />
              : <ReadOnlyProposal item={item} />}
          </li>
        ))}
      </ol>
      {open === 0 && (
        <p className="-mt-4 text-sm text-ink-2">
          Alles besloten. Wat de agents verder deden, staat in het{" "}
          <Link to={paths.log} className="text-ink underline-offset-2 hover:underline">logboek</Link>.
        </p>
      )}
      <Link
        to={paths.chargeback("CB-2291")}
        className="flex min-h-11 items-center gap-1 self-start rounded-sm text-sm text-ink-2 hover:text-ink"
      >
        Het bewijspakket voor chargeback #CB-2291 wacht ook op je: indienen kan alleen een persoon
        <ChevronRight size={14} className="shrink-0" />
      </Link>
    </Page>
  )
}

/** When it is needed and why it ranks there: a column beside the proposal, one line on a phone. */
function When({ item }: { readonly item: Approval }) {
  const hard = item.stakes === "hard"
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 pt-0.5 sm:flex-col sm:items-start sm:gap-1">
      <p className={cx("text-sm leading-tight", hard ? "font-semibold text-bad-ink" : "text-ink")}>
        vóór <span className="figure">{item.due}</span>
      </p>
      <p className={cx("text-xs", hard ? "font-medium text-bad-ink" : "text-ink-2")}>{item.because}</p>
    </div>
  )
}

/** The proposal as a role that may read it but not decide it sees it: the same words, no buttons. */
function ReadOnlyProposal({ item }: { readonly item: Approval }) {
  const demo = useDemo()
  const agent = AGENTS.find((a) => a.id === item.agentId)
  const decided = demo.decisions[item.id]
  return (
    <div className="grid gap-x-3 sm:grid-cols-[28px_minmax(0,1fr)]">
      <span className="hidden sm:flex">{agent !== undefined && <AgentAvatar glyph={agent.glyph} size={28} />}</span>
      <div className="flex min-w-0 flex-col gap-1.5">
        <p className="text-xs text-ink-3">
          {item.agent} · <span className="figure">{item.at}</span>
          {decided !== undefined && <>· {decided.state === "done" ? "uitgevoerd" : "genegeerd"}</>}
        </p>
        <p className="text-sm font-semibold text-pretty text-ink">{item.title}</p>
        <p className="text-sm text-pretty text-ink-2">{item.why}</p>
        <p className="rounded-md bg-well px-3 py-2.5 text-sm text-pretty text-ink-2">{item.draft}</p>
        <p className="text-xs text-ink-3">Gelezen: {item.read.join(", ")}</p>
      </div>
    </div>
  )
}
