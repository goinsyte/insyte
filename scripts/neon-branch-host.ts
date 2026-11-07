/*
 * Prints the read-write host of a Neon branch, for the steps that follow a preview's deploy (migrations, smoke).
 *
 *   bun scripts/neon-branch-host.ts <branch name>      with NEON_API_KEY and NEON_PROJECT_ID set
 *
 * Reads Neon's API directly: no secret is printed, only the host.
 */
import { branchHost } from "./lib/neon.ts"

const name = process.argv[2]
if (name === undefined) {
  console.error("neon-branch-host: needs a branch name")
  process.exit(1)
}
try {
  console.log(await branchHost(name))
} catch (error) {
  console.error(`neon-branch-host: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
}
