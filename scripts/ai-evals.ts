/*
 * Insyte AI's evals against the model (M15 step 1; ai.md §7): every case in `packages/modules/src/ai/evals/Evals.ts`,
 * through the same adapter and AI Gateway the Worker uses, graded as CI grades the fake. A prompt's new version ships
 * when this passes. It costs real money (a few cents a run) and never runs in CI. Run it yourself, with the stage's
 * values in the environment; none is printed:
 *
 *   ANTHROPIC_API_KEY=… AI_GATEWAY_ID=… AI_ACCOUNT_ID=… [AI_GATEWAY_TOKEN=…] bun run ai:evals [case filter]
 */
import { CASES, grade } from "@insyte/modules/ai/evals/Evals"
import { generate } from "@insyte/modules/ai/use-cases/call"
import { Effect, Exit, Redacted } from "effect"
import { LanguageModel } from "effect/ai"
import { makeAnthropic } from "../packages/integrations/anthropic/src/Anthropic.ts"

const need = (name: string) => {
  const value = process.env[name]
  if (value === undefined || value === "") {
    console.error(`ai:evals: set ${name} for this command (see the header).`)
    process.exit(1)
  }
  return value
}

const token = process.env["AI_GATEWAY_TOKEN"]
const config = {
  apiKey: Redacted.make(need("ANTHROPIC_API_KEY")),
  gatewayId: need("AI_GATEWAY_ID"),
  accountId: need("AI_ACCOUNT_ID"),
  gatewayToken: token === undefined || token === "" ? undefined : Redacted.make(token)
}
const filter = process.argv[2] ?? ""

const program = Effect.gen(function*() {
  const model = yield* makeAnthropic(config)
  let failed = 0
  for (const c of CASES.filter((one) => one.name.includes(filter))) {
    const { exit, latencyMs } = yield* generate(c.prompt, c.input).pipe(
      Effect.provideService(LanguageModel.LanguageModel, model)
    )
    if (Exit.isFailure(exit)) {
      failed++
      console.log(`✗ ${c.name}: the model did not answer (${latencyMs} ms)`)
      continue
    }
    const faults = grade(c, exit.value.value)
    const usage = exit.value.usage
    const tokens = `${usage.inputTokens.total ?? 0} in, ${usage.outputTokens.total ?? 0} out`
    if (faults.length > 0) failed++
    console.log(`${faults.length === 0 ? "✓" : "✗"} ${c.name} (${latencyMs} ms, ${tokens})`)
    for (const f of faults) console.log(`    ${f}`)
  }
  return failed
})

const failed = await Effect.runPromise(program)
process.exit(failed === 0 ? 0 : 1)
