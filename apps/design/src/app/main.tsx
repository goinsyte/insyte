// FIRST, before anything that reaches a screen: the fixtures, installed as this host's data source.
// See ADR-0026.
import "./install.ts"

/*
 * Then the app, as its own chunk. A static import would not do: in the production bundle Rollup
 * folds this file and the fixtures into one chunk and hoists the stores into chunks of their own,
 * which the browser evaluates first. A store that seeds itself from the data source at module
 * load (the notifications, the board) then reads a binding that is not installed yet, and every
 * page under `/app` throws before it renders. Dev serves each module separately, so it never
 * showed there. A dynamic import starts only after this module, and so the install, has run.
 */
void import("./boot.tsx")
