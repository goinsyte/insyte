# Agents

## Branches

Never commit to `main` or `staging`. Branch from `staging` as `<type>/<topic>` (`feat/`, `fix/`, `ci/`, `docs/`,
`chore/`, `refactor/`, `test/`, `perf/`; `hotfix/` from `main` only for production) and open the pull request into
`staging`. Details: `docs/branches.md`.

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

## Dev shell

`flake.nix` is the toolchain: Bun at the version `.bun-version` names (CI's `setup-bun` reads the same file), Node 22
for wrangler and alchemy, `psql` 18, `gh` and `jq`. With direnv and nix-direnv it loads on `cd` (`.envrc`); without,
`nix develop`. Everything else (wrangler, workerd, alchemy, dprint, oxlint, lefthook) comes from `bun install`, and
Postgres runs in Docker: `bun run db:up`, then `bun run db:migrate --local`. Bumping Bun means `.bun-version`,
`packageManager` and the release's four hashes in `flake.nix`, together.
