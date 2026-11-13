/*
 * The startup budget per Worker (ADR-0041 §3), and the pure parts of `startup:check`. Cloudflare refuses a script
 * whose startup takes more than 1 s of CPU on its validator, which is several times slower than a CI runner, so a
 * Worker's startup gets a budget here and every pull request measures it (`scripts/startup-check.ts`).
 *
 * A budget only goes down. When a change makes startup cheaper, lower the budget in the same pull request, to the
 * new CI value plus the same headroom. Raising it needs a reason in the pull request, and the 1 s limit is the
 * ceiling: the deploy is what fails, not this check.
 *
 * How the numbers were set: `startup:check` on GitHub's ubuntu-24.04 runners, the fastest of seven runs, over several
 * CI runs of the same commit (the pull request that added the check). The budget is the highest of those values plus
 * about 15 % for the runners' noise. On an M-series Mac the same bundle takes about 0.8x the CI value.
 */

export interface StartupBudget {
  /** The fastest run's active CPU time (V8 samples minus idle, garbage collection included), in milliseconds. */
  readonly budgetMs: number
  /** The wrangler config whose bindings and vars the profiled script gets; the bundle itself comes from infra. */
  readonly wranglerConfig: string
}

export const STARTUP_BUDGETS = {
  // CI: 219, 226, 224 ms (fastest of seven, three runs). Mac: about 190 ms.
  api: { budgetMs: 260, wranglerConfig: "apps/api/wrangler.jsonc" }
} as const satisfies Record<string, StartupBudget>

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
