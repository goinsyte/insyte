/*
 * Each Worker's startup CPU against its budget in `lib/startup-rules.ts` (ADR-0041 §3).
 *
 *   bun run startup:check          (every Worker with a budget; `bun run startup:check api` for one)
 *
 * It measures the script that deploys, not wrangler's: `infra/bundle.ts` bundles the Worker with alchemy's own
 * bundler and the props `infra/app.ts` deploys. (wrangler's esbuild bundle, the one `wrangler dev` and a plain
 * `wrangler check startup` use, starts about 170 ms slower, from `Effect.fn` definition stacks: PR #135.) wrangler
 * then packages that bundle as it is (`no_bundle`) with the Worker's bindings, and `wrangler check startup` profiles
 * its module evaluation in workerd, once to warm up and then RUNS times. The fastest run is compared with the budget.
 *
 * A Worker that loads its app on the first request (`app` in `lib/startup-rules.ts`) is checked twice more: its
 * startup graph (the chunks the entry imports statically) may hold none of `HEAVY_AT_STARTUP`, and the same script
 * with the app's chunk imported up front is profiled APP_RUNS times. That is the CPU its first request pays, shown
 * without a budget, and it proves the app's modules evaluate, as Cloudflare's validator proved them before they moved.
 */
import { spawnSync } from "node:child_process"
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { cpus } from "node:os"
import { join, resolve } from "node:path"
import { bundleWorker } from "../infra/bundle.ts"
import { parseJsonc } from "./lib/jsonc.ts"
import {
  activeMs,
  budgetFor,
  checkStartup,
  checkStartupGraph,
  type CpuProfile,
  median,
  STARTUP_BUDGETS,
  type StartupBudget,
  startupGraph
} from "./lib/startup-rules.ts"

const RUNS = Number(process.env["STARTUP_RUNS"] ?? 7)
const APP_RUNS = Number(process.env["STARTUP_APP_RUNS"] ?? 3)
const WRANGLER = resolve("apps/api/node_modules/.bin/wrangler")
const OUT = resolve(".wrangler/startup-check")

type Worker = keyof typeof STARTUP_BUDGETS
const all = Object.keys(STARTUP_BUDGETS) as Array<Worker>
const asked = process.argv.slice(2)
const unknown = asked.filter((w) => !all.includes(w as Worker))
if (unknown.length > 0) {
  console.error(`startup:check: no budget for ${unknown.join(", ")} (known: ${all.join(", ")})`)
  process.exit(1)
}
const workers = asked.length > 0 ? (asked as Array<Worker>) : all

const wrangler = (args: ReadonlyArray<string>, cwd: string) => {
  const run = spawnSync(WRANGLER, args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, WRANGLER_SEND_METRICS: "false", NO_COLOR: "1" }
  })
  if (run.status !== 0) {
    console.error(`startup:check: wrangler ${args.join(" ")} failed:\n${run.stdout}${run.stderr}`)
    process.exit(1)
  }
}

/** The profiled runs of one packaged script, after one to warm up. */
const profile = (dir: string, bundle: string, name: string, runs: number) => {
  const times: Array<number> = []
  for (let i = 0; i <= runs; i++) {
    const out = join(dir, `${name}-${i}.cpuprofile`)
    wrangler(["check", "startup", "--worker", join(dir, bundle), "--outfile", out], dir)
    // The first run warms the disk and workerd's own caches; it is not counted.
    if (i > 0) times.push(activeMs(JSON.parse(readFileSync(out, "utf8")) as CpuProfile))
  }
  return times
}

/** The sources of the chunks the entry loads at startup, from their source maps. */
const startupSources = (script: string, main: string) =>
  startupGraph(main, (file) => {
    const path = join(script, file)
    return existsSync(path) ? readFileSync(path, "utf8") : undefined
  }).flatMap((file) => {
    const map = join(script, `${file}.map`)
    return existsSync(map) ? (JSON.parse(readFileSync(map, "utf8")) as { sources: Array<string> }).sources : []
  })

const measure = async (worker: Worker) => {
  const dir = join(OUT, worker)
  const script = join(dir, "script")
  const built = await bundleWorker(worker, script)
  const rules: StartupBudget = STARTUP_BUDGETS[worker]

  // The Worker's bindings and vars from its wrangler config, around the bundle as built. The bindings workerd cannot
  // run locally (Durable Objects, Workflows, Hyperdrive) are left out of the profile, and with any of them present
  // wrangler fails the run when module evaluation throws, instead of profiling a script that never started. The probe
  // binding is there so that holds for every Worker.
  const config = parseJsonc(readFileSync(STARTUP_BUDGETS[worker].wranglerConfig, "utf8")) as Record<string, unknown>
  const { $schema: _schema, dev: _dev, services, ...bindings } = config
  writeFileSync(
    join(script, "wrangler.json"),
    JSON.stringify({
      ...bindings,
      main: built.main,
      compatibility_date: built.compatibility.date,
      compatibility_flags: built.compatibility.flags,
      no_bundle: true,
      find_additional_modules: true,
      rules: [{ type: "ESModule", globs: ["**/*.js"] }],
      services: [
        ...(Array.isArray(services) ? services : []),
        { binding: "STARTUP_CHECK_PROBE", service: "startup-check-probe" }
      ]
    })
  )
  wrangler(["deploy", "--dry-run", "--outfile", join(dir, "worker.bundle")], script)
  const runs = profile(dir, "worker.bundle", "startup", RUNS)
  if (rules.app === undefined) return { runs }

  const graph = checkStartupGraph(worker, startupSources(script, built.main))
  // The same chunks, with the app's imported before the entry: what the entry's first request loads.
  const chunks = readdirSync(script).filter((file) => new RegExp(`^${rules.app}-[\\w-]+\\.js$`).test(file))
  if (chunks.length !== 1) {
    return {
      runs,
      errors: [...graph, `${worker}: no single chunk for its app ${rules.app} (found ${chunks.join(", ")})`]
    }
  }
  writeFileSync(
    join(script, "startup-check-first-request.js"),
    `import "./${chunks[0]}"\nexport { default } from "./${built.main}"\n`
  )
  const packaged = join(script, "wrangler.json")
  writeFileSync(
    packaged,
    JSON.stringify({ ...JSON.parse(readFileSync(packaged, "utf8")), main: "startup-check-first-request.js" })
  )
  wrangler(["deploy", "--dry-run", "--outfile", join(dir, "first-request.bundle")], script)
  return { runs, errors: graph, firstRequest: profile(dir, "first-request.bundle", "first-request", APP_RUNS) }
}

mkdirSync(OUT, { recursive: true })
// Runners differ in CPU, and so do their numbers and budgets: the log says which one measured.
const model = cpus()[0]?.model ?? "an unknown CPU"
console.log(`startup:check: on ${model} (${cpus().length} cores)`)
const errors: Array<string> = []
const shown = (runs: ReadonlyArray<number>) =>
  `fastest ${Math.min(...runs).toFixed(0)} ms, median ${median(runs).toFixed(0)} ms of CPU (${runs.length} runs: ${
    runs.map((r) => r.toFixed(0)).join(", ")
  })`
for (const worker of workers) {
  const { runs, errors: graph = [], firstRequest } = await measure(worker)
  const budget = budgetFor(STARTUP_BUDGETS[worker], model)
  console.log(
    `startup:check: ${worker}: ${shown(runs)}; budget ${budget.ms} ms${
      budget.cpu === undefined ? " (no budget for this CPU: the highest applies)" : ` on ${budget.cpu}`
    }`
  )
  if (firstRequest !== undefined) {
    console.log(`startup:check: ${worker}, its app loaded as on the first request: ${shown(firstRequest)}; no budget`)
  }
  errors.push(...checkStartup(worker, runs, budget.ms), ...graph)
}
// On stdout like the measurements above, so a CI log shows them in order.
if (errors.length > 0) {
  console.log("\nstartup:check failed:")
  for (const e of errors) console.log(`  ${e}`)
  console.log("\nThe budget only goes down: make startup cheaper (ADR-0041), do not raise the budget.\n")
  process.exit(1)
}
