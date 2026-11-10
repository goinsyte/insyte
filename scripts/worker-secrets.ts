/*
 * The API Worker's secrets onto a stage's Worker, `insyte-api-<stage>`, in one `wrangler secret bulk`:
 *
 *   bun --env-file ~/vantion/insyte/.env.staging scripts/worker-secrets.ts staging
 *
 * The names are `WORKER_SECRETS` (infra/stages.ts); a name the environment leaves out or empty is left as it is on the
 * Worker. The values go to wrangler on stdin and are never printed: the script says which names it sent and which it
 * did not have. A deploy never touches these again (alchemy leaves a secret it did not upload alone).
 */
import { spawnSync } from "node:child_process"
import { WORKER_SECRETS } from "../infra/stages.ts"

const stage = process.argv[2]
if (stage !== "staging" && stage !== "production") {
  console.error("worker-secrets: name the stage, staging or production")
  process.exit(1)
}

const values = Object.fromEntries(
  WORKER_SECRETS.flatMap((name) => {
    const value = process.env[name]
    return value === undefined || value === "" ? [] : [[name, value]]
  })
)
const sent = Object.keys(values)
const missing = WORKER_SECRETS.filter((name) => !sent.includes(name))
if (sent.length === 0) {
  console.log(`worker-secrets: none of ${WORKER_SECRETS.join(", ")} is set; nothing sent`)
  process.exit(0)
}

const run = spawnSync("bunx", ["wrangler", "secret", "bulk", "--name", `insyte-api-${stage}`], {
  cwd: new URL("../apps/api", import.meta.url).pathname,
  input: JSON.stringify(values),
  stdio: ["pipe", "inherit", "inherit"],
  env: process.env
})
if (run.status !== 0) process.exit(run.status ?? 1)
console.log(`worker-secrets: sent ${sent.join(", ")} to insyte-api-${stage}`)
if (missing.length > 0) console.log(`worker-secrets: not set here, left as they are: ${missing.join(", ")}`)
