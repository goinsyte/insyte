import { Conflict, Invalid, NotFound } from "@insyte/domain/Errors"
import {
  AddTodo,
  ItemRef,
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
} from "@insyte/modules/prefs/domain/Prefs"
import { Schema } from "effect"
import { Rpc, RpcGroup } from "effect/rpc"
import { Authenticated } from "./Authenticated.ts"
import { Member } from "./Member.ts"
import { WithDb } from "./WithDb.ts"

const Views = Schema.Array(SavedView)
const Todos = Schema.Array(Todo)

/**
 * The member's own corner (M4.2): preferences, saved views, to-dos and recents. Every member, each their own; never
 * reachable by a key (the catalogue has no area for it, so no `/v1` endpoint and no MCP tool).
 */
export class PrefsRpcs extends RpcGroup.make(
  Rpc.make("Prefs.get", { success: Prefs }),
  Rpc.make("Prefs.patch", { payload: PatchPref, success: PrefEntry, error: Schema.Union([Invalid, Conflict]) }),
  Rpc.make("Prefs.recordVisit", { payload: RecordVisit, success: Schema.Array(Recent) }),
  Rpc.make("Views.list", { success: Views }),
  Rpc.make("Views.save", { payload: SaveView, success: Views, error: Schema.Union([Invalid, ViewNameTaken]) }),
  Rpc.make("Views.update", { payload: UpdateView, success: Views, error: NotFound }),
  Rpc.make("Views.rename", {
    payload: RenameView,
    success: Views,
    error: Schema.Union([Invalid, NotFound, ViewNameTaken])
  }),
  Rpc.make("Views.remove", { payload: ItemRef, success: Views, error: NotFound }),
  Rpc.make("Views.restore", { payload: ItemRef, success: Views, error: Schema.Union([NotFound, ViewNameTaken]) }),
  Rpc.make("Views.togglePin", { payload: ItemRef, success: Views, error: NotFound }),
  Rpc.make("Todos.list", { success: Todos }),
  Rpc.make("Todos.add", { payload: AddTodo, success: Todos, error: Invalid }),
  Rpc.make("Todos.toggle", { payload: ItemRef, success: Todos, error: NotFound }),
  Rpc.make("Todos.remove", { payload: ItemRef, success: Todos, error: NotFound }),
  Rpc.make("Todos.restore", { payload: ItemRef, success: Todos, error: NotFound })
)
  // Innermost first: `Member` needs the person (`Authenticated`) and the connection (`WithDb`) around it.
  .middleware(Member)
  .middleware(Authenticated)
  .middleware(WithDb)
{}
