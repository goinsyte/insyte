import { describe, expect, it } from "vitest"
import { canUndo, ranUnder } from "../src/app/lib/agent-log.ts"
import {
  budgetState,
  CATALOGUE,
  decide,
  DEFAULT_POLICY,
  describePolicy,
  diffPolicy,
  normalise,
  UNDO_WINDOW_MS
} from "../src/app/lib/autonomy.ts"

/**
 * ADR-0027's rules as tests: the defaults ask, a locked action never runs, a spent budget turns
 * everything into a proposal, and the agent never exceeds the person it acts for.
 */
describe("decide", () => {
  it("asks first for every action by default", () => {
    for (const e of CATALOGUE) expect(decide(DEFAULT_POLICY, e.id)).toBe("propose")
  })

  it("runs an action set to Zelf doen and proposes it again when set back", () => {
    const policy = { ...DEFAULT_POLICY, AssignTicket: "auto" as const }
    expect(decide(policy, "AssignTicket")).toBe("run")
    expect(decide({ ...policy, AssignTicket: "ask" }, "AssignTicket")).toBe("propose")
  })

  it("refuses a Nooit action", () => {
    expect(decide({ ...DEFAULT_POLICY, PostChatMessage: "never" }, "PostChatMessage")).toBe("refuse")
  })

  it("never runs a locked action, whatever the stored level says", () => {
    for (const id of ["RefundOrder", "SubmitEvidence", "AcceptDispute", "CancelOrder"] as const) {
      expect(decide({ ...DEFAULT_POLICY, [id]: "auto" }, id)).toBe("propose")
    }
  })

  it("proposes everything once the workspace budget is spent", () => {
    expect(decide({ ...DEFAULT_POLICY, AssignTicket: "auto" }, "AssignTicket", { budgetSpent: true })).toBe("propose")
  })

  it("refuses what the person it acts for may not do", () => {
    expect(decide({ ...DEFAULT_POLICY, AssignTicket: "auto" }, "AssignTicket", { personMay: false })).toBe("refuse")
  })
})

describe("the policy", () => {
  it("normalises a stored policy: unknown values dropped, locked rows held at Eerst vragen", () => {
    const p = normalise({ RefundOrder: "auto", AssignTicket: "auto", Bogus: "auto", AddNote: "sometimes" as never })
    expect(p.RefundOrder).toBe("ask")
    expect(p.AssignTicket).toBe("auto")
    expect(p.AddNote).toBe("ask")
    expect(Object.keys(p)).toHaveLength(CATALOGUE.length)
  })

  it("diffs two policies row by row, with the direction", () => {
    const changes = diffPolicy(DEFAULT_POLICY, { ...DEFAULT_POLICY, AssignTicket: "auto", PostChatMessage: "never" })
    expect(changes.map((c) => [c.id, c.more])).toEqual([["AssignTicket", true], ["PostChatMessage", false]])
  })

  it("says the default in plain Dutch", () => {
    expect(describePolicy(DEFAULT_POLICY)[0]).toMatch(/doet niets op eigen houtje/)
  })
})

describe("spend", () => {
  it("warns from 80% and stops at 100%", () => {
    expect(budgetState(38, 120)).toBe("ok")
    expect(budgetState(17, 20)).toBe("warn")
    expect(budgetState(20, 20)).toBe("spent")
    expect(budgetState(999, null)).toBe("ok")
  })
})

describe("the log", () => {
  const effect = { kind: "note" as const, target: "tkt_4000" }
  it("can be undone only inside the window", () => {
    const now = 1_000_000
    expect(canUndo({ status: "done", effect, undoUntil: now + 1 }, now)).toBe(true)
    expect(canUndo({ status: "done", effect, undoUntil: now }, now)).toBe(false)
    expect(canUndo({ status: "undone", effect, undoUntil: now + UNDO_WINDOW_MS }, now)).toBe(false)
    expect(canUndo({ status: "done", undoUntil: now + 1 }, now)).toBe(false)
  })

  it("names the setting a row ran under", () => {
    expect(ranUnder({ level: "auto" })).toBe("Zelf doen")
    expect(ranUnder({ level: "ask", approvedBy: "Elena Hart" })).toBe("Na goedkeuring van Elena Hart")
  })
})
