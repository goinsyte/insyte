/*
 * The startup budget per Worker (ADR-0041 §3), and the pure parts of `startup:check`. Cloudflare refuses a script
 * whose startup takes more than 1 s of CPU on its validator, which is several times slower than a CI runner, so a
 * Worker's startup gets a budget here and every pull request measures it (`scripts/startup-check.ts`).
 *
 * A budget only goes down. When a change makes startup cheaper, lower the budget in the same pull request, to the
 * new CI value plus the same headroom. Raising it needs a reason in the pull request, and the 1 s limit is the
 * ceiling: the deploy is what fails, not this check.
 *
 * Each budget is per CPU, because GitHub's ubuntu-24.04 runners come with different ones and the same script starts
 * about 35 % faster on an EPYC 9V74 than on an EPYC 7763. Runs on one runner agree within a few milliseconds, so the
 * fastest of seven is a stable number for that CPU. A budget is the highest value seen on that CPU in CI (ci.yml's
 * `build` job), over a few runs of the same commit, plus about 10 %. On a CPU with no budget (a laptop, a new runner
 * type) the highest budget applies and the log says so; add the CPU when CI meets it. An M-series Mac measures about
 * 0.65x an EPYC 7763, so a local run is only a direction.
 */

export interface StartupBudget {
  /**
   * The fastest run's active CPU time (V8 samples minus idle, garbage collection included), in milliseconds, per CPU
   * model as `os.cpus()` names it (matched as a substring).
   */
  readonly budgetMs: Readonly<Record<string, number>>
  /** The wrangler config whose bindings and vars the profiled script gets; the bundle itself comes from infra. */
  readonly wranglerConfig: string
}

export const STARTUP_BUDGETS = {
  // Set at 112892868 (PR #135). EPYC 7763: 439, 441, 437 ms; EPYC 9V74: 324 ms. An M1 Pro: about 285 ms.
  api: { budgetMs: { "AMD EPYC 7763": 480, "AMD EPYC 9V74": 360 }, wranglerConfig: "apps/api/wrangler.jsonc" },
  // The jobs Worker (ADR-0041 step 4), set at PR #139. EPYC 7763: 180 ms; EPYC 9V74 not yet measured, scaled as the
  // API's is (about 0.74). An M1 Pro: about 112 ms. Its bindings file is the local Worker's, a superset of its own.
  jobs: { budgetMs: { "AMD EPYC 7763": 200, "AMD EPYC 9V74": 150 }, wranglerConfig: "apps/api/wrangler.jsonc" }
} as const satisfies Record<string, StartupBudget>

/** The budget for this CPU, or the highest one when the CPU has none (`cpu` is then undefined). */
export const budgetFor = (budget: StartupBudget, model: string): { readonly cpu?: string; readonly ms: number } => {
  const cpu = Object.keys(budget.budgetMs).find((key) => model.includes(key))
  return cpu === undefined ? { ms: Math.max(...Object.values(budget.budgetMs)) } : { cpu, ms: budget.budgetMs[cpu]! }
}

/** The part of a V8 `.cpuprofile` this check reads. */
export interface CpuProfile {
  readonly nodes: ReadonlyArray<{ readonly id: number; readonly callFrame: { readonly functionName: string } }>
  readonly samples?: ReadonlyArray<number>
  readonly timeDeltas?: ReadonlyArray<number>
}

/** CPU time spent in the profile, in milliseconds: every sample but `(idle)`, as wrangler's "Active" line counts it. */
export const activeMs = (profile: CpuProfile): number => {
  const names = new Map(profile.nodes.map((node) => [node.id, node.callFrame.functionName]))
  const samples = profile.samples ?? []
  let micros = 0
  for (const [i, delta] of (profile.timeDeltas ?? []).entries()) {
    if (names.get(samples[i] ?? 0) !== "(idle)") micros += delta
  }
  return micros / 1000
}

export const median = (values: ReadonlyArray<number>): number => {
  const sorted = values.toSorted((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2
}

/** The fastest run against the budget: noise on a shared runner only adds time, so the minimum is the stable value. */
export const checkStartup = (worker: string, runsMs: ReadonlyArray<number>, budgetMs: number): Array<string> => {
  const fastest = Math.min(...runsMs)
  return fastest > budgetMs
    ? [
      `${worker}: startup takes ${
        fastest.toFixed(0)
      } ms of CPU (fastest of ${runsMs.length}), over its ${budgetMs} ms budget`
    ]
    : []
}
