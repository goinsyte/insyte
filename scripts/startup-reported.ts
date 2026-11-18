/*
 * Each Worker's startup CPU as Cloudflare measured it, for the version a deploy just uploaded (ADR-0041 §3).
 *
 *   bun scripts/startup-reported.ts <stage>      with CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID set
 *
 * `startup:check` measures on a CI runner, a stand-in; Cloudflare refuses a version whose startup takes more than 1 s
 * of CPU on its validator, which for the same code varies up to 2.5x between deploys. This reads the real number
 * (`startup_time_ms` of the newest version, Workers versions API) and warns above `REPORTED_WARN_MS`. It never fails
 * the deploy: a deploy over the limit has already failed, and this only watches the margin. Only the numbers are
 * printed.
 */
import { newestVersion, REPORTED_WARN_MS, type ReportedVersion } from "./lib/startup-rules.ts"

const stage = process.argv[2]
const token = process.env["CLOUDFLARE_API_TOKEN"]
const account = process.env["CLOUDFLARE_ACCOUNT_ID"]
if (stage === undefined || token === undefined || account === undefined) {
  console.log("::warning::startup-reported: needs a stage, CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID")
  process.exit(0)
}

for (const worker of ["api", "public", "jobs"]) {
  const name = `insyte-${worker}-${stage}`
  try {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${account}/workers/workers/${name}/versions?per_page=10`,
      { headers: { authorization: `Bearer ${token}` } }
    )
    const body = (await response.json()) as { success?: boolean; result?: ReadonlyArray<ReportedVersion> }
    const version = response.ok && body.success === true ? newestVersion(body.result ?? []) : undefined
    if (version?.startup_time_ms === undefined) {
      console.log(`::warning::startup-reported: ${name}: no startup time in the versions API (HTTP ${response.status})`)
      continue
    }
    const line = `${name}: startup ${version.startup_time_ms} ms of CPU on Cloudflare (version ${
      version.number ?? version.id
    }; the limit is 1000 ms)`
    console.log(
      version.startup_time_ms > REPORTED_WARN_MS
        ? `::warning::startup-reported: ${line}, over ${REPORTED_WARN_MS} ms`
        : line
    )
  } catch (error) {
    console.log(`::warning::startup-reported: ${name}: ${error instanceof Error ? error.message : String(error)}`)
  }
}
