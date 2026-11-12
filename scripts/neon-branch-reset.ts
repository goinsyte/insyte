/*
 * Resets a preview's Neon branch to its parent (`preview-base`) before the preview is migrated.
 *
 *   bun scripts/neon-branch-reset.ts <branch name>      with NEON_API_KEY and NEON_PROJECT_ID set
 *
 * Why: the migrator only applies migrations numbered above the newest one a database has recorded. A pull request's
 * branch keeps the migration it applied on its first run, so when an earlier-numbered migration later lands on staging
 * and is merged into the pull request, the branch refuses it ("Not recorded after migrating"). Previews are throwaway:
 * every run starts again from `preview-base` (staging's schema and the scenario workspaces) and migrates up from there.
 *
 * Only branches named `pr-<n>` are ever reset, so a mistyped name can never reach `preview-base`, `main` or production.
 * Prints the branch name and the parent it was reset to, never a secret.
 */
import { neonApi } from "./lib/neon.ts"

const name = process.argv[2]
if (name === undefined || !/^pr-\d+$/.test(name)) {
  console.error("neon-branch-reset: needs a branch named pr-<n>")
  process.exit(1)
}

type Branch = { id: string; name: string; parent_id?: string }
type Operation = { id: string; status: string }

try {
  const { branches } = await neonApi<{ branches: Array<Branch> }>(`/branches?search=${encodeURIComponent(name)}`)
  const branch = branches.find((b) => b.name === name)
  if (branch === undefined) throw new Error(`no branch named ${name}`)
  if (branch.parent_id === undefined) throw new Error(`${name} has no parent`)
  const parent = await neonApi<{ branch: Branch }>(`/branches/${branch.parent_id}`)
  if (parent.branch.name !== "preview-base") {
    throw new Error(`${name}'s parent is ${parent.branch.name}, not preview-base: not resetting`)
  }
  const { operations } = await neonApi<{ operations: Array<Operation> }>(`/branches/${branch.id}/restore`, {
    method: "POST",
    body: JSON.stringify({ source_branch_id: branch.parent_id })
  })
  // The compute restarts on the reset data; wait for Neon to finish before the migrator connects.
  const deadline = Date.now() + 5 * 60_000
  for (const op of operations) {
    for (;;) {
      const { operation } = await neonApi<{ operation: Operation }>(`/operations/${op.id}`)
      if (operation.status === "finished" || operation.status === "skipped") break
      if (operation.status === "failed" || operation.status === "error" || operation.status === "cancelled") {
        throw new Error(`reset operation ${operation.status}`)
      }
      if (Date.now() > deadline) throw new Error("reset did not finish within 5 minutes")
      await new Promise((resolve) => setTimeout(resolve, 3_000))
    }
  }
  console.log(`neon-branch-reset: ${name} reset to preview-base`)
} catch (error) {
  console.error(`neon-branch-reset: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
}
