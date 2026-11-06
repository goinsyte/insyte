# Playground

For anyone who shapes the product demo, and for the AI agent they work with. Until MVP development is done, a
`playground/*` branch changes the product demo and nothing else.

## Starting

```sh
git checkout main && git pull
git checkout -b playground/<topic>      # e.g. playground/first-analysis
bun install
bun run design                          # http://localhost:4311/app
```

The demo has no backend: every screen runs on fixtures. `?scenario=empty|settled|busy` switches between
Eerste dag, Gewone dinsdag and Drukke week.

## What you may change

| Yes                                           | No (ask in the pull request)                                                      |
| --------------------------------------------- | --------------------------------------------------------------------------------- |
| `packages/ui/src/app/**`: the screens         | `packages/ui/src/app/marketing-sections/`                                         |
| `apps/design/src/app/**`: routes and fixtures | `packages/tokens`, colours, fonts, radii                                          |
| `apps/design/public/**`                       | `packages/ui/src/{ui,components,lib,marketing,brand}`                             |
| `packages/ui/test/**`                         | the landing page, the brand book, `apps/marketing`                                |
|                                               | every `package.json`, `bun.lock`, root config, `docs/`, `DESIGN.md`, `PRODUCT.md` |

A commit or push that touches the right-hand column is refused, and the message names the files.
`bun run scope` checks the whole branch at any time.

## Rules for the work

- Dutch only in the UI. [dutch-copy.md](./dutch-copy.md) has the words.
- Build from what exists:
  - the house table (`table/data-table.tsx`)
  - the dialogs (`common/form-dialog.tsx`)
  - the settings parts (`settings/form.tsx`)
  - the stores (`stores/`)
  - the fixtures' existing cast (Northwind Clothing Co.)
- No new colours or fonts. If a screen seems to need one, write that in the pull request.
- Every new area gets its three scenarios: empty, settled, busy.
- Before you open the pull request: `bun run check && bun run lint && bun run test`.

## Handing it over

Open a pull request against `main`. Describe what the feature is for and which parts you are sure of.
We treat it as your requirements, not as finished code. We merge it as-is when it already follows the
rules, or rebuild it to them.
