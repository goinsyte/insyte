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
 */
import { spawnSync } from "node:child_process"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { cpus } from "node:os"
import { join, resolve } from "node:path"
import { bundleWorker } from "../infra/bundle.ts"
import { parseJsonc } from "./lib/jsonc.ts"
import { activeMs, budgetFor, checkStartup, type CpuProfile, median, STARTUP_BUDGETS } from "./lib/startup-rules.ts"

const RUNS = Number(process.env["STARTUP_RUNS"] ?? 7)
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

const measure = async (worker: Worker) => {
  const dir = join(OUT, worker)
  const script = join(dir, "script")
  const built = await bundleWorker(worker, script)

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

  const runs: Array<number> = []
  for (let i = 0; i <= RUNS; i++) {
    const profile = join(dir, `startup-${i}.cpuprofile`)
    wrangler(["check", "startup", "--worker", join(dir, "worker.bundle"), "--outfile", profile], dir)
    // The first run warms the disk and workerd's own caches; it is not counted.
    if (i > 0) runs.push(activeMs(JSON.parse(readFileSync(profile, "utf8")) as CpuProfile))
  }
  return runs
}

mkdirSync(OUT, { recursive: true })
// Runners differ in CPU, and so do their numbers and budgets: the log says which one measured.
const model = cpus()[0]?.model ?? "an unknown CPU"
console.log(`startup:check: on ${model} (${cpus().length} cores)`)
const errors: Array<string> = []
for (const worker of workers) {
  const runs = await measure(worker)
  const budget = budgetFor(STARTUP_BUDGETS[worker], model)
  console.log(
    `startup:check: ${worker}: fastest ${Math.min(...runs).toFixed(0)} ms, median ${
      median(runs).toFixed(0)
    } ms of CPU (${RUNS} runs: ${runs.map((r) => r.toFixed(0)).join(", ")}); budget ${budget.ms} ms${
      budget.cpu === undefined ? " (no budget for this CPU: the highest applies)" : ` on ${budget.cpu}`
    }`
  )
  errors.push(...checkStartup(worker, runs, budget.ms))
}
// On stdout like the measurements above, so a CI log shows them in order.
if (errors.length > 0) {
  console.log("\nstartup:check failed:")
  for (const e of errors) console.log(`  ${e}`)
  console.log("\nThe budget only goes down: make startup cheaper (ADR-0041), do not raise the budget.\n")
  process.exit(1)
}
