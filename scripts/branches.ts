/*
 * The branch model (docs/branches.md).
 *
 * Work happens on short-lived `<type>/<topic>` branches that merge into `staging`. `main` is production
 * and takes only a release (`staging`) or a hotfix (`hotfix/*`). After a hotfix, `main` goes back into
 * `staging` through a `chore/back-merge-*` branch, never as `main` itself: the repo deletes a pull
 * request's head branch on merge, and only the default branch (`staging`) is spared.
 *
 *   bun scripts/branches.ts                                  the current branch's name (pre-push)
 *   bun scripts/branches.ts --branch <head> --base <base>    a pull request (CI)
 *
 * Neither long-lived branch is pushed to directly, so pushing from `main` or `staging` fails here too.
 */
import { execFileSync } from "node:child_process"

const TYPES = ["feat", "fix", "hotfix", "refactor", "perf", "test", "docs", "ci", "chore", "playground", "renovate"]
const LONG_LIVED = new Set(["main", "staging"])
const NAME = new RegExp(`^(${TYPES.join("|")})/[a-z0-9][a-z0-9._/-]*$`)

const arg = (name: string) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? undefined : process.argv[i + 1]
}

const fail = (message: string) => {
  console.error(`\n${message}\nSee docs/branches.md.\n`)
  process.exit(1)
}

// `symbolic-ref`, not `rev-parse --abbrev-ref`: the latter fails on a branch with no commits yet.
const head = arg("--branch") ?? execFileSync("git", ["symbolic-ref", "--short", "HEAD"], { encoding: "utf8" }).trim()
const base = arg("--base")

if (base === undefined) {
  if (LONG_LIVED.has(head)) fail(`${head} is not pushed to directly: open a pull request from a branch.`)
} else if (base === "main") {
  if (head !== "staging" && !head.startsWith("hotfix/")) {
    fail(`Only a release (staging) or a hotfix/* branch merges into main, not ${head}. Target staging instead.`)
  }
} else if (head === "main") {
  fail("main is never a pull request's head: merging would delete it. Branch chore/back-merge-<date> from main.")
}

if (!LONG_LIVED.has(head) && !NAME.test(head)) {
  fail(`${head} does not follow <type>/<topic>, lowercase. Types: ${TYPES.join(", ")}.`)
}
