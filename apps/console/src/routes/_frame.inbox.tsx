import { useAtomValue } from "@effect/atom-react"
import { Forbidden } from "@insyte/domain/Errors"
import type { MailboxView, ThreadList } from "@insyte/modules/inbox/domain/Inbox"
import { DeniedPanel } from "@insyte/ui/app/access/denied"
import { ConnectMailboxDialog } from "@insyte/ui/app/inbox/connect-mailbox-dialog"
import { InboxPage } from "@insyte/ui/app/inbox/inbox-screen"
import { type Folder, type InboxSearch, InboxSourceProvider } from "@insyte/ui/app/inbox/source"
import type { Level, Permission } from "@insyte/ui/app/lib/permissions"
import { PageSkeleton } from "@insyte/ui/app/loading/page-skeletons"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { Effect, Option, Schema } from "effect"
import { AsyncResult, AtomRegistry } from "effect/reactivity"
import { useCallback, useState } from "react"
import { mailboxesAtom, threadAtom, threadsAtom } from "../data/inbox.ts"
import { useGate } from "../frame/refusals.ts"
import { useConnectMailbox, useConsoleInboxSource } from "../inbox/inbox-source.tsx"

/**
 * Inbox (step 13.2b, M11 step 2): the reference's index and letter over `Threads.*`, in the frame. `?folder=` and
 * `?mailbox=` are the area panel's cuts, `?thread=` the open thread (the first of the list where it names none), and
 * `?connect=mailbox` opens "Mailbox koppelen" (the panel's "Kanaal koppelen"). The loader reads the threads and the
 * mailboxes on the server, and the open thread's messages too; until they are in, the reference's split skeleton
 * stands in. A role that may not see the inbox is told which permission it misses.
 */

type ConsoleInboxSearch = InboxSearch & { connect?: "mailbox" | undefined }

const FOLDERS: ReadonlyArray<Folder> = ["all", "unassigned", "mine", "linked", "archive", "trash", "spam"]

const text = (raw: unknown) => (typeof raw === "string" && raw !== "" ? raw : undefined)

export const Route = createFileRoute("/_frame/inbox")({
  validateSearch: (s: Record<string, unknown>): ConsoleInboxSearch => {
    const folder = FOLDERS.find((f) => f === s["folder"])
    const thread = text(s["thread"])
    const mailbox = text(s["mailbox"])
    return {
      ...(folder === undefined || folder === "all" ? {} : { folder }),
      ...(thread === undefined ? {} : { thread }),
      ...(mailbox === undefined ? {} : { mailbox }),
      ...(s["connect"] === "mailbox" ? { connect: "mailbox" as const } : {})
    }
  },
  head: () => ({ meta: [{ title: "Inbox · Insyte" }] }),
  loaderDeps: ({ search }) => ({ thread: search.thread }),
  loader: async ({ context, deps }) => {
    // Mounted so the values survive until the registry is dehydrated into the document.
    context.registry.mount(threadsAtom)
    context.registry.mount(mailboxesAtom)
    // Another `?thread=` in the browser, with the list in: the letter reads its thread as it opens, no skeleton.
    if (typeof window !== "undefined" && Option.isSome(AsyncResult.value(context.registry.get(threadsAtom)))) return
    await Effect.runPromise(
      Effect.all([
        Effect.ignore(AtomRegistry.getResult(context.registry, threadsAtom)),
        Effect.ignore(AtomRegistry.getResult(context.registry, mailboxesAtom))
      ], { concurrency: "unbounded" })
    )
    // On the server the open thread's messages go in the document too: the one named, or the newest in the inbox.
    if (typeof window !== "undefined") return
    const list = Option.getOrUndefined(AsyncResult.value(context.registry.get(threadsAtom)))
    const now = Date.now()
    const id = deps.thread ??
      list?.rows.find((r) =>
        r.archivedAt === null && r.spamAt === null && r.deletedAt === null &&
        (r.snoozedUntil === null || r.snoozedUntil <= now)
      )?.id
    if (id === undefined) return
    const open = threadAtom(id)
    context.registry.mount(open)
    await Effect.runPromise(Effect.ignore(AtomRegistry.getResult(context.registry, open)))
  },
  pendingComponent: Pending,
  component: InboxRoute
})

function Pending() {
  return <PageSkeleton kind="split" title="Inbox" />
}

const isForbidden = Schema.is(Forbidden)

function InboxRoute() {
  const result = useAtomValue(threadsAtom)
  const mailboxes = Option.getOrUndefined(AsyncResult.value(useAtomValue(mailboxesAtom)))
  // A refresh keeps showing the list as it was until the new one is in.
  const list = AsyncResult.isSuccess(result)
    ? result.value
    : AsyncResult.isWaiting(result)
    ? Option.getOrUndefined(AsyncResult.value(result))
    : undefined
  if (list !== undefined) return <Loaded list={list} mailboxes={mailboxes ?? []} />
  const refused = AsyncResult.isFailure(result)
    ? result.cause.reasons.find((r) => r._tag === "Fail" && isForbidden(r.error))
    : undefined
  if (refused !== undefined && refused._tag === "Fail" && isForbidden(refused.error)) {
    return (
      <DeniedPanel
        title="Je rol kan de inbox niet zien"
        denial={{
          perm: refused.error.permission as Permission,
          arg: refused.error.level as Level,
          roleLabel: refused.error.roleLabel,
          grantingRoles: [],
          granters: [],
          request: { state: "none" },
          action: "Threads.list"
        }}
      />
    )
  }
  return <Pending />
}

function Loaded({ list, mailboxes }: { list: ThreadList; mailboxes: ReadonlyArray<MailboxView> }) {
  const { connect: asked, ...search } = Route.useSearch()
  const navigate = Route.useNavigate()
  const toTicket = useNavigate()
  const [connecting, setConnecting] = useState(false)
  const connect = useCallback(() => setConnecting(true), [])
  const go = useCallback((next: InboxSearch) => void navigate({ search: next }), [navigate])
  const openTicket = useCallback((id: string) => void toTicket({ to: "/tickets", search: { ticket: id } }), [toTicket])
  const source = useConsoleInboxSource(list, mailboxes, search, go, connect, openTicket)
  const manage = useGate("support", 3)
  const onConnect = useConnectMailbox()
  return (
    <InboxSourceProvider value={source}>
      <InboxPage />
      <ConnectMailboxDialog
        open={connecting || asked === "mailbox"}
        onOpenChange={(open) => {
          setConnecting(open)
          if (!open && asked === "mailbox") void navigate({ search: (s) => ({ ...s, connect: undefined }) })
        }}
        gate={manage}
        onConnect={onConnect}
      />
    </InboxSourceProvider>
  )
}
