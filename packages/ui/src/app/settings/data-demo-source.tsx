import { PLACES, SUB_PROCESSORS } from "@insyte/domain/Residency"
import { type ReactNode, useEffect, useRef, useState } from "react"
import { useCan, useCurrentRole } from "../stores/access-store"
import { useSettings } from "../stores/settings-store"
import { useWorkspace } from "../stores/workspace-store"
import {
  type DataInventory,
  type DataRequests,
  type DataSource,
  DataSourceProvider,
  type ExportEntry,
  type ExportSchedule,
  type ShopperRequestEntry
} from "./data-source"

/*
 * Je gegevens in the design app: the counts from the demo workspace's stores where it has them and a believable
 * figure where it does not, the platform's own residency facts, the roles as the roles screen holds them, and
 * requests that live for the session. An export is "made" in a moment and downloads as a small note; a deletion
 * waits its seven days on screen and stops when asked; nothing leaves the browser.
 */

const DAY = 24 * 60 * 60 * 1000
const HOUR = 60 * 60 * 1000

/** A small file to stand in for the ZIP, so Downloaden does something you can see. */
const noteHref = (title: string) =>
  URL.createObjectURL(
    new Blob(
      [`${title}\n\nIn de echte console is dit een ZIP met elke tabel als CSV en als JSON. Deze demo maakt geen export.\n`],
      { type: "text/plain" }
    )
  )

/** The seeded rows, dated back from when the page opened. */
const seedExports = (SEEDED_AT: number): ReadonlyArray<ExportEntry> => [
  {
    id: "exp_2",
    source: "insyte",
    state: "ready",
    requestedBy: null,
    requestedAt: SEEDED_AT - 2 * DAY,
    readyAt: SEEDED_AT - 2 * DAY + 4 * 60 * 1000,
    href: noteHref("Automatische export"),
    sizeBytes: 18_400_000,
    expiresAt: SEEDED_AT + 5 * DAY
  },
  {
    id: "exp_1",
    source: "operator",
    state: "ready",
    requestedBy: "Sanne de Vries",
    requestedAt: SEEDED_AT - 23 * DAY,
    readyAt: SEEDED_AT - 23 * DAY + 3 * 60 * 1000,
    href: null,
    sizeBytes: 16_900_000,
    expiresAt: SEEDED_AT - 16 * DAY
  }
]

const seedShoppers = (SEEDED_AT: number): ReadonlyArray<ShopperRequestEntry> => [
  {
    id: "gdpr_3",
    kind: "access",
    source: "shopify",
    subject: "m.jansen@example.nl",
    state: "open",
    receivedAt: SEEDED_AT - 3 * HOUR,
    dueAt: SEEDED_AT + 30 * DAY,
    completedAt: null,
    href: null
  },
  {
    id: "gdpr_2",
    kind: "erasure",
    source: "shopify",
    subject: "Shopify-klant 7481920563",
    state: "done",
    receivedAt: SEEDED_AT - 9 * DAY,
    dueAt: SEEDED_AT + 21 * DAY,
    completedAt: SEEDED_AT - 9 * DAY + 2 * 60 * 1000,
    href: null
  },
  {
    id: "gdpr_1",
    kind: "access",
    source: "operator",
    subject: "lotte.bakker@example.nl",
    state: "done",
    receivedAt: SEEDED_AT - 14 * DAY,
    dueAt: SEEDED_AT + 16 * DAY,
    completedAt: SEEDED_AT - 14 * DAY + 5 * 60 * 1000,
    href: null
  }
]

export function DemoDataSource({ children }: { children: ReactNode }) {
  const account = useWorkspace((s) => s.account)
  const orders = useWorkspace((s) => s.orders.length)
  const tickets = useWorkspace((s) => s.tickets.length)
  const chargebacks = useWorkspace((s) => s.chargebacks.length)
  const members = useWorkspace((s) => s.members)
  const roles = useSettings((s) => s.roles)
  const role = useCurrentRole()
  const can = useCan()

  const [schedule, setSchedule] = useState<ExportSchedule>("weekly")
  const [exports, setExports] = useState(() => seedExports(Date.now()))
  const [shoppers, setShoppers] = useState(() => seedShoppers(Date.now()))
  const [deletion, setDeletion] = useState<DataRequests["deletion"]>(null)
  const timers = useRef<Array<ReturnType<typeof setTimeout>>>([])
  useEffect(() => () => timers.current.forEach(clearTimeout), [])
  const later = (run: () => void) => timers.current.push(setTimeout(run, 1800))

  const me = members.find((m) => m.id === "mem_elena")?.name ?? "Jij"
  const owner = role.id === "owner"

  const inventory: DataInventory = {
    categories: [
      { id: "customers", count: 4_812 },
      { id: "orders", count: Math.max(orders, 6_240) },
      { id: "products", count: 186 },
      { id: "support", count: Math.max(tickets, 1_930) },
      { id: "chats", count: 742 },
      { id: "returns", count: 318 },
      { id: "chargebacks", count: Math.max(chargebacks, 41) },
      { id: "files", count: 1_276 },
      { id: "team", count: members.length },
      { id: "log", count: 9_455 }
    ],
    countedAt: Date.now(),
    places: PLACES,
    subProcessors: SUB_PROCESSORS,
    roles: roles.map((r) => ({
      id: r.id,
      label: r.label,
      members: members.filter((m) => m.role === r.label).length,
      customers: r.levels.customers,
      orders: r.levels.orders,
      support: r.levels.support,
      exports: r.id === "owner" || r.specials["data.export"] === true,
      someStores: r.stores !== "all"
    }))
  }

  const source: DataSource = {
    workspaceName: account.workspace,
    inventory,
    requests: { schedule, exports, shoppers, deletion, shoppersHidden: false },
    owner,
    mayRequestAccess: can("data.export") && can("customers", 1),
    mayErase: can("customers", 3),
    requestExport: () => {
      const id = `exp_${Date.now()}`
      const at = Date.now()
      setExports((all) => [
        {
          id,
          source: "operator",
          state: "running",
          requestedBy: me,
          requestedAt: at,
          readyAt: null,
          href: null,
          sizeBytes: null,
          expiresAt: null
        },
        ...all
      ])
      later(() =>
        setExports((all) =>
          all.map((e) =>
            e.id === id
              ? {
                ...e,
                state: "ready",
                readyAt: Date.now(),
                href: noteHref(`Export van ${account.workspace}`),
                sizeBytes: 18_600_000,
                expiresAt: Date.now() + 7 * DAY
              }
              : e
          )
        )
      )
      return Promise.resolve(true)
    },
    setSchedule: (next) => {
      setSchedule(next)
      return Promise.resolve(true)
    },
    requestAccess: (by) => {
      const id = "requestId" in by ? by.requestId : `gdpr_${Date.now()}`
      if ("email" in by) {
        setShoppers((all) => [
          {
            id,
            kind: "access",
            source: "operator",
            subject: by.email,
            state: "running",
            receivedAt: Date.now(),
            dueAt: Date.now() + 30 * DAY,
            completedAt: null,
            href: null
          },
          ...all
        ])
      } else {
        setShoppers((all) => all.map((r) => (r.id === id ? { ...r, state: "running" } : r)))
      }
      later(() =>
        setShoppers((all) =>
          all.map((r) =>
            r.id === id
              ? {
                ...r,
                state: "done",
                completedAt: Date.now(),
                href: noteHref(`Gegevens van ${r.subject ?? "een klant"}`)
              }
              : r
          )
        )
      )
      return Promise.resolve(true)
    },
    requestErasure: (email) => {
      setShoppers((all) => [
        {
          id: `gdpr_${Date.now()}`,
          kind: "erasure",
          source: "operator",
          subject: email,
          state: "done",
          receivedAt: Date.now(),
          dueAt: Date.now() + 30 * DAY,
          completedAt: Date.now(),
          href: null
        },
        ...all
      ])
      return Promise.resolve(true)
    },
    requestDeletion: () => {
      setDeletion({ requestedAt: Date.now(), requestedBy: me, dueAt: Date.now() + 7 * DAY, stoppable: true })
      return Promise.resolve(true)
    },
    cancelDeletion: () => {
      setDeletion(null)
      return Promise.resolve(true)
    }
  }
  return <DataSourceProvider value={source}>{children}</DataSourceProvider>
}
