/*
 * The playground's walls (ADR-0029).
 *
 * Until MVP development starts, a `playground/*` branch may change the product demo and nothing
 * else: the screens, their fixtures and their tests. Tokens, the landing page, the brand book, the
 * root config, the ADRs and (later) the backend stay as they are, so the demo can be explored freely
 * and still merged without anyone re-reading the foundations.
 *
 *   bun scripts/scope.ts                 staged files (pre-commit)
 *   bun scripts/scope.ts --base origin/staging   everything on this branch since staging (pre-push, CI)
 *   ... --enforce                                apply the walls whatever the branch is called (CI, for a
 *                                                pull request opened by anyone outside the maintainers)
 *
 * On any branch that is not `playground/*` it passes without looking. CI passes `--branch`, since a
 * pull request is checked out detached.
 */
import { execFileSync } from "node:child_process"
import { ALLOW, DENY, inPlayground } from "./playground-paths.ts"

const git = (...args: string[]) => execFileSync("git", args, { encoding: "utf8" }).trim()

const arg = (name: string) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? undefined : process.argv[i + 1]
}

// `symbolic-ref`, not `rev-parse --abbrev-ref`: the latter fails on a branch with no commits yet.
const branch = arg("--branch") ?? git("symbolic-ref", "--short", "HEAD")
if (!process.argv.includes("--enforce") && !branch.startsWith("playground/")) process.exit(0)

const base = arg("--base")
const changed = (base
  ? git("diff", "--name-only", "--no-renames", `${base}...HEAD`)
  : git("diff", "--cached", "--name-only", "--no-renames"))
  .split("\n")
  .filter(Boolean)

const outside = changed.filter((f) => !inPlayground(f))

if (outside.length > 0) {
  console.error(`\n${branch} is a playground branch: it may change the product demo only.\n`)
  console.error("Outside the playground:")
  for (const f of outside) console.error(`  ${f}`)
  console.error(`\nAllowed: ${ALLOW.join(", ")} (not ${DENY.join(", ")}).`)
  console.error("Need one of these changed? Ask in the pull request; see docs/playground.md.\n")
  process.exit(1)
}
