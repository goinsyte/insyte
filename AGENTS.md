# Agents

## Playground branches

If the current branch is `playground/*` (`git rev-parse --abbrev-ref HEAD`), or this checkout is the playground fork
(`origin` is `goinsyte/insyte-playground`), change only:

- `packages/ui/src/app/**` (not `marketing-sections/`)
- `apps/design/src/app/**`
- `apps/design/public/**`
- `packages/ui/test/**`

Do not edit, add dependencies to, or "fix" anything else. That includes tokens, shared components in
`packages/ui/src/{ui,components,lib}`, any `package.json` or lockfile, config, `docs/`, `DESIGN.md` and
`PRODUCT.md`. When the work seems to need such a change, stop, say so, and write it down as a request for
the pull request. `bun scripts/scope.ts` enforces this on commit and push; never bypass it with
`--no-verify`. Details: `docs/playground.md`.
