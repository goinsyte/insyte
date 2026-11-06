/*
 * The playground's walls, for Claude Code: refuses an edit outside the product demo before it is made.
 *
 * Active in a fork (the `origin` remote is not goinsyte/insyte) and on any `playground/*` branch; silent
 * otherwise, so maintainers' sessions are not affected. A convenience on top of the real walls (the fork,
 * review, and the `scope` check in CI): other tools ignore it.
 *
 * Claude Code runs it before Edit, Write, MultiEdit and NotebookEdit (file path checked) and before Bash
 * (hook bypasses refused). Exit 2 blocks the tool call and shows the message to the agent.
 */
import { execFileSync } from "node:child_process"
import { relative, resolve } from "node:path"
import { inPlayground } from "../../scripts/playground-paths.ts"

const git = (...args: string[]) => {
  try {
    return execFileSync("git", args, { encoding: "utf8" }).trim()
  } catch {
    return ""
  }
}

const root = process.env.CLAUDE_PROJECT_DIR ?? git("rev-parse", "--show-toplevel")
const branch = git("symbolic-ref", "--short", "HEAD")
const origin = git("remote", "get-url", "origin")
const active = branch.startsWith("playground/") || !/goinsyte\/insyte(\.git)?$/.test(origin)
if (!active) process.exit(0)

const input = JSON.parse(await new Response(Bun.stdin.stream()).text()) as {
  tool_name: string
  tool_input: { file_path?: string; notebook_path?: string; command?: string }
}

const refuse = (why: string) => {
  console.error(
    `${why}\nThis checkout works on the product demo only (docs/playground.md). Write the request in the pull request instead.`
  )
  process.exit(2)
}

if (input.tool_name === "Bash") {
  const command = input.tool_input.command ?? ""
  if (/--no-verify|\bcore\.hooksPath\b|lefthook\s+uninstall|\.git\/hooks/.test(command)) {
    refuse("Skipping or changing the git hooks is not allowed here.")
  }
  process.exit(0)
}

const target = input.tool_input.file_path ?? input.tool_input.notebook_path
if (!target) process.exit(0)
const path = relative(root, resolve(root, target)).split("\\").join("/")
if (path.startsWith("..")) process.exit(0)
if (!inPlayground(path)) refuse(`${path} is outside the product demo.`)
