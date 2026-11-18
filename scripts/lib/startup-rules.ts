/*
 * The startup budget per Worker (ADR-0041 §3), and the pure parts of `startup:check`. Cloudflare refuses a script
 * whose startup takes more than 1 s of CPU on its validator, which is several times slower than a CI runner, so a
 * Worker's startup gets a budget here and every pull request measures it (`scripts/startup-check.ts`).
 *
 * A budget only goes down. When a change makes startup cheaper, lower the budget in the same pull request, to the
 * new CI value plus the same headroom. Raising it needs a reason in the pull request, and the 1 s limit is the
 * ceiling: the deploy is what fails, not this check.
 *
 * Each budget is per CPU, because GitHub's ubuntu-24.04 runners come with different ones, and the same script starts
 * at different speeds on them: an EPYC 9V74 measured 0.74x an EPYC 7763 once (PR #135) and 0.90–0.97x later (staging,
 * 2026-11-13), so a CPU's budget is measured on that CPU, never scaled from another's. Runs on one runner agree within a few milliseconds, so the
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
  /**
   * The module the entry loads on its first request (`apps/api/src/platform/OnFirstRequest.ts`), by file name without
   * its extension, as rolldown names its chunk. Its Worker's startup graph may hold none of `HEAVY_AT_STARTUP`, and
   * the check also profiles the script with that chunk loaded at startup: the CPU the first request pays, without a
   * budget, and proof the app's modules evaluate before the script deploys.
   */
  readonly app?: string
}

export const STARTUP_BUDGETS = {
  // Lowered at PR #140, with the public API and MCP out (ADR-0041 step 5). EPYC 7763: 293 ms. EPYC 9V74 measured on
  // staging at dd04a38a6: 276 ms (its earlier 240 was scaled, not measured). Xeon 6975P-C: 193 ms (PR #141). An M1 Pro:
  // about 169 ms. Was 480 / 360 (PR #135: 439 ms on an EPYC 7763).
  api: {
    budgetMs: { "AMD EPYC 7763": 320, "AMD EPYC 9V74": 305, "Intel(R) Xeon(R) 6975P-C": 215 },
    wranglerConfig: "apps/api/wrangler.jsonc",
    app: "MainApp"
  },
  // The jobs Worker (ADR-0041 step 4), set at PR #139 (EPYC 7763: 180 ms). Raised at PR #140: it now also hosts
  // `LiveRoom` and `RateLimiter`, 188 ms on an EPYC 7763. EPYC 9V74 measured on staging at dd04a38a6: 182 ms. Xeon
  // 6975P-C: 131 ms (PR #141). An M1 Pro: about 108 ms. Its bindings file is the local Worker's, a superset of its own.
  jobs: {
    budgetMs: { "AMD EPYC 7763": 210, "AMD EPYC 9V74": 200, "Intel(R) Xeon(R) 6975P-C": 145 },
    wranglerConfig: "apps/api/wrangler.jsonc"
  },
  // The public Worker (ADR-0041 step 5), set at PR #140. EPYC 7763: 382 ms. EPYC 9V74 measured on staging at
  // dd04a38a6: 344 ms. Xeon 6975P-C: 240 ms (PR #141). An M1 Pro: about 192 ms. Every slice's public group and MCP
  // tools build at startup, so this is the one to watch as slices land.
  public: {
    budgetMs: { "AMD EPYC 7763": 420, "AMD EPYC 9V74": 380, "Intel(R) Xeon(R) 6975P-C": 265 },
    wranglerConfig: "apps/api/wrangler.jsonc",
    app: "PublicApp"
  }
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

/*
 * What a Worker with an `app` must not evaluate at startup. Its entry answers by loading the app on the first request,
 * so these only reach the startup graph through a static import of the app's code from the entry, or from a module the
 * entry imports. Each was the bulk of that startup before it moved (2026-11-18, the API Worker's 2.1 MB startup chunk):
 */
const HEAVY_AT_STARTUP: ReadonlyArray<{ readonly name: string; readonly source: RegExp }> = [
  // The runtime, the router, Schema, the RPC and MCP servers: a third of the startup chunk.
  { name: "effect", source: /(^|\/)node_modules\/(\.bun\/[^/]+\/node_modules\/)?(effect|@effect\/[^/]+)\// },
  // Every slice's use cases, the contracts (RPC, `/v1`, MCP tools), the domain and the adapters: the other two thirds.
  { name: "@insyte/* (packages/)", source: /(^|\/)packages\/[^/]+\/src\// },
  // The app and its layers themselves.
  { name: "the app's layer", source: /(^|\/)src\/(MainApp|PublicApp|platform\/(AppLayer|PublicLayer|Services))\.ts$/ }
]

/** The chunks an ES module loads before it runs: its static `import` and `export … from`, transitively, itself first. */
export const startupGraph = (entry: string, read: (file: string) => string | undefined): Array<string> => {
  const seen = new Set<string>()
  const visit = (file: string) => {
    if (seen.has(file)) return
    const code = read(file)
    if (code === undefined) return
    seen.add(file)
    // A static import or re-export of a sibling chunk; `import(` (a lazy chunk) does not match.
    for (
      const match of code.matchAll(/(?:^|[;}\s])(?:import|export)\s*(?:[\w$*{}\s,]*?from\s*)?["']\.\/([^"']+)["']/g)
    ) {
      visit(match[1]!)
    }
  }
  visit(entry)
  return [...seen]
}

/** The sources in a Worker's startup graph that `HEAVY_AT_STARTUP` lists, one error per kind with an example. */
export const checkStartupGraph = (worker: string, sources: ReadonlyArray<string>): Array<string> =>
  HEAVY_AT_STARTUP.flatMap(({ name, source }) => {
    const found = sources.filter((s) => source.test(s))
    return found.length === 0 ? [] : [
      `${worker}: its startup graph evaluates ${name} (${found.length} modules, e.g. ${
        found[0]
      }); the app loads on the first request (platform/OnFirstRequest.ts), so import it there, not from the entry`
    ]
  })

/** Above this, `startup-reported.ts` warns: Cloudflare's 1 s limit, less the noise between its validator machines. */
export const REPORTED_WARN_MS = 750

/** The part of a Workers version (`GET …/workers/workers/:name/versions`) `startup-reported.ts` reads. */
export interface ReportedVersion {
  readonly id: string
  readonly number?: number
  readonly created_on?: string
  readonly startup_time_ms?: number
}

/** The version uploaded last: the highest number, or the latest creation where there is no number. */
export const newestVersion = (versions: ReadonlyArray<ReportedVersion>): ReportedVersion | undefined =>
  versions.toSorted((a, b) =>
    (b.number ?? 0) - (a.number ?? 0) || (b.created_on ?? "").localeCompare(a.created_on ?? "")
  )[0]
