/**
 * Writes `src/tokens.css` from `src/tokens.ts`.
 *
 * `--check` compares instead of writing, which is what CI and `bun run check:css` use: a generated
 * file that can drift from its source is a second source of truth wearing a "do not edit" comment.
 */
import { readFile, writeFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"

import { renderCss } from "./src/css.ts"

// `node:fs` rather than `Bun.*`: this file is typechecked by the tools project, whose `types` are
// node only. One less type package to carry for a thirty-line script.
const target = fileURLToPath(new URL("./src/tokens.css", import.meta.url))
const rendered = renderCss()

if (process.argv.includes("--check")) {
  const existing = await readFile(target, "utf8").catch(() => null)

  if (existing === null) {
    console.error("src/tokens.css does not exist. Run `bun build.ts`.")
    process.exit(1)
  }
  if (existing !== rendered) {
    console.error("src/tokens.css is out of date with src/tokens.ts. Run `bun build.ts`.")
    process.exit(1)
  }
  console.log("src/tokens.css is up to date.")
} else {
  await writeFile(target, rendered)
  console.log(`Wrote ${target}`)
}
