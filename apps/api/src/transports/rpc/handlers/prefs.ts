import { PrefsRpcs } from "@insyte/api/rpc/PrefsRpcs"
import { PrefsService } from "@insyte/modules/prefs/PrefsService"
import { Effect } from "effect"

export const PrefsHandlers = PrefsRpcs.toLayer(Effect.gen(function*() {
  const prefs = yield* PrefsService
  return PrefsRpcs.of({
    "Prefs.get": () => prefs.get,
    "Prefs.patch": (input) => prefs.patch(input),
    "Prefs.recordVisit": (input) => prefs.recordVisit(input),
    "Views.list": () => prefs.views.list,
    "Views.save": (input) => prefs.views.save(input),
    "Views.update": (input) => prefs.views.update(input),
    "Views.rename": (input) => prefs.views.rename(input),
    "Views.remove": ({ id }) => prefs.views.remove(id),
    "Views.restore": ({ id }) => prefs.views.restore(id),
    "Views.togglePin": ({ id }) => prefs.views.togglePin(id),
    "Todos.list": () => prefs.todos.list,
    "Todos.add": (input) => prefs.todos.add(input),
    "Todos.toggle": ({ id }) => prefs.todos.toggle(id),
    "Todos.remove": ({ id }) => prefs.todos.remove(id),
    "Todos.restore": ({ id }) => prefs.todos.restore(id)
  })
}))
