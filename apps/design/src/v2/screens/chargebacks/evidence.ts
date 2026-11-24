import { casesNow, changeCase, evidencePlan, findCase } from "../../fixtures/chargebacks.ts"

/*
 * The Chargeback-assistent putting a pack together on request: it finds the documents one by one
 * (the order, the carrier, the mails), then writes the answer from them. Nothing goes to the provider;
 * the pack waits on the case for a person to check and submit.
 */

const AGENT = { agentId: "chargebacks", agent: "Chargeback-assistent" }
const STEP_MS = 420

/** Build a case's pack; `onStep` hears how many documents are in. Returns a way to stop it midway. */
export function buildPack(id: string, onStep?: (done: number, total: number) => void): () => void {
  const c = findCase(id)
  if (c === undefined) return () => {}
  const plan = evidencePlan(c)
  const total = plan.files.length
  const timers: Array<ReturnType<typeof setTimeout>> = []
  plan.files.forEach((file, i) => {
    timers.push(globalThis.setTimeout(() => {
      changeCase(id, (cur) => ({ files: [...cur.files.filter((f) => f.id !== file.id), file] }))
      onStep?.(i + 1, total)
    }, STEP_MS * (i + 1)))
  })
  timers.push(globalThis.setTimeout(() => {
    const at = casesNow()
    changeCase(id, (cur) => ({
      statement: cur.statement.trim() === "" ? plan.statement : cur.statement,
      draftedBy: { ...AGENT, at },
      events: [...cur.events, {
        at,
        who: AGENT.agent,
        text: `Bewijspakket opgesteld · ${total} documenten en een verweer; indienen wacht op jou`
      }]
    }))
    onStep?.(total + 1, total)
  }, STEP_MS * (total + 1)))
  return () => {
    for (const t of timers) globalThis.clearTimeout(t)
  }
}

/** How many documents the assistant will look for on this case. */
export const packSize = (id: string) => {
  const c = findCase(id)
  return c === undefined ? 0 : evidencePlan(c).files.length
}
