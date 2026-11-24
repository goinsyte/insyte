import { decide, editDraft, useDemo } from "../demo.ts"
import { AGENTS } from "../fixtures/agents.ts"
import type { Approval } from "../fixtures/home.ts"
import { ME } from "../fixtures/workspace.ts"
import { Link, paths } from "../router.tsx"
import { AgentAvatar } from "../ui/avatar.tsx"
import { Proposal } from "../ui/proposal.tsx"

const firstName = ME.name.split(" ")[0] ?? ME.name

/**
 * An agent's proposal that waits for a yes, as Start and the agent's own page both show it: the
 * same item and the same decision (the demo store), so approving it in one place approves it in the
 * other and the counts follow.
 */
export function WaitingProposal({ item, primary, fold = false, avatar = true }: {
  readonly item: Approval
  readonly primary: boolean
  readonly fold?: boolean
  /** Off on the agent's own page, where its disc already heads the page. */
  readonly avatar?: boolean
}) {
  const demo = useDemo()
  const decision = demo.decisions[item.id]
  const agent = AGENTS.find((a) => a.id === item.agentId)
  return (
    <div className={avatar ? "grid gap-x-3 sm:grid-cols-[28px_minmax(0,1fr)]" : "flex flex-col"}>
      {avatar && agent !== undefined && (
        <span className="hidden sm:flex">
          <AgentAvatar glyph={agent.glyph} size={28} />
        </span>
      )}
      <Proposal
        from={
          <>
            {avatar
              ? (
                <Link to={paths.agent(item.agentId)} className="truncate font-medium text-ink-2 hover:underline">
                  {item.agent}
                </Link>
              )
              : (
                <span className="truncate">
                  Voorgesteld om <span className="figure">{item.at}</span>
                </span>
              )}
            {avatar ? <span className="figure shrink-0">{item.at}</span> : (
              <span className="shrink-0">
                · nodig vóór <span className="figure">{item.due}</span>
              </span>
            )}
          </>
        }
        title={item.title}
        body={item.why}
        read={item.read}
        draft={item.draft}
        state={decision?.state ?? "open"}
        decidedAt={decision?.at}
        onChange={(next) => decide(item.id, next)}
        primary={primary}
        sends={item.sends === true}
        doneBy={firstName}
        fold={fold}
        edit={demo.drafts[item.id]}
        onEdit={(text) => editDraft(item.id, text)}
      />
    </div>
  )
}
