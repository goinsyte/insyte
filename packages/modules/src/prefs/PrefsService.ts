import type { Db } from "@insyte/database/Db"
import type { Conflict, Invalid, NotFound } from "@insyte/domain/Errors"
import type { CurrentPrincipal } from "@insyte/domain/Principal"
import { Context, Effect, Layer } from "effect"
import { SqlError } from "effect/sql"
import type {
  AddTodo,
  PatchPref,
  PrefEntry,
  Prefs,
  Recent,
  RecordVisit,
  RenameView,
  SavedView,
  SaveView,
  Todo,
  UpdateView,
  ViewNameTaken
} from "./domain/Prefs.ts"
import * as PrefsUseCases from "./use-cases/prefs.ts"
import * as Todos from "./use-cases/todos.ts"
import * as Views from "./use-cases/views.ts"

type R = Db | CurrentPrincipal

const run = <A, E, Req>(effect: Effect.Effect<A, E | SqlError.SqlError, Req>) =>
  effect.pipe(Effect.catchIf(SqlError.isSqlError, Effect.die))
type ViewList = ReadonlyArray<SavedView>
type TodoList = ReadonlyArray<Todo>

/**
 * The prefs slice (M4.2): the member's preferences, saved views, to-dos and recents, as the request's principal.
 *
 * @effect-expect-leaking Db CurrentPrincipal
 */
export class PrefsService extends Context.Service<PrefsService, {
  readonly get: Effect.Effect<Prefs, never, R>
  readonly patch: (input: PatchPref) => Effect.Effect<PrefEntry, Invalid | Conflict, R>
  readonly recordVisit: (input: RecordVisit) => Effect.Effect<ReadonlyArray<Recent>, never, R>
  readonly views: {
    readonly list: Effect.Effect<ViewList, never, R>
    readonly save: (input: SaveView) => Effect.Effect<ViewList, Invalid | ViewNameTaken, R>
    readonly update: (input: UpdateView) => Effect.Effect<ViewList, NotFound, R>
    readonly rename: (input: RenameView) => Effect.Effect<ViewList, Invalid | NotFound | ViewNameTaken, R>
    readonly remove: (id: string) => Effect.Effect<ViewList, NotFound, R>
    readonly restore: (id: string) => Effect.Effect<ViewList, NotFound | ViewNameTaken, R>
    readonly togglePin: (id: string) => Effect.Effect<ViewList, NotFound, R>
  }
  readonly todos: {
    readonly list: Effect.Effect<TodoList, never, R>
    readonly add: (input: AddTodo) => Effect.Effect<TodoList, Invalid, R>
    readonly toggle: (id: string) => Effect.Effect<TodoList, NotFound, R>
    readonly remove: (id: string) => Effect.Effect<TodoList, NotFound, R>
    readonly restore: (id: string) => Effect.Effect<TodoList, NotFound, R>
  }
}>()("modules/PrefsService") {
  // A database that does not answer is a defect, as everywhere.
  static readonly layer = Layer.sync(PrefsService, () => ({
    get: run(PrefsUseCases.get()),
    patch: (input) => run(PrefsUseCases.patch(input)),
    recordVisit: (input) => run(PrefsUseCases.recordVisit(input)),
    views: {
      list: run(Views.list()),
      save: (input) => run(Views.save(input)),
      update: (input) => run(Views.update(input)),
      rename: (input) => run(Views.rename(input)),
      remove: (id) => run(Views.remove(id)),
      restore: (id) => run(Views.restore(id)),
      togglePin: (id) => run(Views.togglePin(id))
    },
    todos: {
      list: run(Todos.list()),
      add: (input) => run(Todos.add(input)),
      toggle: (id) => run(Todos.toggle(id)),
      remove: (id) => run(Todos.remove(id)),
      restore: (id) => run(Todos.restore(id))
    }
  }))
}
