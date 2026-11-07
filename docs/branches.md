# Branches

Two long-lived branches, each deployed. Everything else is a short-lived branch that merges into `staging`.

| Branch                         | Deploys to | Takes changes from                                          | Merged with                                      |
| ------------------------------ | ---------- | ----------------------------------------------------------- | ------------------------------------------------ |
| `staging` (the default branch) | staging    | `<type>/<topic>` pull requests; a back-merge after a hotfix | squash; the back-merge as a merge commit         |
| `main`                         | production | a release pull request from `staging`; `hotfix/*`           | the release as a merge commit; a hotfix squashed |

Neither is pushed to directly. A pull request gets a preview (same-repo branches only; forks get no secrets).

## Branch names

`<type>/<topic>`, lowercase, words joined with `-`: `feat/system-health`, `fix/onboarding-redirect`,
`ci/backend-workflow`. A milestone step may lead the topic: `feat/m0-1-effect-catalog`.

| Type          | For                                                                                      |
| ------------- | ---------------------------------------------------------------------------------------- |
| `feat/`       | a new capability or screen                                                               |
| `fix/`        | a bug on `staging`                                                                       |
| `hotfix/`     | a bug in production that cannot wait for the next release; branches from `main`          |
| `refactor/`   | a change in structure, not behaviour                                                     |
| `perf/`       | a speed or size improvement                                                              |
| `test/`       | tests only                                                                               |
| `docs/`       | docs only                                                                                |
| `ci/`         | workflows, hooks, the scripts that gate them                                             |
| `chore/`      | dependencies, config, tooling                                                            |
| `playground/` | the founder's demo work, from the fork `goinsyte/insyte-playground` (docs/playground.md) |
| `renovate/`   | dependency updates opened by Renovate                                                    |

## The flow

**A change.** Branch from `staging`, open a pull request into `staging`, wait for CI and the preview, squash-merge.
The pull request title becomes the commit on `staging`, so it says what changes. The branch is deleted on merge.

```sh
git switch staging && git pull
git switch -c feat/system-health
git push -u origin feat/system-health      # then open the pull request into staging
```

**A release.** A pull request from `staging` into `main`, titled `Release YYYY-MM-DD`, merged with **Create a merge
commit**. Never squash it: a squash puts a commit on `main` that `staging` does not have, and the next release
conflicts with it. Merging deploys production.

**A hotfix.** Branch `hotfix/<topic>` from `main`, pull request into `main`, squash-merge (production deploys). Then the
same day, bring it back into `staging` so the next release does not lose it:

```sh
git switch main && git pull
git switch -c chore/back-merge-2026-11-20
git push -u origin chore/back-merge-2026-11-20     # pull request into staging, merged with a merge commit
```

Never open that pull request from `main` itself: the repo deletes a pull request's branch on merge and spares only the
default branch, so merging would delete `main`.

## What checks it

- `scripts/branches.ts`: the branch name on `git push` (lefthook), and in CI (`branches.yml`) the name and whether it
  may merge into its base: `main` takes only `staging` and `hotfix/*`.
- GitHub's free plan has no branch protection or rulesets on a private repo, so neither check can block a merge yet:
  a red check is the signal, and only maintainers merge (CODEOWNERS). The rulesets for both branches are ready for an
  upgrade to Team.
