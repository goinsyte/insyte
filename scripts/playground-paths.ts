/*
 * What the playground may change: the product demo's screens, their fixtures and their tests.
 *
 * One list, read by the commit and push hooks and CI (`scripts/scope.ts`) and by the Claude Code guard
 * (`.claude/hooks/playground-guard.ts`), so the three can never disagree.
 */

export const ALLOW = [
  "apps/design/src/app/",
  "apps/design/public/",
  "packages/ui/src/app/",
  "packages/ui/test/"
]

/** Inside the allowed folders, still not the playground's: the marketing site's sections. */
export const DENY = ["packages/ui/src/app/marketing-sections/"]

/** `path` is relative to the repository root, with forward slashes. */
export const inPlayground = (path: string) =>
  ALLOW.some((a) => path.startsWith(a)) && !DENY.some((d) => path.startsWith(d))
