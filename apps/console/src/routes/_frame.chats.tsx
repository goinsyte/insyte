import { useAtomValue } from "@effect/atom-react"
import { Forbidden } from "@insyte/domain/Errors"
import type { ChatList } from "@insyte/modules/chats/domain/Chats"
import { DeniedPanel } from "@insyte/ui/app/access/denied"
import { ChatsPage } from "@insyte/ui/app/chats/chats-screen"
import { ChatsSourceProvider } from "@insyte/ui/app/chats/source"
import type { Level, Permission } from "@insyte/ui/app/lib/permissions"
import { PageSkeleton } from "@insyte/ui/app/loading/page-skeletons"
import { createFileRoute } from "@tanstack/react-router"
import { Effect, Option, Schema } from "effect"
import { AsyncResult, AtomRegistry } from "effect/reactivity"
import { useConsoleChatsSource } from "../chats/chats-source.tsx"
import { chatMessagesAtom, chatsAtom } from "../data/chats.ts"

/**
 * Chats (step 13.4b, M11 step 4): the reference's team chat over `Chats.*`, in the frame. `?id=` names the open
 * conversation, the first one where it names none; `?id=conv_dm_<member>` opens the direct thread with that teammate,
 * made the first time; `?message=` (a search hit) lands on that message once it is on screen. The loader reads the
 * conversations and the open one's newest messages on the server; until they are in, the reference's channel skeleton
 * stands in. A role that may not see the chats is told which permission it misses.
 */

type ChatsSearch = { id?: string; message?: string }

export const Route = createFileRoute("/_frame/chats")({
  validateSearch: (s: Record<string, unknown>): ChatsSearch => ({
    ...(typeof s["id"] === "string" ? { id: s["id"] } : {}),
    ...(typeof s["message"] === "string" ? { message: s["message"] } : {})
  }),
  head: () => ({ meta: [{ title: "Chats · Insyte" }] }),
  loaderDeps: ({ search }) => ({ id: search.id }),
  loader: async ({ context, deps }) => {
    // Mounted so the values survive until the registry is dehydrated into the document.
    context.registry.mount(chatsAtom)
    // Another `?id=` in the browser, with the list in: the page reads that conversation as it opens, no skeleton.
    if (typeof window !== "undefined" && Option.isSome(AsyncResult.value(context.registry.get(chatsAtom)))) return
    await Effect.runPromise(Effect.ignore(AtomRegistry.getResult(context.registry, chatsAtom)))
    // On the server the open conversation's newest messages go in the document too.
    if (typeof window !== "undefined") return
    const first = Option.getOrUndefined(AsyncResult.value(context.registry.get(chatsAtom)))?.conversations[0]?.id
    const id = deps.id !== undefined && !deps.id.startsWith("conv_dm_") ? deps.id : first
    if (id === undefined) return
    const page = chatMessagesAtom(id)
    context.registry.mount(page)
    await Effect.runPromise(Effect.ignore(AtomRegistry.getResult(context.registry, page)))
  },
  pendingComponent: Pending,
  component: ChatsRoute
})

function Pending() {
  return <PageSkeleton kind="channel" title="Chats" />
}

const isForbidden = Schema.is(Forbidden)

function ChatsRoute() {
  const result = useAtomValue(chatsAtom)
  // A refresh keeps showing the conversations as they were until the new list is in.
  const list = AsyncResult.isSuccess(result)
    ? result.value
    : AsyncResult.isWaiting(result)
    ? Option.getOrUndefined(AsyncResult.value(result))
    : undefined
  if (list !== undefined) return <Loaded list={list} />
  const refused = AsyncResult.isFailure(result)
    ? result.cause.reasons.find((r) => r._tag === "Fail" && isForbidden(r.error))
    : undefined
  if (refused !== undefined && refused._tag === "Fail" && isForbidden(refused.error)) {
    return (
      <DeniedPanel
        title="Je rol kan de chats niet zien"
        denial={{
          perm: refused.error.permission as Permission,
          arg: refused.error.level as Level,
          roleLabel: refused.error.roleLabel,
          grantingRoles: [],
          granters: [],
          request: { state: "none" },
          action: "Chats.list"
        }}
      />
    )
  }
  return <Pending />
}

function Loaded({ list }: { list: ChatList }) {
  const source = useConsoleChatsSource(list)
  return (
    <ChatsSourceProvider value={source}>
      <ChatsPage />
    </ChatsSourceProvider>
  )
}
